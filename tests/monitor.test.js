import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FrpsMonitor } from '../server/monitor.js';

const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/api/serverinfo') {
    response.end(JSON.stringify({
      version: '0.71.1',
      totalTrafficIn: trafficIn,
      totalTrafficOut: trafficOut,
      curConns: 3,
      clientCounts: 1,
    }));
    return;
  }
  if (request.url === '/api/proxy/tcp') {
    response.end(JSON.stringify({
      proxies: [{
        name: 'ssh',
        conf: { type: 'tcp' },
        status: 'online',
        todayTrafficIn: 1200,
        todayTrafficOut: 3400,
        curConns: 2,
        lastStartTime: '10-18 19:00:00',
      }],
    }));
    return;
  }
  response.statusCode = 404;
  response.end('{}');
});

let trafficIn = 1000;
let trafficOut = 2000;

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('monitor aggregates frps traffic and computes rates', async () => {
  let settings = {
    monitor: {
      enabled: true,
      url: `http://127.0.0.1:${port}`,
      username: '',
      password: '',
    },
  };
  const monitor = new FrpsMonitor({
    getConfig: () => ({ serverAddr: '127.0.0.1', proxies: [{ type: 'tcp' }] }),
    getSettings: () => settings,
  });
  const first = await monitor.poll();
  assert.equal(first.available, true);
  assert.equal(first.today.in, 1200);
  assert.equal(first.today.out, 3400);
  assert.equal(first.server.connections, 3);
  assert.equal(first.proxies.length, 1);
  assert.equal(first.server.inBps, 0);

  trafficIn += 100000;
  trafficOut += 50000;
  await new Promise((resolve) => setTimeout(resolve, 220));
  const second = await monitor.poll();
  assert.ok(second.server.inBps > 0);
  assert.ok(second.server.outBps > 0);
  assert.ok(second.history.length >= 2);

  settings = { monitor: { enabled: false, url: settings.monitor.url, username: '', password: '' } };
  const disabled = await monitor.poll();
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.available, false);
});

test('monitor reports missing and invalid dashboard configuration', async () => {
  const monitor = new FrpsMonitor({
    getConfig: () => ({ serverAddr: '', proxies: [] }),
    getSettings: () => ({ monitor: { enabled: true, url: '', username: '', password: '' } }),
  });
  const missing = await monitor.poll();
  assert.equal(missing.enabled, true);
  assert.equal(missing.configured, false);
  assert.match(missing.error, /Dashboard/);

  const bad = new FrpsMonitor({
    getConfig: () => ({ serverAddr: '127.0.0.1', proxies: [] }),
    getSettings: () => ({ monitor: { enabled: true, url: `http://127.0.0.1:${port}/missing`, username: '', password: '' } }),
  });
  const failed = await bad.poll();
  assert.equal(failed.enabled, true);
  assert.equal(failed.available, false);
  assert.match(failed.error, /HTTP 404/);
});
