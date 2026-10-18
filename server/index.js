import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyCompress from '@fastify/compress';
import crypto from 'node:crypto';
import { AuthManager } from './auth.js';
import { InstanceManager } from './instances.js';
import { registerRoutes } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function loadDotEnv() {
  try {
    const text = await fsp.readFile(path.join(projectRoot, '.env'), 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`读取 .env 失败：${error.message}`);
  }
}

function boolEnv(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function loadOrCreateSecret(dataDir) {
  const file = path.join(dataDir, 'session.key');
  try {
    const value = (await fsp.readFile(file, 'utf8')).trim();
    if (value.length >= 32) return value;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const value = crypto.randomBytes(32).toString('hex');
  await fsp.mkdir(dataDir, { recursive: true, mode: 0o700 });
  await fsp.writeFile(file, value, { mode: 0o600 });
  return value;
}

async function main() {
  await loadDotEnv();

  const port = Number(process.env.PORT) || 8080;
  const host = process.env.HOST || '0.0.0.0';
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(projectRoot, 'data'));
  const staticDir = path.resolve(process.env.STATIC_DIR || path.join(projectRoot, 'dist'));
  const frpcBin = process.env.FRPC_BIN || 'frpc';
  const startedAt = Date.now();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: boolEnv(process.env.TRUST_PROXY, false),
    bodyLimit: 3 * 1024 * 1024,
  });

  app.addHook('onRequest', async (request, reply) => {
    if (String(request.raw.url || '').startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const pathname = String(request.raw.url || '').split('?')[0];
    if (!pathname.startsWith('/api/')) {
      if (pathname.startsWith('/assets/')) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        reply.header('Cache-Control', 'no-cache');
      }
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (request.protocol === 'https') {
      reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    }
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
    );
    return payload;
  });

  await app.register(fastifyCompress, { global: true, threshold: 1024 });
  await app.register(fastifyCookie);

  const manager = await new InstanceManager({ dataDir, frpcBin }).init();
  const auth = await new AuthManager({
    dataDir,
    secret: await loadOrCreateSecret(dataDir),
    cookieSecure: boolEnv(process.env.COOKIE_SECURE, false),
  }).init();
  if (auth.initialPassword) {
    console.warn('');
    console.warn('============================================================');
    console.warn(' FrpcDeck 首次启动，已生成管理员账户');
    console.warn(` 用户名: ${auth.username}`);
    console.warn(` 初始密码: ${auth.initialPassword}`);
    console.warn(' 此密码只显示一次，登录后必须立即修改。');
    console.warn('============================================================');
    console.warn('');
  }

  const hasFrontend = fs.existsSync(path.join(staticDir, 'index.html'));
  const sendIndex = (reply) => {
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  };

  await registerRoutes(app, {
    manager,
    auth,
    startedAt,
    hasFrontend,
    sendIndex,
  });

  if (hasFrontend) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
      index: false,
      cacheControl: false,
    });
    app.get('/', async (request, reply) => sendIndex(reply));
  } else {
    app.get('/', async (request, reply) => {
      reply.type('text/html; charset=utf-8');
      return '<!doctype html><meta charset="utf-8"><title>FrpcDeck</title><p>前端尚未构建。请运行 <code>pnpm build</code>，开发模式请访问 Vite 地址。</p>';
    });
    app.log.warn('未找到前端构建产物，仅提供 API。开发请运行 pnpm dev。');
  }

  for (const warning of [...manager.warnings, ...auth.warnings]) {
    app.log.warn(warning);
  }

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
    return;
  }

  const current = manager.current();
  app.log.info(`FrpcDeck 已启动: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  app.log.info(`数据目录: ${dataDir}`);
  if (current?.frpc.state.binAvailable) {
    app.log.info(`frpc: ${current.frpc.state.version} (${frpcBin})`);
  } else {
    app.log.warn(`未找到 frpc 可执行文件：${frpcBin}`);
  }
  app.log.info(`已加载 ${manager.instances.size} 个实例`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`收到 ${signal}，正在关闭...`);
    const forceTimer = setTimeout(() => process.exit(1), 12000);
    forceTimer.unref();
    try {
      await manager.dispose();
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  app.log.info(`监听地址 ${host}:${port}`);
}

main().catch((error) => {
  console.error('FrpcDeck 启动失败：', error);
  process.exit(1);
});
