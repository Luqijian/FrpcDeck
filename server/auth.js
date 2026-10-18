import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'frpcdeck_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateCredentials(username, password) {
  if (!/^[A-Za-z0-9_.-]{1,32}$/.test(username)) {
    throw new Error('用户名只能包含字母、数字、下划线、点和短横线，长度 1–32');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('密码至少需要 8 个字符');
  }
  if (password.length > 256) {
    throw new Error('密码不能超过 256 个字符');
  }
}

export class AuthManager {
  constructor({ dataDir, secret, envUsername, envPassword, cookieSecure = false }) {
    this.file = path.join(dataDir, 'auth.json');
    this.secret = secret;
    this.envUsername = String(envUsername || 'admin').trim() || 'admin';
    this.envPassword = envPassword || '';
    this.envManaged = Boolean(this.envPassword);
    this.cookieSecure = cookieSecure;
    this.record = null;
    this.warnings = [];
  }

  async init() {
    this.record = await this.#readRecord();
    if (this.envManaged) {
      await this.#applyEnvCredentials();
    }
    return this;
  }

  get initialized() {
    return Boolean(this.record);
  }

  get username() {
    return this.record?.username || this.envUsername;
  }

  get tokenVersion() {
    return this.record?.version || 0;
  }

  status() {
    return {
      initialized: this.initialized,
      envManaged: this.envManaged,
      username: this.initialized ? this.record.username : this.envUsername,
    };
  }

  async #readRecord() {
    try {
      const record = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!record?.username || !record?.salt || !record?.hash) return null;
      return record;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error(`无法读取认证信息：${error.message}`);
    }
  }

  async #applyEnvCredentials() {
    if (this.envPassword.length < 8) {
      this.warnings.push('FRPC_WEBUI_PASSWORD 少于 8 个字符，建议使用更强的密码');
    }
    const username = this.envUsername;
    const unchanged = this.record
      && this.record.source === 'env'
      && this.record.username === username
      && this.#verifyHash(this.envPassword, this.record);
    if (unchanged) return;

    const salt = crypto.randomBytes(16).toString('hex');
    this.record = {
      version: (this.record?.version || 0) + 1,
      username,
      salt,
      hash: hashPassword(this.envPassword, salt),
      source: 'env',
      updatedAt: new Date().toISOString(),
    };
    await this.#writeRecord();
  }

  async setup(username, password, source = 'ui') {
    if (this.initialized) throw new Error('管理员账户已经初始化');
    validateCredentials(username, password);
    const salt = crypto.randomBytes(16).toString('hex');
    this.record = {
      version: 1,
      username,
      salt,
      hash: hashPassword(password, salt),
      source,
      updatedAt: new Date().toISOString(),
    };
    await this.#writeRecord();
    return this.record;
  }

  login(username, password) {
    if (!this.record) return { ok: false, reason: 'not-initialized' };
    // Always run scrypt to make invalid usernames indistinguishable by timing.
    const validPassword = this.#verifyHash(String(password || ''), this.record);
    const validUsername = safeEqual(String(username || ''), this.record.username);
    if (!validUsername || !validPassword) return { ok: false, reason: 'invalid' };
    return { ok: true, username: this.record.username };
  }

  async changePassword(currentPassword, nextPassword) {
    if (this.envManaged) {
      throw new Error('密码由 FRPC_WEBUI_PASSWORD 环境变量管理，请修改环境变量后重启容器');
    }
    if (!this.record) throw new Error('管理员账户尚未初始化');
    if (!this.login(this.record.username, currentPassword).ok) {
      throw new Error('当前密码不正确');
    }
    validateCredentials(this.record.username, nextPassword);
    const salt = crypto.randomBytes(16).toString('hex');
    this.record = {
      ...this.record,
      version: this.record.version + 1,
      salt,
      hash: hashPassword(nextPassword, salt),
      source: 'ui',
      updatedAt: new Date().toISOString(),
    };
    await this.#writeRecord();
    return this.record;
  }

  issueSession() {
    if (!this.record) throw new Error('管理员账户尚未初始化');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      u: this.record.username,
      v: this.record.version,
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  verifySession(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    if (!safeEqual(signature, expected)) return null;
    let data;
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!data || data.exp < Math.floor(Date.now() / 1000)) return null;
    if (!this.record || data.u !== this.record.username || data.v !== this.record.version) return null;
    return data;
  }

  cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cookieSecure,
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    };
  }

  #verifyHash(password, record) {
    try {
      const candidate = hashPassword(password, record.salt);
      return safeEqual(candidate, record.hash);
    } catch {
      return false;
    }
  }

  async #writeRecord() {
    const temp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(this.record, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, this.file);
  }
}
