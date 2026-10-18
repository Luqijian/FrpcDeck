import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from './store.js';
import { FrpcManager } from './frpc.js';
import { createDefaultConfig, hasErrors, normalizeConfig, validateConfig } from './config.js';

const META_VERSION = 1;
const LEGACY_FILES = ['config.json', 'frpc.toml', 'settings.json', 'backups'];

function nowIso() {
  return new Date().toISOString();
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function movePath(source, target) {
  try {
    await fs.rename(source, target);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.cp(source, target, { recursive: true, errorOnExist: false });
    await fs.rm(source, { recursive: true, force: true });
  }
}

export class InstanceManager {
  constructor({ dataDir, frpcBin = 'frpc' }) {
    this.dataDir = path.resolve(dataDir);
    this.frpcBin = frpcBin;
    this.instancesDir = path.join(this.dataDir, 'instances');
    this.deletedDir = path.join(this.instancesDir, '.deleted');
    this.metaFile = path.join(this.dataDir, 'instances.json');
    this.instances = new Map();
    this.meta = { version: META_VERSION, lastInstance: '', instances: [] };
    this.warnings = [];
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.instancesDir, { recursive: true, mode: 0o700 });
    await this.#migrateLegacy();
    await this.#loadMeta();
    await this.#loadAll();
    await this.#autoStart();
    return this;
  }

  async #migrateLegacy() {
    const existing = await fs.readdir(this.instancesDir).catch(() => []);
    const hasInstances = existing.some((name) => !name.startsWith('.'));
    if (hasInstances) return;
    const hasLegacy = (await Promise.all(LEGACY_FILES.map((name) => pathExists(path.join(this.dataDir, name))))).some(Boolean);
    if (!hasLegacy) return;

    const dir = path.join(this.instancesDir, 'default');
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    for (const name of LEGACY_FILES) {
      const source = path.join(this.dataDir, name);
      if (!(await pathExists(source))) continue;
      await movePath(source, path.join(dir, name));
    }
    this.meta = {
      version: META_VERSION,
      lastInstance: 'default',
      instances: [{ id: 'default', name: '默认实例', createdAt: nowIso() }],
    };
    await this.#saveMeta();
    this.warnings.push('已将原有单实例配置迁移到「默认实例」');
  }

  async #loadMeta() {
    try {
      const raw = JSON.parse(await fs.readFile(this.metaFile, 'utf8'));
      if (raw && Array.isArray(raw.instances)) {
        this.meta = {
          version: META_VERSION,
          lastInstance: String(raw.lastInstance || ''),
          instances: raw.instances
            .filter((item) => item && /^[A-Za-z0-9_-]+$/.test(String(item.id || '')))
            .map((item) => ({
              id: String(item.id),
              name: String(item.name || item.id),
              createdAt: String(item.createdAt || nowIso()),
            })),
        };
        return;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.warnings.push(`instances.json 无法读取，正在扫描实例目录：${error.message}`);
      }
    }

    const entries = await fs.readdir(this.instancesDir, { withFileTypes: true }).catch(() => []);
    const instances = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (!/^[A-Za-z0-9_-]+$/.test(entry.name)) continue;
      instances.push({ id: entry.name, name: entry.name, createdAt: nowIso() });
    }
    this.meta = {
      version: META_VERSION,
      lastInstance: instances[0]?.id || '',
      instances,
    };
    if (instances.length) await this.#saveMeta();
  }

  async #loadAll() {
    if (this.meta.instances.length === 0) {
      const instance = await this.#create('默认实例', null, 'default');
      this.meta.lastInstance = instance.id;
      await this.#saveMeta();
    }

    for (const item of this.meta.instances) {
      if (this.instances.has(item.id)) continue;
      const dir = path.join(this.instancesDir, item.id);
      try {
        await fs.mkdir(dir, { recursive: true, mode: 0o700 });
        const store = await new Store(dir).init();
        const frpc = new FrpcManager({
          bin: this.frpcBin,
          configPath: store.paths.toml,
          dataDir: dir,
          getConfig: () => store.config,
          getSettings: () => store.settings,
        });
        await frpc.init();
        this.warnings.push(...store.warnings.map((warning) => `${item.name}: ${warning}`));
        this.instances.set(item.id, {
          id: item.id,
          name: item.name,
          createdAt: item.createdAt,
          dir,
          store,
          frpc,
        });
      } catch (error) {
        this.warnings.push(`实例「${item.name}」加载失败：${error.message}`);
      }
    }

    const validIds = new Set(this.instances.keys());
    this.meta.instances = this.meta.instances.filter((item) => validIds.has(item.id));
    if (!validIds.has(this.meta.lastInstance)) {
      this.meta.lastInstance = this.meta.instances[0]?.id || '';
    }
    if (this.instances.size === 0) {
      const instance = await this.#create('默认实例', null, 'default');
      this.meta.instances = [{ id: instance.id, name: instance.name, createdAt: instance.createdAt }];
      this.meta.lastInstance = instance.id;
    }
    await this.#saveMeta();
  }

  async #autoStart() {
    for (const instance of this.instances.values()) {
      if (!instance.store.settings.autoStart) continue;
      const config = instance.store.config;
      if (!config?.serverAddr) continue;
      const issues = validateConfig(config);
      if (hasErrors(issues)) {
        this.warnings.push(`实例「${instance.name}」配置有误，跳过自动启动`);
        continue;
      }
      const verify = await instance.frpc.validateFile(instance.store.paths.toml);
      if (!verify.ok && !verify.unavailable) {
        this.warnings.push(`实例「${instance.name}」frpc 校验失败，跳过自动启动：${verify.message}`);
        continue;
      }
      try {
        await instance.frpc.start();
      } catch (error) {
        this.warnings.push(`实例「${instance.name}」自动启动失败：${error.message}`);
      }
    }
  }

  current() {
    return this.instances.get(this.meta.lastInstance) || this.instances.values().next().value || null;
  }

  get(id) {
    return this.instances.get(String(id || ''));
  }

  resolve(id) {
    if (id) return this.get(id);
    return this.current();
  }

  list() {
    return [...this.instances.values()];
  }

  summary(instance) {
    if (!instance) return null;
    const runtime = instance.frpc.runtime();
    return {
      id: instance.id,
      name: instance.name,
      createdAt: instance.createdAt,
      serverAddr: instance.store.config.serverAddr || '',
      serverPort: instance.store.config.serverPort || 7000,
      proxyCount: instance.store.config.proxies?.length || 0,
      visitorCount: instance.store.config.visitors?.length || 0,
      status: runtime.process.status,
      connection: runtime.process.connection,
      autoStart: instance.store.settings.autoStart,
    };
  }

  summaries(activeId = this.meta.lastInstance) {
    return this.list().map((instance) => ({
      ...this.summary(instance),
      active: instance.id === activeId,
    }));
  }

  async setActive(id) {
    const instance = this.get(id);
    if (!instance) throw new Error('实例不存在');
    this.meta.lastInstance = instance.id;
    await this.#saveMeta();
    return this.summary(instance);
  }

  async create({ name, config } = {}) {
    const instance = await this.#create(name, config);
    await this.#saveMeta();
    return instance;
  }

  async #create(rawName, config, forcedId = '') {
    const name = String(rawName || '').trim();
    if (!name) throw new Error('请填写实例名称');
    if (name.length > 40) throw new Error('实例名称不能超过 40 个字符');
    const id = forcedId || `inst-${crypto.randomBytes(6).toString('hex')}`;
    if (this.instances.has(id)) throw new Error('实例 ID 已存在');
    const dir = path.join(this.instancesDir, id);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    const store = await new Store(dir).init();
    const merged = config && typeof config === 'object' ? normalizeConfig(config) : createDefaultConfig();
    merged.webServer = {
      ...merged.webServer,
      addr: '127.0.0.1',
      port: this.#nextAdminPort(),
      user: 'admin',
      password: merged.webServer?.password || crypto.randomBytes(12).toString('base64url'),
    };
    await store.persistConfig(merged, { skipBackup: true });

    const frpc = new FrpcManager({
      bin: this.frpcBin,
      configPath: store.paths.toml,
      dataDir: dir,
      getConfig: () => store.config,
      getSettings: () => store.settings,
    });
    await frpc.init();
    const instance = { id, name, createdAt: nowIso(), dir, store, frpc };
    this.instances.set(id, instance);
    this.meta.instances.push({ id, name, createdAt: instance.createdAt });
    if (!this.meta.lastInstance) this.meta.lastInstance = id;
    return instance;
  }

  #nextAdminPort() {
    const used = new Set();
    for (const instance of this.instances.values()) {
      const port = Number(instance.store.config.webServer?.port);
      if (port) used.add(port);
    }
    for (let port = 7400; port <= 65535; port += 1) {
      if (!used.has(port)) return port;
    }
    throw new Error('没有可用的 frpc 管理端口');
  }

  async rename(id, rawName) {
    const instance = this.get(id);
    if (!instance) throw new Error('实例不存在');
    const name = String(rawName || '').trim();
    if (!name) throw new Error('请填写实例名称');
    if (name.length > 40) throw new Error('实例名称不能超过 40 个字符');
    instance.name = name;
    const item = this.meta.instances.find((entry) => entry.id === instance.id);
    if (item) item.name = name;
    await this.#saveMeta();
    return this.summary(instance);
  }

  async remove(id) {
    const instance = this.get(id);
    if (!instance) throw new Error('实例不存在');
    if (this.instances.size <= 1) throw new Error('至少需要保留一个实例');
    await instance.frpc.dispose().catch(() => {});
    this.instances.delete(instance.id);
    this.meta.instances = this.meta.instances.filter((item) => item.id !== instance.id);
    await fs.mkdir(this.deletedDir, { recursive: true, mode: 0o700 });
    const stamp = nowIso().replace(/[:.]/g, '-');
    await movePath(instance.dir, path.join(this.deletedDir, `${instance.id}-${stamp}`)).catch(() => {});
    if (this.meta.lastInstance === instance.id) {
      this.meta.lastInstance = this.meta.instances[0]?.id || '';
    }
    await this.#saveMeta();
    return this.current();
  }

  async dispose() {
    await Promise.all([...this.instances.values()].map((instance) => instance.frpc.dispose().catch(() => {})));
  }

  async #saveMeta() {
    const temp = `${this.metaFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify({
      version: META_VERSION,
      lastInstance: this.meta.lastInstance,
      instances: this.meta.instances,
    }, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, this.metaFile);
  }
}
