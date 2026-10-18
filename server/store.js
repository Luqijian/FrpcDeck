import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CONFIG_VERSION,
  createDefaultConfig,
  generateToml,
  normalizeConfig,
  parseConfigText,
} from './config.js';

const BACKUP_LIMIT = 30;

export class Store {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.paths = {
      config: path.join(this.dataDir, 'config.json'),
      toml: path.join(this.dataDir, 'frpc.toml'),
      settings: path.join(this.dataDir, 'settings.json'),
      auth: path.join(this.dataDir, 'auth.json'),
      secret: path.join(this.dataDir, 'session.key'),
      backups: path.join(this.dataDir, 'backups'),
    };
    this.config = null;
    this.savedAt = null;
    this.settings = { autoStart: true, autoRestart: false };
    this.secret = '';
    this.warnings = [];
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.paths.backups, { recursive: true, mode: 0o700 });
    this.secret = await this.#loadOrCreateSecret();
    this.settings = { ...this.settings, ...(await this.#readJson(this.paths.settings, {})) };
    await this.#loadConfig();
    await this.#writeFileAtomic(this.paths.toml, generateToml(this.config), 0o600);
    return this;
  }

  async #loadOrCreateSecret() {
    try {
      const value = (await fs.readFile(this.paths.secret, 'utf8')).trim();
      if (value.length >= 32) return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const value = crypto.randomBytes(32).toString('hex');
    await this.#writeFileAtomic(this.paths.secret, value, 0o600);
    return value;
  }

  async #loadConfig() {
    try {
      const raw = JSON.parse(await fs.readFile(this.paths.config, 'utf8'));
      this.config = normalizeConfig(raw.config || raw);
      this.savedAt = raw.savedAt || null;
      return;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // First run, fall through to frpc.toml / defaults.
      } else {
        const corrupt = `${this.paths.config}.corrupt-${Date.now()}`;
        await fs.rename(this.paths.config, corrupt).catch(() => {});
        this.warnings.push(`config.json 无法解析，已备份为 ${path.basename(corrupt)}，尝试恢复配置`);
      }
    }

    // First run: adopt an existing frpc.toml mounted into /data.
    try {
      const text = await fs.readFile(this.paths.toml, 'utf8');
      const parsed = parseConfigText(text, 'frpc.toml');
      this.config = parsed.config;
      this.savedAt = new Date().toISOString();
      this.warnings.push(...parsed.warnings, '已导入现有的 frpc.toml，并创建配置备份到 backups/');
      await this.createBackup(this.config, '导入现有 frpc.toml');
      await this.persistConfig(this.config, { skipBackup: true });
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.warnings.push(`现有 frpc.toml 无法导入，已使用默认配置：${error.message}`);
      }
    }

    this.config = createDefaultConfig();
    this.savedAt = new Date().toISOString();
    await this.persistConfig(this.config, { skipBackup: true });
  }

  async persistConfig(config, { skipBackup = false, note = '自动备份' } = {}) {
    const normalized = normalizeConfig(config);
    if (!skipBackup && this.config) {
      await this.createBackup(this.config, note);
    }
    const savedAt = new Date().toISOString();
    const wrapper = { version: CONFIG_VERSION, savedAt, config: normalized };
    await this.#writeFileAtomic(this.paths.config, `${JSON.stringify(wrapper, null, 2)}\n`, 0o600);
    const toml = generateToml(normalized);
    await this.#writeFileAtomic(this.paths.toml, toml, 0o600);
    this.config = normalized;
    this.savedAt = savedAt;
    return { config: normalized, toml, savedAt };
  }

  async saveSettings(patch) {
    this.settings = {
      ...this.settings,
      autoStart: patch.autoStart === undefined ? this.settings.autoStart : Boolean(patch.autoStart),
      autoRestart: patch.autoRestart === undefined ? this.settings.autoRestart : Boolean(patch.autoRestart),
    };
    await this.#writeFileAtomic(this.paths.settings, `${JSON.stringify(this.settings, null, 2)}\n`);
    return this.settings;
  }

  async readToml() {
    return fs.readFile(this.paths.toml, 'utf8');
  }

  async createBackup(config = this.config, note = '手动备份') {
    const createdAt = new Date().toISOString();
    const stamp = createdAt.replace(/[:.]/g, '-');
    const id = `backup-${stamp}.json`;
    const payload = {
      version: CONFIG_VERSION,
      createdAt,
      note,
      config: normalizeConfig(config),
    };
    await this.#writeFileAtomic(path.join(this.paths.backups, id), `${JSON.stringify(payload, null, 2)}\n`, 0o600);
    await this.#pruneBackups();
    return { id, createdAt, note };
  }

  async listBackups() {
    let entries;
    try {
      entries = await fs.readdir(this.paths.backups);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const backups = [];
    for (const name of entries) {
      if (!name.endsWith('.json') || !/^[A-Za-z0-9_.-]+$/.test(name)) continue;
      try {
        const payload = JSON.parse(await fs.readFile(path.join(this.paths.backups, name), 'utf8'));
        backups.push({
          id: name,
          createdAt: payload.createdAt || null,
          note: payload.note || '',
          proxyCount: Array.isArray(payload.config?.proxies) ? payload.config.proxies.length : 0,
          visitorCount: Array.isArray(payload.config?.visitors) ? payload.config.visitors.length : 0,
          size: (await fs.stat(path.join(this.paths.backups, name))).size,
        });
      } catch {
        // Ignore unreadable backups rather than blocking the whole list.
      }
    }
    return backups.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async readBackup(id) {
    const safe = this.#safeBackupId(id);
    const payload = JSON.parse(await fs.readFile(path.join(this.paths.backups, safe), 'utf8'));
    return {
      ...payload,
      config: normalizeConfig(payload.config),
      id: safe,
    };
  }

  async deleteBackup(id) {
    const safe = this.#safeBackupId(id);
    await fs.unlink(path.join(this.paths.backups, safe));
  }

  async #pruneBackups() {
    const backups = await this.listBackups();
    for (const backup of backups.slice(BACKUP_LIMIT)) {
      try {
        await fs.unlink(path.join(this.paths.backups, backup.id));
      } catch {
        // Best effort.
      }
    }
  }

  #safeBackupId(id) {
    const name = path.basename(String(id || ''));
    if (!/^[A-Za-z0-9_.-]+\.json$/.test(name)) throw new Error('无效的备份 ID');
    return name;
  }

  async #readJson(file, fallback) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      this.warnings.push(`${path.basename(file)} 读取失败，已使用默认值：${error.message}`);
      return fallback;
    }
  }

  async #writeFileAtomic(file, content, mode) {
    const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(temp, content, mode ? { mode } : undefined);
    await fs.rename(temp, file);
  }
}
