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
    FRPC_WEBUI_PASSWORD: '',
    FRPC_WEBUI_USERNAME: 'admin',
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
  assert.equal(health.data.frpc.available, false);

  const status = await request('/api/auth/status', { auth: false });
  assert.equal(status.data.initialized, false);
  assert.equal(status.data.authenticated, false);
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

test('first-run setup creates an administrator session', async () => {
  const setup = await request('/api/auth/setup', {
    method: 'POST',
    auth: false,
    body: { username: 'admin', password: 'testpassword' },
  });
  assert.equal(setup.response.status, 200);
  assert.equal(setup.data.authenticated, true);
  cookie = setup.setCookie.split(';')[0];
  assert.ok(cookie.startsWith('frpcdeck_session='));

  const bootstrap = await request('/api/bootstrap');
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.data.config.serverAddr, '');
  assert.equal(bootstrap.data.settings.autoStart, true);
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
