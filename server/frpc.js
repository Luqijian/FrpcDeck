import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const MAX_LOGS = 2000;
const LEVEL_MAP = { T: 'trace', D: 'debug', I: 'info', W: 'warn', E: 'error' };

function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function detectLevel(line) {
  const match = line.match(/\[(T|D|I|W|E)\]/);
  if (match) return LEVEL_MAP[match[1]];
  if (/\b(error|failed|fatal)\b/i.test(line)) return 'error';
  if (/\bwarn(ing)?\b/i.test(line)) return 'warn';
  return 'info';
}

export class FrpcManager extends EventEmitter {
  constructor({ bin, configPath, dataDir, getConfig, getSettings }) {
    super();
    this.setMaxListeners(0);
    this.bin = bin || 'frpc';
    this.configPath = configPath;
    this.dataDir = dataDir;
    this.getConfig = getConfig;
    this.getSettings = getSettings || (() => ({}));
    this.child = null;
    this.logs = [];
    this.seq = 0;
    this.pollTimer = null;
    this.polling = false;
    this.fileTimer = null;
    this.fileOffset = 0;
    this.fileRemainder = '';
    this.fileInitialized = false;
    this.restartTimer = null;
    this.restartAttempt = 0;
    this.stopRequested = false;
    this.disposed = false;
    this.startedAtMs = null;
    this.state = {
      status: 'stopped',
      pid: null,
      startedAt: null,
      stoppedAt: null,
      exitCode: null,
      signal: null,
      lastError: '',
      connected: false,
      connection: 'unknown',
      version: null,
      binAvailable: false,
      adminAvailable: false,
      webServerError: '',
      admin: null,
      proxies: {},
      visitors: {},
    };
  }

  async init() {
    try {
      const { stdout } = await execFileAsync(this.bin, ['-v'], {
        timeout: 8000,
        windowsHide: true,
      });
      this.state.version = stripAnsi(stdout).trim();
      this.state.binAvailable = true;
    } catch (error) {
      this.state.binAvailable = false;
      this.#addLog('system', `未找到可用的 frpc 可执行文件（${this.bin}）：${error.message}`, 'warn');
    }
    return this;
  }

  history(limit = 500) {
    const size = Math.max(1, Math.min(Number(limit) || 500, MAX_LOGS));
    return this.logs.slice(-size);
  }

  runtime() {
    const uptime = this.startedAtMs && ['running', 'starting', 'stopping'].includes(this.state.status)
      ? Math.max(0, Math.floor((Date.now() - this.startedAtMs) / 1000))
      : 0;
    const processInfo = {
      status: this.state.status,
      pid: this.state.pid,
      startedAt: this.state.startedAt,
      stoppedAt: this.state.stoppedAt,
      uptime,
      exitCode: this.state.exitCode,
      signal: this.state.signal,
      lastError: this.state.lastError,
      connected: this.state.connected,
      connection: this.state.connection,
      version: this.state.version,
      binAvailable: this.state.binAvailable,
      adminAvailable: this.state.adminAvailable,
      webServerError: this.state.webServerError,
      configPath: this.configPath,
    };
    return {
      process: processInfo,
      server: this.state.admin,
      proxies: Object.values(this.state.proxies),
      visitors: Object.values(this.state.visitors),
      generatedAt: nowIso(),
    };
  }

  async validateToml(toml) {
    const temp = path.join(this.dataDir, `.verify-${process.pid}-${Date.now()}.toml`);
    try {
      await fs.writeFile(temp, toml, { mode: 0o600 });
      return await this.validateFile(temp);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
  }

  async validateFile(file) {
    try {
      const { stdout, stderr } = await execFileAsync(this.bin, ['verify', '-c', file], {
        timeout: 20000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      return {
        ok: true,
        output: stripAnsi(`${stdout}${stderr}`).trim(),
        unavailable: false,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          ok: false,
          unavailable: true,
          output: '',
          message: `未找到 frpc 可执行文件（${this.bin}），已跳过 frpc 原生校验`,
        };
      }
      const output = stripAnsi(`${error.stdout || ''}${error.stderr || ''}`).trim();
      return {
        ok: false,
        unavailable: false,
        output,
        message: output || error.message || 'frpc 配置校验失败',
      };
    }
  }

  async start() {
    if (this.state.status === 'running' || this.state.status === 'starting') {
      return this.runtime();
    }
    if (!this.state.binAvailable) {
      await this.init();
      if (!this.state.binAvailable) throw new Error('frpc 未安装或不可执行');
    }
    if (!existsSync(this.configPath)) throw new Error(`配置文件不存在：${this.configPath}`);

    this.#clearRestartTimer();
    this.stopRequested = false;
    this.state.status = 'starting';
    this.state.connection = 'connecting';
    this.state.startedAt = nowIso();
    this.state.stoppedAt = null;
    this.state.exitCode = null;
    this.state.signal = null;
    this.state.lastError = '';
    this.state.webServerError = '';
    this.startedAtMs = Date.now();
    this.#emitState();

    let launchError = null;
    let child;
    try {
      child = spawn(this.bin, ['-c', this.configPath], {
        cwd: this.dataDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      this.#markStartFailure(error);
      throw error;
    }

    this.child = child;
    this.state.pid = child.pid || null;

    child.once('spawn', () => {
      this.state.status = 'running';
      this.state.pid = child.pid || this.state.pid;
      this.#addLog('system', `frpc 已启动（PID ${this.state.pid}）`, 'info');
      this.#emitState();
      this.#startAdminPolling();
      this.#startFileTail();
    });

    child.once('error', (error) => {
      launchError = error;
      this.#addLog('system', `frpc 启动失败：${error.message}`, 'error');
      this.#markStartFailure(error);
    });

    child.once('exit', (code, signal) => {
      this.#onExit(code, signal);
    });

    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue;
      const source = stream === child.stdout ? 'stdout' : 'stderr';
      const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
      lines.on('line', (line) => this.#addLog(source, line));
    }

    await sleep(450);
    if (launchError) throw launchError;
    if (this.child === child && child.exitCode === null && this.state.status === 'starting') {
      this.state.status = 'running';
      this.#emitState();
    }
    if (child.exitCode !== null) {
      throw new Error(this.state.lastError || 'frpc 进程启动后立即退出');
    }
    return this.runtime();
  }

  async stop({ quiet = false } = {}) {
    this.stopRequested = true;
    this.#clearRestartTimer();
    this.#stopAdminPolling();
    this.#stopFileTail();
    const child = this.child;
    if (!child) {
      this.state.status = 'stopped';
      this.state.pid = null;
      this.state.connected = false;
      this.state.connection = 'unknown';
      this.state.adminAvailable = false;
      this.state.admin = null;
      this.state.proxies = {};
      this.state.visitors = {};
      this.startedAtMs = null;
      this.#emitState();
      return this.runtime();
    }

    this.state.status = 'stopping';
    this.#emitState();
    this.stopRequested = true;

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        if (child.exitCode === null) {
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore.
          }
        }
        finish();
      }, 5000);
      child.once('exit', finish);
      try {
        child.kill('SIGTERM');
      } catch {
        finish();
      }
    });
    this.child = null;
    this.startedAtMs = null;
    this.state.pid = null;
    this.state.connected = false;
    this.state.connection = 'unknown';
    this.state.adminAvailable = false;
    this.state.admin = null;
    this.state.proxies = {};
    this.state.visitors = {};
    if (!quiet || this.state.status !== 'stopped') {
      this.state.status = 'stopped';
      this.#emitState();
    }
    return this.runtime();
  }

  async restart() {
    await this.stop({ quiet: true });
    await sleep(120);
    return this.start();
  }

  async dispose() {
    this.disposed = true;
    this.#clearRestartTimer();
    if (this.state.status === 'running' || this.state.status === 'starting') {
      await this.stop({ quiet: true });
    }
  }

  #onExit(code, signal) {
    this.#stopAdminPolling();
    this.#stopFileTail();
    const wasRequested = this.stopRequested;
    this.child = null;
    this.state.pid = null;
    this.state.connected = false;
    this.state.connection = 'offline';
    this.state.adminAvailable = false;
    this.state.admin = null;
    this.state.proxies = {};
    this.state.visitors = {};
    this.state.exitCode = code;
    this.state.signal = signal;
    this.state.stoppedAt = nowIso();
    this.startedAtMs = null;

    if (wasRequested) {
      this.state.status = 'stopped';
      this.#emitState();
      return;
    }

    this.state.status = code === 0 ? 'stopped' : 'error';
    this.state.lastError = code === 0
      ? 'frpc 进程已退出'
      : `frpc 进程异常退出（code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}）`;
    this.#addLog('system', this.state.lastError, code === 0 ? 'warn' : 'error');
    this.#emitState();

    const settings = this.getSettings() || {};
    if (!this.disposed && settings.autoRestart) {
      this.restartAttempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(this.restartAttempt, 5));
      this.#addLog('system', `${Math.round(delay / 1000)} 秒后尝试自动重启 frpc`, 'warn');
      this.restartTimer = setTimeout(() => {
        this.start().catch((error) => {
          this.#addLog('system', `自动重启失败：${error.message}`, 'error');
        });
      }, delay);
    }
  }

  #markStartFailure(error) {
    this.child = null;
    this.state.status = 'error';
    this.state.pid = null;
    this.state.lastError = error.message;
    this.state.connected = false;
    this.state.connection = 'offline';
    this.startedAtMs = null;
    this.#emitState();
  }

  #clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  #addLog(source, rawLine, levelOverride) {
    const line = stripAnsi(rawLine).replace(/\r$/, '');
    if (!line.trim()) return;
    // Our own status polling hits frpc's admin API every few seconds. frpc logs
    // every request, which would flood the useful log stream.
    if (source !== 'system' && /\[[^\]]*middleware\.go:\d+\]\s+http (request|response):?\s+\[\/api\//i.test(line)) return;
    const level = levelOverride || detectLevel(line);
    const entry = {
      seq: ++this.seq,
      t: nowIso(),
      level,
      source,
      text: line,
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    this.emit('log', entry);
    this.#inspectLine(line, level);
  }

  #inspectLine(line, level) {
    if (/login to server success/i.test(line)) {
      this.#setConnection('online');
    } else if (/try to connect to server/i.test(line)) {
      if (this.state.connection !== 'online') this.#setConnection('connecting');
    } else if (/connect to server error|login to server failed/i.test(line)) {
      this.#setConnection('offline');
    } else if (/connection closed|reconnect to server/i.test(line)) {
      if (!/success/i.test(line)) this.#setConnection('offline');
    }
    if (level === 'error') {
      this.state.lastError = line;
    }
    if (/start proxy success|start visitor success/i.test(line)) {
      this.#pollAdmin().catch(() => {});
    }
  }

  #setConnection(connection) {
    if (this.state.connection === connection) return;
    this.state.connection = connection;
    this.state.connected = connection === 'online';
    if (connection === 'online') this.state.lastError = '';
    this.#emitState();
  }

  #emitState() {
    this.emit('state', this.runtime());
  }

  #adminBaseUrl() {
    const config = this.getConfig() || {};
    const webServer = config.webServer || {};
    let host = String(webServer.addr || '127.0.0.1').trim();
    if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') host = '127.0.0.1';
    if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`;
    return `http://${host}:${Number(webServer.port) || 7400}`;
  }

  #adminHeaders() {
    const webServer = this.getConfig()?.webServer || {};
    if (!webServer.user && !webServer.password) return {};
    const token = Buffer.from(`${webServer.user || ''}:${webServer.password || ''}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  #startAdminPolling() {
    this.#stopAdminPolling();
    this.pollTimer = setInterval(() => {
      this.#pollAdmin().catch(() => {});
    }, 4000);
    this.pollTimer.unref?.();
    setTimeout(() => this.#pollAdmin().catch(() => {}), 600).unref?.();
  }

  #stopAdminPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async #pollAdmin() {
    if (this.polling || !this.state.binAvailable) return;
    if (!['running', 'starting'].includes(this.state.status)) return;
    this.polling = true;
    try {
      const config = this.getConfig() || {};
      const base = this.#adminBaseUrl();
      const headers = this.#adminHeaders();
      const request = (endpoint) => fetch(`${base}${endpoint}`, {
        headers,
        signal: AbortSignal.timeout(2500),
      }).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });

      const info = await request('/api/status');
      // frpc returns status grouped by proxy type:
      // { "tcp": [{ name, status, local_addr, remote_addr, ... }], "http": [...] }
      const proxies = {};
      if (info && typeof info === 'object' && !Array.isArray(info)) {
        for (const [type, items] of Object.entries(info)) {
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            proxies[item.name] = { ...item, type };
          }
        }
      }

      if (!['running', 'starting'].includes(this.state.status)) return;

      if (this.state.connection !== 'online' && Object.values(proxies).some((proxy) => proxy.status === 'running')) {
        this.#setConnection('online');
      }

      const changed = JSON.stringify(proxies) !== JSON.stringify(this.state.proxies)
        || JSON.stringify(info) !== JSON.stringify(this.state.admin)
        || !this.state.adminAvailable
        || this.state.webServerError;
      this.state.proxies = proxies;
      this.state.admin = info;
      this.state.adminAvailable = true;
      this.state.webServerError = '';
      if (changed) this.#emitState();
    } catch (error) {
      const message = error.name === 'TimeoutError' ? '管理接口响应超时' : error.message;
      const changed = this.state.adminAvailable || this.state.webServerError !== message;
      this.state.adminAvailable = false;
      this.state.webServerError = message;
      if (changed) this.#emitState();
    } finally {
      this.polling = false;
    }
  }

  #startFileTail() {
    this.#stopFileTail();
    const config = this.getConfig() || {};
    const target = String(config.log?.to || 'console');
    if (!target || target === 'console') return;
    const file = path.isAbsolute(target) ? target : path.resolve(this.dataDir, target);
    this.filePath = file;
    this.fileOffset = 0;
    this.fileRemainder = '';
    this.fileInitialized = false;
    this.fileTimer = setInterval(() => {
      this.#pollFileLog().catch(() => {});
    }, 1000);
    this.fileTimer.unref?.();
  }

  #stopFileTail() {
    if (this.fileTimer) {
      clearInterval(this.fileTimer);
      this.fileTimer = null;
    }
    this.fileOffset = 0;
    this.fileRemainder = '';
    this.fileInitialized = false;
  }

  async #pollFileLog() {
    if (!this.filePath) return;
    let stat;
    try {
      stat = await fs.stat(this.filePath);
    } catch {
      return;
    }
    if (!stat.isFile()) return;
    if (stat.size < this.fileOffset) {
      this.fileOffset = 0;
      this.fileRemainder = '';
      this.fileInitialized = false;
    }
    if (!this.fileInitialized) {
      this.fileOffset = Math.max(0, stat.size - 65536);
      this.fileInitialized = true;
    }
    if (stat.size <= this.fileOffset) return;

    const length = stat.size - this.fileOffset;
    const handle = await fs.open(this.filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, this.fileOffset);
      this.fileOffset = stat.size;
      let chunk = buffer.toString('utf8');
      if (this.fileRemainder) chunk = this.fileRemainder + chunk;
      const lines = chunk.split(/\r?\n/);
      this.fileRemainder = lines.pop() || '';
      for (const line of lines) this.#addLog('file', line);
    } finally {
      await handle.close();
    }
  }
}
