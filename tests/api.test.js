import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForHealth(base) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('测试服务器启动超时');
}

async function waitForInitialPassword() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const match = serverLog.match(/初始密码:\s*(\S+)/);
    if (match) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('未在日志中找到初始密码');
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frpcdeck-test-'));
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    DATA_DIR: dataDir,
    FRPC_BIN: path.join(dataDir, 'missing-frpc-binary'),
    LOG_LEVEL: 'silent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
child.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});

after(async () => {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 4000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
});

await waitForHealth(base);
const initialPassword = await waitForInitialPassword();

let cookie = '';

async function request(pathname, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(method) ? { 'X-FrpcDeck': '1' } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, data, setCookie: response.headers.get('set-cookie') || '' };
}

async function login(username, password) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { username, password },
  });
  assert.equal(result.response.status, 200);
  cookie = result.setCookie.split(';')[0];
  return result;
}

test('health and initial auth state', async () => {
  const health = await request('/api/health', { auth: false });
  assert.equal(health.response.status, 200);
  assert.equal(health.data.ok, true);
  assert.equal(health.data.version, JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
  assert.equal(health.data.frpc.available, false);

  const status = await request('/api/auth/status', { auth: false });
  assert.equal(status.data.initialized, true);
  assert.equal(status.data.authenticated, false);
  assert.equal(status.data.mustChangePassword, true);
});

test('protected endpoints reject unauthenticated access and CSRF', async () => {
  const unauthorized = await request('/api/bootstrap', { auth: false });
  assert.equal(unauthorized.response.status, 401);

  const noCsrf = await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    headers: { 'X-FrpcDeck': '' },
    body: { username: 'admin', password: 'testpassword' },
  });
  assert.equal(noCsrf.response.status, 403);
});

test('initial password is forced to change before bootstrap', async () => {
  const loginResult = await login('admin', initialPassword);
  assert.equal(loginResult.data.mustChangePassword, true);
  assert.ok(cookie.startsWith('frpcdeck_session='));

  const blocked = await request('/api/bootstrap');
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.data.error.code, 'password-change-required');

  const changed = await request('/api/auth/credentials', {
    method: 'POST',
    body: { currentPassword: initialPassword, username: 'admin', password: 'testpassword' },
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.data.mustChangePassword, false);
  cookie = changed.setCookie.split(';')[0];

  const bootstrap = await request('/api/bootstrap');
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.data.config.serverAddr, '');
  assert.equal(bootstrap.data.settings.autoStart, true);
});

test('monitor endpoint is disabled until configured', async () => {
  const monitor = await request('/api/monitor');
  assert.equal(monitor.response.status, 200);
  assert.equal(monitor.data.enabled, false);
  assert.equal(monitor.data.available, false);
  const bootstrap = await request('/api/bootstrap');
  assert.equal(bootstrap.data.monitor.enabled, false);
});

test('documentation API lists docs and serves markdown/assets', async () => {
  const list = await request('/api/docs');
  assert.equal(list.response.status, 200);
  assert.ok(list.data.docs.length >= 8);
  assert.ok(list.data.categories.some((group) => group.name === '使用文档'));

  const doc = await request('/api/docs/configuration');
  assert.equal(doc.response.status, 200);
  assert.match(doc.data.content, /配置/);
  assert.equal(doc.data.slug, 'configuration');

  const asset = await request('/api/docs/assets/screenshots/instances.png');
  assert.equal(asset.response.status, 200);
  assert.match(asset.response.headers.get('content-type') || '', /image\/png/);
});

test('config validation rejects invalid values with structured issues', async () => {
  const result = await request('/api/config/validate', {
    method: 'POST',
    body: {
      config: {
        serverAddr: '',
        serverPort: 0,
        proxies: [{ name: 'bad', type: 'tcp', localPort: 0 }],
      },
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, false);
  assert.ok(result.data.issues.some((item) => item.level === 'error'));
});

test('applying a valid config saves it even when frpc is unavailable', async () => {
  const config = {
    serverAddr: '127.0.0.1',
    serverPort: 7000,
    auth: { method: 'token', token: 'test-token' },
    webServer: { addr: '127.0.0.1', port: 7400, user: 'admin', password: 'monitor-pass' },
    proxies: [
      {
        name: 'web',
        type: 'http',
        localIP: '127.0.0.1',
        localPort: 8080,
        customDomains: ['demo.example.com'],
      },
    ],
  };
  const result = await request('/api/config', { method: 'PUT', body: { config, restart: true } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.config.proxies[0].name, 'web');
  assert.equal(result.data.apply.attempted, true);
  assert.equal(result.data.apply.ok, false);
  assert.match(result.data.apply.error, /frpc/);

  const toml = await request('/api/config/toml');
  assert.match(toml.data, /\[\[proxies]]/);
  assert.match(toml.data, /customDomains = \["demo.example.com"]/);

  const current = await request('/api/config');
  assert.equal(current.data.config.proxies.length, 1);
});

test('import keeps the panel admin interface when omitted from the file', async () => {
  const before = await request('/api/config');
  const imported = await request('/api/config/import', {
    method: 'POST',
    body: {
      filename: 'frpc.toml',
      content: `serverAddr = "127.0.0.1"
serverPort = 7000

[[proxies]]
name = "imported"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6001
`,
    },
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.data.config.webServer.port, before.data.config.webServer.port);
  assert.equal(imported.data.config.webServer.password, before.data.config.webServer.password);
  assert.equal(imported.data.config.proxies[0].name, 'imported');
  assert.equal(imported.data.issues.filter((item) => item.level === 'error').length, 0);
});

test('backups are created automatically and can be restored', async () => {
  const configA = {
    serverAddr: '127.0.0.1',
    serverPort: 7000,
    webServer: { port: 7400, password: 'x' },
    proxies: [{ name: 'a', type: 'tcp', localPort: 22, remotePort: 6001 }],
  };
  const configB = {
    ...configA,
    proxies: [
      { name: 'a', type: 'tcp', localPort: 22, remotePort: 6001 },
      { name: 'b', type: 'tcp', localPort: 80, remotePort: 6002 },
    ],
  };
  await request('/api/config', { method: 'PUT', body: { config: configA, restart: false } });
  await request('/api/config', { method: 'PUT', body: { config: configB, restart: false } });

  const backups = await request('/api/backups');
  assert.ok(backups.data.backups.length >= 2);
  const latest = backups.data.backups[0];
  assert.ok(latest.proxyCount >= 1);

  const restore = await request(`/api/backups/${encodeURIComponent(latest.id)}/restore`, {
    method: 'POST',
    body: {},
  });
  assert.equal(restore.response.status, 200);
  assert.ok(Array.isArray(restore.data.config.proxies));
});

test('settings update and validation API remain available', async () => {
  const settings = await request('/api/settings', {
    method: 'PUT',
    body: { autoRestart: true, autoStart: false },
  });
  assert.equal(settings.data.settings.autoRestart, true);
  assert.equal(settings.data.settings.autoStart, false);

  const validation = await request('/api/config/validate', {
    method: 'POST',
    body: {
      config: {
        serverAddr: '127.0.0.1',
        serverPort: 7000,
        webServer: { port: 7400, password: 'x' },
        proxies: [{ name: 'ok', type: 'tcp', localPort: 22, remotePort: 6001 }],
      },
    },
  });
  assert.equal(validation.data.ok, true);
  assert.equal(validation.data.verify.unavailable, true);
});

test('SSE endpoint streams the hello event', async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  const response = await fetch(`${base}/api/events`, {
    headers: { Cookie: cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/event-stream/);
  const reader = response.body.getReader();
  const { value } = await reader.read();
  const text = Buffer.from(value).toString('utf8');
  assert.match(text, /event: hello/);
  await reader.cancel();
  clearTimeout(timeout);
});

test('password change rotates the session token', async () => {
  const oldCookie = cookie;
  const change = await request('/api/auth/password', {
    method: 'POST',
    body: { currentPassword: 'testpassword', password: 'newpassword123' },
  });
  assert.equal(change.response.status, 200);
  const newCookie = change.setCookie.split(';')[0];
  assert.notEqual(newCookie, oldCookie);

  const oldSession = await request('/api/bootstrap', { auth: false, headers: { Cookie: oldCookie } });
  assert.equal(oldSession.response.status, 401);
  cookie = newCookie;
  const newSession = await request('/api/bootstrap');
  assert.equal(newSession.response.status, 200);

  const relogin = await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { username: 'admin', password: 'newpassword123' },
  });
  assert.equal(relogin.response.status, 200);
  cookie = relogin.setCookie.split(';')[0];
});

test('reset clears configuration after explicit confirmation', async () => {
  const wrong = await request('/api/config/reset', { method: 'POST', body: { confirm: 'nope' } });
  assert.equal(wrong.response.status, 400);

  const reset = await request('/api/config/reset', { method: 'POST', body: { confirm: 'RESET' } });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.data.config.serverAddr, '');
  assert.equal(reset.data.config.proxies.length, 0);
  assert.ok(reset.data.config.webServer.password);
});

test('batch port imports are normalized, editable and applied as one proxy per range', async () => {
  const before = await request('/api/config');
  const content = await fs.readFile(new URL('./fixtures/frpc_template.toml', import.meta.url), 'utf8');
  const imported = await request('/api/config/import', {
    method: 'POST',
    body: { filename: 'frpc.toml', content },
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.data.format, 'toml');
  assert.equal(imported.data.config.proxies.length, 3);
  assert.equal(imported.data.config.proxies[1].name, 'Sunshine-TCP');
  assert.equal(imported.data.config.proxies[1].batch.localPorts, '47984-47990,48010');
  assert.equal(imported.data.config.webServer.password, before.data.config.webServer.password);
  assert.match(imported.data.toml, /\{\{- range/);
  assert.match(imported.data.toml, /parseNumberRangePair/);
  assert.match(imported.data.toml, /\[webServer]/);
  assert.match(imported.data.toml, /password = "\{\{ \.Envs\.FRPCDECK_ADMIN_PASSWORD }}"/);
  assert.equal(
    imported.data.toml.includes(`password = "${before.data.config.webServer.password}"`),
    false,
  );
  assert.doesNotMatch(imported.data.toml, /Sunshine-TCP-47984/);
  assert.ok(imported.data.warnings.some((warning) => /批量端口/.test(warning)));

  const applied = await request('/api/config', {
    method: 'PUT',
    body: { config: imported.data.config, restart: false },
  });
  assert.equal(applied.response.status, 200);
  assert.equal(applied.data.config.proxies.length, 3);
  assert.equal(applied.data.config.proxies[2].batch.localPorts, '47998-48000,47800,48002,48010');
  assert.match(applied.data.toml, /\{\{- range/);
  assert.match(applied.data.toml, /Sunshine-UDP-\{\{ \$v\.First }}/);

  const current = await request('/api/config');
  assert.equal(current.data.config.proxies.length, 3);
  assert.match(current.data.toml, /Sunshine-UDP/);
});

test('instances can be created, activated and deleted through the API', async () => {
  const created = await request('/api/instances', {
    method: 'POST',
    body: {
      name: '测试实例',
      config: {
        serverAddr: 'second.example.com',
        serverPort: 7000,
        auth: { method: 'token', token: 'second-token' },
      },
    },
  });
  assert.equal(created.response.status, 200);
  const id = created.data.instance.id;
  assert.ok(id);
  assert.equal(created.data.instance.serverAddr, 'second.example.com');

  const list = await request('/api/instances');
  assert.ok(list.data.instances.some((item) => item.id === id));

  const selected = await request('/api/bootstrap', { headers: { 'X-FrpcDeck-Instance': id } });
  assert.equal(selected.response.status, 200);
  assert.equal(selected.data.instanceId, id);
  assert.equal(selected.data.config.serverAddr, 'second.example.com');
  assert.ok(selected.data.instances.length >= 2);

  const activated = await request(`/api/instances/${id}/activate`, { method: 'POST', body: {} });
  assert.equal(activated.response.status, 200);
  assert.equal(activated.data.instance.id, id);

  const deleted = await request(`/api/instances/${id}`, {
    method: 'DELETE',
    body: { confirm: '测试实例' },
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.data.instances.some((item) => item.id === id), false);
  const fallback = await request('/api/bootstrap');
  assert.notEqual(fallback.data.instanceId, id);
});

test('username and password can both be changed from the WebUI API', async () => {
  const changed = await request('/api/auth/credentials', {
    method: 'POST',
    body: {
      currentPassword: 'newpassword123',
      username: 'operator',
      password: 'operatorpass456',
    },
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.data.username, 'operator');
  assert.equal(changed.data.mustChangePassword, false);

  const relogin = await login('operator', 'operatorpass456');
  assert.equal(relogin.data.username, 'operator');
  const bootstrap = await request('/api/bootstrap');
  assert.equal(bootstrap.response.status, 200);
});
