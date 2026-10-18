import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InstanceManager } from '../server/instances.js';
import { createDefaultConfig, generateToml } from '../server/config.js';

const roots = [];

async function tempRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'frpcdeck-instances-'));
  roots.push(dir);
  return dir;
}

after(async () => {
  await Promise.all(roots.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
});

test('migrates a legacy single-instance data directory', async () => {
  const root = await tempRoot();
  const config = createDefaultConfig();
  config.serverAddr = 'legacy.example.com';
  config.serverPort = 7000;
  await fs.writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), config }, null, 2));
  await fs.writeFile(path.join(root, 'frpc.toml'), generateToml(config));
  await fs.mkdir(path.join(root, 'backups'), { recursive: true });
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ autoStart: false, autoRestart: false }));

  const manager = await new InstanceManager({ dataDir: root, frpcBin: path.join(root, 'missing-frpc') }).init();
  try {
    assert.equal(manager.instances.size, 1);
    const instance = manager.current();
    assert.equal(instance.id, 'default');
    assert.equal(instance.store.config.serverAddr, 'legacy.example.com');
    assert.equal(manager.summaries()[0].name, '默认实例');
    assert.equal(await fs.stat(path.join(root, 'instances', 'default', 'config.json')).then(() => true), true);
    assert.equal(await fs.stat(path.join(root, 'config.json')).then(() => true, () => false), false);
  } finally {
    await manager.dispose();
  }
});

test('creates, renames, switches and removes isolated instances', async () => {
  const root = await tempRoot();
  const manager = await new InstanceManager({ dataDir: root, frpcBin: path.join(root, 'missing-frpc') }).init();
  try {
    assert.equal(manager.instances.size, 1);
    const first = manager.current();
    const second = await manager.create({
      name: '日本节点',
      config: {
        serverAddr: 'jp.example.com',
        serverPort: 7000,
        auth: { method: 'token', token: 'jp-token' },
      },
    });
    assert.equal(manager.instances.size, 2);
    assert.notEqual(second.store.config.webServer.port, first.store.config.webServer.port);
    assert.equal(second.store.config.serverAddr, 'jp.example.com');
    assert.equal(second.store.config.auth.token, 'jp-token');

    const renamed = await manager.rename(second.id, '东京节点');
    assert.equal(renamed.name, '东京节点');
    await manager.setActive(second.id);
    assert.equal(manager.current().id, second.id);
    assert.equal(manager.summaries(second.id).find((item) => item.id === second.id).active, true);

    await manager.remove(second.id);
    assert.equal(manager.instances.size, 1);
    assert.equal(manager.current().id, first.id);
    const deleted = await fs.readdir(path.join(root, 'instances', '.deleted'));
    assert.equal(deleted.length, 1);
    await assert.rejects(() => manager.remove(first.id), /至少需要保留一个实例/);
  } finally {
    await manager.dispose();
  }
});
