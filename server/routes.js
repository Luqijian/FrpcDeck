import {
  createDefaultConfig,
  generateToml,
  hasErrors,
  normalizeConfig,
  parseConfigText,
  validateConfig,
} from './config.js';
import { SESSION_COOKIE } from './auth.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const APP_VERSION = require('../package.json').version;

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/status',
  '/api/auth/login',
  '/api/auth/setup',
  '/api/auth/logout',
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function apiError(status, code, message, details) {
  return new ApiError(status, code, message, details);
}

function issueSummary(issues) {
  return issues.filter((item) => item.level === 'error').map((item) => item.message).join('；');
}

function bodyObject(request) {
  return request.body && typeof request.body === 'object' ? request.body : {};
}

function safeFilename(value, fallback) {
  const name = String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_');
  return name || fallback;
}

function originAllowed(request, extraOrigins) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const allowed = new Set(extraOrigins);
  if (request.headers.host) allowed.add(request.headers.host);
  const forwardedHost = request.headers['x-forwarded-host'];
  if (forwardedHost) {
    for (const host of String(forwardedHost).split(',')) allowed.add(host.trim());
  }
  try {
    return allowed.has(new URL(origin).host);
  } catch {
    return false;
  }
}

function parseCookies(request) {
  return request.cookies || {};
}

export async function registerRoutes(app, services) {
  const { store, auth, frpc, startedAt } = services;
  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const loginAttempts = new Map();
  const LOGIN_WINDOW_MS = 10 * 60 * 1000;
  const LOGIN_MAX_ATTEMPTS = 8;
  const LOGIN_BLOCK_MS = 10 * 60 * 1000;

  function getClientKey(request) {
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  function checkLoginLimit(request) {
    const key = getClientKey(request);
    const now = Date.now();
    const bucket = loginAttempts.get(key);
    if (!bucket) return { allowed: true, key };
    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      return {
        allowed: false,
        key,
        retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
      };
    }
    if (now - bucket.firstAt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(key);
      return { allowed: true, key };
    }
    if (bucket.count >= LOGIN_MAX_ATTEMPTS) {
      bucket.blockedUntil = now + LOGIN_BLOCK_MS;
      return { allowed: false, key, retryAfter: Math.ceil(LOGIN_BLOCK_MS / 1000) };
    }
    return { allowed: true, key };
  }

  function recordLoginFailure(key) {
    const now = Date.now();
    const bucket = loginAttempts.get(key) || { count: 0, firstAt: now, blockedUntil: 0 };
    if (now - bucket.firstAt > LOGIN_WINDOW_MS) {
      bucket.count = 0;
      bucket.firstAt = now;
    }
    bucket.count += 1;
    if (bucket.count >= LOGIN_MAX_ATTEMPTS) bucket.blockedUntil = now + LOGIN_BLOCK_MS;
    loginAttempts.set(key, bucket);
    if (loginAttempts.size > 2000) {
      for (const [mapKey, item] of loginAttempts) {
        if (Date.now() - item.firstAt > LOGIN_WINDOW_MS * 2) loginAttempts.delete(mapKey);
      }
    }
  }

  async function getRequestSession(request) {
    const token = parseCookies(request)[SESSION_COOKIE];
    return auth.verifySession(token);
  }

  function setSessionCookie(reply) {
    reply.setCookie(SESSION_COOKIE, auth.issueSession(), auth.cookieOptions());
  }

  app.addHook('preHandler', async (request, reply) => {
    const pathname = String(request.raw.url || '').split('?')[0];
    if (!pathname.startsWith('/api/')) return;
    if (MUTATING_METHODS.has(request.method)) {
      if (request.headers['x-frpcdeck'] !== '1') {
        throw apiError(403, 'csrf', '请求缺少 X-FrpcDeck 标头');
      }
      if (!originAllowed(request, allowedOrigins)) {
        throw apiError(403, 'origin', '请求来源不被允许');
      }
    }
    if (PUBLIC_PATHS.has(pathname)) return;
    const session = await getRequestSession(request);
    if (!session) throw apiError(401, 'unauthorized', '登录状态已失效，请重新登录');
    request.user = session;
  });

  app.get('/api/health', async () => ({
    ok: true,
    app: 'frpcdeck',
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    frpc: {
      available: frpc.state.binAvailable,
      version: frpc.state.version,
    },
  }));

  // ---------------------------------------------------------------- auth ----
  app.get('/api/auth/status', async (request) => {
    const session = await getRequestSession(request);
    return {
      ...auth.status(),
      authenticated: Boolean(session),
      user: session?.u || null,
    };
  });

  app.post('/api/auth/setup', async (request, reply) => {
    if (auth.initialized) throw apiError(409, 'already-initialized', '管理员账户已经初始化');
    const body = bodyObject(request);
    try {
      await auth.setup(String(body.username || '').trim(), String(body.password || ''));
    } catch (error) {
      throw apiError(400, 'invalid-credentials', error.message);
    }
    setSessionCookie(reply);
    return { ...auth.status(), authenticated: true, user: auth.username };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const limit = checkLoginLimit(request);
    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfter));
      throw apiError(429, 'rate-limited', `尝试次数过多，请在 ${limit.retryAfter} 秒后重试`);
    }
    const body = bodyObject(request);
    const result = auth.login(String(body.username || ''), String(body.password || ''));
    if (!result.ok) {
      recordLoginFailure(limit.key);
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (result.reason === 'not-initialized') {
        throw apiError(409, 'not-initialized', '管理员账户尚未初始化');
      }
      throw apiError(401, 'invalid-credentials', '用户名或密码不正确');
    }
    loginAttempts.delete(limit.key);
    setSessionCookie(reply);
    return { ...auth.status(), authenticated: true, user: auth.username };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/password', async (request, reply) => {
    const body = bodyObject(request);
    try {
      await auth.changePassword(String(body.currentPassword || ''), String(body.password || ''));
    } catch (error) {
      if (auth.envManaged) throw apiError(409, 'env-managed', error.message);
      throw apiError(400, 'password-change-failed', error.message);
    }
    setSessionCookie(reply);
    return { ...auth.status(), authenticated: true, user: auth.username };
  });

  // ----------------------------------------------------------- bootstrap ----
  app.get('/api/bootstrap', async () => ({
    config: store.config,
    savedAt: store.savedAt,
    settings: store.settings,
    auth: auth.status(),
    runtime: frpc.runtime(),
    frpc: {
      bin: frpc.bin,
      available: frpc.state.binAvailable,
      version: frpc.state.version,
      configPath: frpc.configPath,
    },
    app: {
      name: 'FrpcDeck',
      version: APP_VERSION,
      node: process.version,
    },
    warnings: [...store.warnings, ...auth.warnings],
  }));

  // -------------------------------------------------------------- config ----
  async function validateForApply(config) {
    const normalized = normalizeConfig(config);
    const issues = validateConfig(normalized);
    if (hasErrors(issues)) {
      throw apiError(422, 'validation-failed', issueSummary(issues) || '配置校验失败', { issues });
    }
    const toml = generateToml(normalized);
    const verify = await frpc.validateToml(toml);
    if (!verify.ok && !verify.unavailable) {
      issues.push({
        path: 'frpc',
        level: 'error',
        label: 'frpc 校验',
        message: verify.message || 'frpc 拒绝了该配置',
      });
      throw apiError(422, 'frpc-rejected', verify.message || 'frpc 拒绝了该配置', {
        issues,
        output: verify.output,
      });
    }
    return { normalized, issues, toml, verify };
  }

  async function applyConfig(config, { restart = true, note = '应用新配置' } = {}) {
    const { normalized, issues, toml, verify } = await validateForApply(config);
    const wasActive = ['running', 'starting'].includes(frpc.state.status);
    const templateMode = Boolean(normalized.rawTemplate.trim());
    const saved = await store.persistConfig(normalized, { note });
    const apply = { attempted: false, ok: true, error: '' };

    if (restart) {
      if (!templateMode && !normalized.serverAddr) {
        if (wasActive) {
          apply.attempted = true;
          await frpc.stop({ quiet: true });
        }
      } else {
        apply.attempted = true;
        try {
          if (wasActive) await frpc.restart();
          else await frpc.start();
          apply.ok = true;
        } catch (error) {
          apply.ok = false;
          apply.error = error.message;
        }
      }
    }

    return {
      config: saved.config,
      savedAt: saved.savedAt,
      toml: saved.toml,
      issues,
      verify: {
        ok: verify.ok,
        unavailable: verify.unavailable,
        output: verify.output,
      },
      apply,
      restartRequired: !restart && wasActive,
      runtime: frpc.runtime(),
    };
  }

  app.get('/api/config', async () => {
    const issues = validateConfig(store.config);
    return {
      config: store.config,
      savedAt: store.savedAt,
      issues,
      toml: generateToml(store.config),
    };
  });

  app.get('/api/config/toml', async (request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return generateToml(store.config);
  });

  app.get('/api/config/download', async (request, reply) => {
    const format = String(request.query?.format || 'toml');
    if (format === 'json') {
      reply.type('application/json');
      reply.header('Content-Disposition', 'attachment; filename="frpcdeck-config.json"');
      return `${JSON.stringify({ version: 1, savedAt: store.savedAt, config: store.config }, null, 2)}\n`;
    }
    reply.type('text/plain; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="frpc.toml"');
    return generateToml(store.config);
  });

  app.post('/api/config/validate', async (request) => {
    const body = bodyObject(request);
    const normalized = normalizeConfig(body.config || {});
    const issues = validateConfig(normalized);
    const toml = generateToml(normalized);
    let verify = { ok: true, unavailable: true, output: '', message: '' };
    let frpcIssues = [];
    if (!hasErrors(issues)) {
      verify = await frpc.validateToml(toml);
      if (!verify.ok && !verify.unavailable) {
        frpcIssues = [{
          path: 'frpc',
          level: 'error',
          label: 'frpc 校验',
          message: verify.message || 'frpc 拒绝了该配置',
        }];
      }
    }
    return {
      ok: !hasErrors(issues) && frpcIssues.length === 0,
      issues: [...issues, ...frpcIssues],
      toml,
      verify: { ok: verify.ok, unavailable: verify.unavailable, output: verify.output },
    };
  });

  function preserveAdminInterface(config, raw) {
    const current = store.config?.webServer || {};
    const explicit = raw && typeof raw === 'object' && raw.webServer && typeof raw.webServer === 'object'
      ? raw.webServer
      : null;
    if (!explicit) {
      config.webServer = { ...current };
      return config;
    }
    const merged = { ...current };
    for (const key of ['addr', 'port', 'user', 'password', 'assetsDir', 'pprofEnable']) {
      if (Object.prototype.hasOwnProperty.call(explicit, key)) {
        merged[key] = config.webServer[key];
      }
    }
    config.webServer = merged;
    return config;
  }

  function adoptTemplateBase(parsed) {
    if (parsed.format !== 'template' || !store.config) return parsed;
    parsed.config = normalizeConfig({
      ...store.config,
      rawTemplate: parsed.config.rawTemplate,
      webServer: store.config.webServer,
    });
    parsed.raw = null;
    return parsed;
  }

  app.post('/api/config/import', async (request) => {
    const body = bodyObject(request);
    let parsed;
    try {
      parsed = parseConfigText(String(body.content || ''), String(body.filename || ''));
    } catch (error) {
      throw apiError(400, 'parse-failed', error.message);
    }
    adoptTemplateBase(parsed);
    preserveAdminInterface(parsed.config, parsed.raw);
    const issues = validateConfig(parsed.config);
    return {
      config: parsed.config,
      format: parsed.format,
      warnings: parsed.warnings || [],
      issues,
      toml: generateToml(parsed.config),
    };
  });

  app.put('/api/config', async (request) => {
    const body = bodyObject(request);
    if (!body.config || typeof body.config !== 'object') {
      throw apiError(400, 'invalid-body', '缺少 config 对象');
    }
    return applyConfig(body.config, {
      restart: body.restart !== false,
      note: '保存配置',
    });
  });

  app.put('/api/config/raw', async (request) => {
    const body = bodyObject(request);
    let parsed;
    try {
      parsed = parseConfigText(String(body.content || ''), 'frpc.toml');
    } catch (error) {
      throw apiError(400, 'parse-failed', error.message);
    }
    adoptTemplateBase(parsed);
    preserveAdminInterface(parsed.config, parsed.raw);
    const result = await applyConfig(parsed.config, {
      restart: body.restart !== false,
      note: '应用 TOML 编辑',
    });
    return { ...result, format: parsed.format, warnings: parsed.warnings || [] };
  });

  app.post('/api/config/reset', async (request) => {
    const body = bodyObject(request);
    if (String(body.confirm || '') !== 'RESET') {
      throw apiError(400, 'confirmation-required', '请输入 RESET 确认重置');
    }
    // Keep the current admin credentials so the monitoring API keeps working.
    const previousWebServer = store.config?.webServer || {};
    const fresh = createDefaultConfig();
    fresh.webServer = { ...fresh.webServer, ...previousWebServer };
    const wasActive = ['running', 'starting'].includes(frpc.state.status);
    const saved = await store.persistConfig(fresh, { note: '重置配置' });
    if (wasActive) await frpc.stop({ quiet: true });
    return {
      config: saved.config,
      savedAt: saved.savedAt,
      toml: saved.toml,
      issues: validateConfig(saved.config),
      verify: { ok: true, unavailable: !frpc.state.binAvailable, output: '' },
      apply: { attempted: wasActive, ok: true, error: '' },
      restartRequired: false,
      runtime: frpc.runtime(),
    };
  });

  // ------------------------------------------------------------- runtime ----
  app.get('/api/runtime', async () => frpc.runtime());

  app.get('/api/logs', async (request) => {
    const limit = Number(request.query?.limit || 500);
    return { logs: frpc.history(limit), lastSeq: frpc.seq };
  });

  app.get('/api/logs/download', async (request, reply) => {
    const text = frpc.history(2000)
      .map((item) => `${item.t} [${item.level.toUpperCase()}] ${item.text}`)
      .join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    reply.type('text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="frpc-${stamp}.log"`);
    return text ? `${text}\n` : '';
  });

  app.post('/api/runtime/:action', async (request) => {
    const action = String(request.params?.action || '');
    if (!['start', 'stop', 'restart'].includes(action)) {
      throw apiError(404, 'unknown-action', '未知的运行操作');
    }
    if (action === 'start' || action === 'restart') {
      const config = store.config;
      const issues = validateConfig(config);
      if (hasErrors(issues)) {
        throw apiError(422, 'validation-failed', issueSummary(issues) || '配置有误，无法启动', { issues });
      }
      if (!config.serverAddr) throw apiError(422, 'missing-server', '请先配置 frps 服务器地址');
      const verify = await frpc.validateFile(frpc.configPath);
      if (!verify.ok && !verify.unavailable) {
        throw apiError(422, 'frpc-rejected', verify.message || 'frpc 拒绝了当前配置', { output: verify.output });
      }
    }
    if (action === 'stop') {
      await frpc.stop();
      return { ok: true, runtime: frpc.runtime() };
    }
    try {
      if (action === 'restart') await frpc.restart();
      else await frpc.start();
    } catch (error) {
      throw apiError(500, 'runtime-failed', error.message, { runtime: frpc.runtime() });
    }
    return { ok: true, runtime: frpc.runtime() };
  });

  // ------------------------------------------------------------------ SSE ----
  app.get('/api/events', { compress: false }, async (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const send = (event, data) => {
      if (res.writableEnded || res.destroyed) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // The client is gone; cleanup is driven by the close handler.
      }
    };

    send('hello', {
      logs: frpc.history(300),
      runtime: frpc.runtime(),
      lastSeq: frpc.seq,
    });

    const onLog = (entry) => send('log', entry);
    const onState = (runtime) => send('state', runtime);
    frpc.on('log', onLog);
    frpc.on('state', onState);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n');
    }, 20000);
    heartbeat.unref?.();

    const cleanup = () => {
      clearInterval(heartbeat);
      frpc.off('log', onLog);
      frpc.off('state', onState);
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
    res.on('error', cleanup);
    return reply;
  });

  // ------------------------------------------------------------- settings ----
  app.get('/api/settings', async () => ({ settings: store.settings }));

  app.put('/api/settings', async (request) => {
    const body = bodyObject(request);
    const settings = await store.saveSettings(body);
    return { settings };
  });

  // -------------------------------------------------------------- backups ----
  app.get('/api/backups', async () => ({ backups: await store.listBackups() }));

  app.post('/api/backups', async () => {
    const backup = await store.createBackup(store.config, '手动备份');
    return { ok: true, backup };
  });

  app.delete('/api/backups/:id', async (request) => {
    await store.deleteBackup(request.params.id);
    return { ok: true };
  });

  app.get('/api/backups/:id/download', async (request, reply) => {
    const backup = await store.readBackup(request.params.id);
    reply.type('application/json');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${safeFilename(backup.id, 'backup.json')}"`,
    );
    return `${JSON.stringify(backup, null, 2)}\n`;
  });

  app.post('/api/backups/:id/restore', async (request) => {
    let backup;
    try {
      backup = await store.readBackup(request.params.id);
    } catch (error) {
      throw apiError(404, 'backup-not-found', error.message);
    }
    const result = await applyConfig(backup.config, {
      restart: true,
      note: `恢复备份 ${backup.id}`,
    });
    return { ...result, restoredFrom: backup.id };
  });

  app.setNotFoundHandler(async (request, reply) => {
    const requestPath = String(request.raw.url || '').split('?')[0];
    if (requestPath === '/api' || requestPath.startsWith('/api/')) {
      reply.code(404).type('application/json');
      return { error: { code: 'not-found', message: '接口不存在' } };
    }
    if (services.hasFrontend && services.sendIndex) {
      const pathname = String(request.raw.url || '').split('?')[0];
      const acceptsHtml = String(request.headers.accept || '').includes('text/html');
      const looksLikeFile = /\.[a-z0-9]+$/i.test(pathname) && pathname !== '/';
      if ((acceptsHtml || !looksLikeFile) && request.method === 'GET') {
        return services.sendIndex(reply);
      }
      reply.code(404).type('application/json');
      return { error: { code: 'not-found', message: '资源不存在' } };
    }
    if (request.method === 'GET') {
      reply.type('text/html; charset=utf-8');
      return '<!doctype html><meta charset="utf-8"><title>FrpcDeck</title><p>前端尚未构建，请运行 <code>pnpm build</code>，开发模式请访问 Vite 提供的地址。</p>';
    }
    reply.code(404);
    return { error: { code: 'not-found', message: '资源不存在' } };
  });

  app.setErrorHandler((error, request, reply) => {
    const status = Number(error.status) || Number(error.statusCode) || 500;
    if (status >= 500) request.log.error(error);
    if (reply.raw.headersSent) return;
    reply.code(status).type('application/json').send({
      error: {
        code: error.code || (status === 500 ? 'internal' : 'request-failed'),
        message: status === 500 && !error.code ? '服务器内部错误' : error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  });
}
