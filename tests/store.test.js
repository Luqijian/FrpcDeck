import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'frpcdeck-store-'));
}

test('first run imports an existing frpc.toml and creates a backup', async () => {
  const dir = await tempDir();
  try {
    await fs.writeFile(path.join(dir, 'frpc.toml'), `serverAddr = "old.example.com"
serverPort = 7000
auth.token = "legacy-token"

[[proxies]]
name = "legacy"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6001
`);
    const store = await new Store(dir).init();
    assert.equal(store.config.serverAddr, 'old.example.com');
    assert.equal(store.config.auth.token, 'legacy-token');
    assert.equal(store.config.proxies[0].name, 'legacy');
    assert.ok(store.warnings.some((warning) => /导入/.test(warning)));
    assert.ok((await fs.stat(path.join(dir, 'config.json'))).isFile());
    assert.ok((await fs.stat(path.join(dir, 'frpc.toml'))).isFile());
    const backups = await store.listBackups();
    assert.ok(backups.length >= 1);
    assert.equal(backups[0].proxyCount, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('first run adopts a Go template frpc.toml without expanding it', async () => {
  const dir = await tempDir();
  try {
    const template = await fs.readFile(
      new URL('./fixtures/frpc_template.toml', import.meta.url),
      'utf8',
    );
    await fs.writeFile(path.join(dir, 'frpc.toml'), template);
    const store = await new Store(dir).init();
    assert.equal(store.config.rawTemplate, template);
    assert.ok(store.config.webServer.password);
    const generated = await store.readToml();
    assert.match(generated, /\{\{- range/);
    assert.match(generated, /parseNumberRangePair/);
    assert.match(generated, /\[webServer]/);
    assert.doesNotMatch(generated, /Sunshine-TCP-47984/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('corrupt config.json is quarantined and frpc.toml is used for recovery', async () => {
  const dir = await tempDir();
  try {
    await fs.writeFile(path.join(dir, 'config.json'), '{ this is not json');
    await fs.writeFile(path.join(dir, 'frpc.toml'), `serverAddr = "recovered.example.com"
serverPort = 7000
webServer.port = 7400
webServer.password = "recover-pass"
`);
    const store = await new Store(dir).init();
    assert.equal(store.config.serverAddr, 'recovered.example.com');
    assert.ok(store.warnings.some((warning) => /无法解析/.test(warning)));
    const files = await fs.readdir(dir);
    assert.ok(files.some((name) => name.startsWith('config.json.corrupt-')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('persistConfig writes a backup and updates generated TOML', async () => {
  const dir = await tempDir();
  try {
    const store = await new Store(dir).init();
    const first = store.config;
    const next = {
      ...first,
      serverAddr: 'new.example.com',
      proxies: [{ name: 'p1', type: 'tcp', localPort: 22, remotePort: 6001 }],
    };
    const saved = await store.persistConfig(next, { note: '单元测试' });
    assert.equal(saved.config.serverAddr, 'new.example.com');
    assert.match(saved.toml, /new\.example\.com/);
    const backups = await store.listBackups();
    assert.ok(backups.some((backup) => backup.note === '单元测试'));
    const toml = await store.readToml();
    assert.match(toml, /name = "p1"/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('backup restore returns the normalized saved configuration', async () => {
  const dir = await tempDir();
  try {
    const store = await new Store(dir).init();
    const backup = await store.createBackup(store.config, '手动');
    const read = await store.readBackup(backup.id);
    assert.equal(read.note, '手动');
    assert.equal(read.config.webServer.port, store.config.webServer.port);
    await store.deleteBackup(backup.id);
    const list = await store.listBackups();
    assert.equal(list.some((item) => item.id === backup.id), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
