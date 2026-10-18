import { reactive } from 'vue';
import { api } from './api';

let eventSource = null;
let runtimeTimer = null;

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const prefersLight = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches;

function initialTheme() {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem('frpcdeck-theme') || (prefersLight() ? 'light' : 'dark');
}

export const store = reactive({
  ready: false,
  auth: {
    initialized: false,
    authenticated: false,
    envManaged: false,
    username: 'admin',
  },
  config: null,
  savedConfig: null,
  savedAt: null,
  settings: { autoStart: true, autoRestart: false },
  runtime: {
    process: {
      status: 'stopped',
      pid: null,
      startedAt: null,
      uptime: 0,
      connected: false,
      connection: 'unknown',
      version: null,
      binAvailable: false,
      adminAvailable: false,
      lastError: '',
    },
    proxies: [],
    visitors: [],
    server: null,
  },
  frpc: {},
  app: {},
  warnings: [],
  issues: [],
  logs: [],
  sseStatus: 'closed',
  lastEventAt: null,
  toasts: [],
  theme: initialTheme(),
  saving: false,
  initializing: false,
  busy: false,

  get dirty() {
    if (!this.config || !this.savedConfig) return false;
    return JSON.stringify(this.config) !== JSON.stringify(this.savedConfig);
  },

  get initialized() {
    return Boolean(this.auth.initialized);
  },

  get authenticated() {
    return Boolean(this.auth.authenticated);
  },

  get runtimeStatus() {
    return this.runtime?.process?.status || 'stopped';
  },

  get connection() {
    return this.runtime?.process?.connection || 'unknown';
  },
});

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  store.theme = next;
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  localStorage.setItem('frpcdeck-theme', next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#f3f6f9' : '#080b10');
}

export function toggleTheme() {
  applyTheme(store.theme === 'dark' ? 'light' : 'dark');
}

export function toast(message, type = 'info', duration = 4200) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  store.toasts.push({ id, message: String(message || ''), type });
  if (store.toasts.length > 4) store.toasts.shift();
  setTimeout(() => dismissToast(id), duration);
  return id;
}

export function dismissToast(id) {
  const index = store.toasts.findIndex((item) => item.id === id);
  if (index >= 0) store.toasts.splice(index, 1);
}

function setUnauthenticated() {
  store.auth.authenticated = false;
  store.auth.user = null;
  disconnectEvents();
  stopRuntimePolling();
}

function resetState() {
  store.config = null;
  store.savedConfig = null;
  store.savedAt = null;
  store.logs = [];
  store.issues = [];
  store.warnings = [];
  store.runtime = {
    process: {
      status: 'stopped',
      pid: null,
      startedAt: null,
      uptime: 0,
      connected: false,
      connection: 'unknown',
      version: null,
      binAvailable: false,
      adminAvailable: false,
      lastError: '',
    },
    proxies: [],
    visitors: [],
    server: null,
  };
}

export async function init() {
  if (store.ready || store.initializing) return;
  store.initializing = true;
  try {
    const status = await api.get('/api/auth/status');
    store.auth = { ...store.auth, ...status };
    if (status.authenticated) {
      await loadBootstrap();
    }
  } catch (error) {
    toast(error.message || '无法连接到服务器', 'error', 6000);
  } finally {
    store.ready = true;
    store.initializing = false;
  }
}

async function loadBootstrap() {
  const data = await api.get('/api/bootstrap');
  store.auth = { ...store.auth, ...data.auth, authenticated: true, user: data.auth.username };
  store.config = data.config;
  store.savedConfig = clone(data.config);
  store.savedAt = data.savedAt;
  store.settings = data.settings;
  store.runtime = data.runtime;
  store.frpc = data.frpc;
  store.app = data.app;
  store.warnings = data.warnings || [];
  store.issues = [];
  connectEvents();
  startRuntimePolling();
}

export async function login(username, password) {
  const data = await api.post('/api/auth/login', { username, password });
  store.auth = { ...store.auth, ...data, authenticated: true };
  await loadBootstrap();
  return data;
}

export async function setup(username, password) {
  const data = await api.post('/api/auth/setup', { username, password });
  store.auth = { ...store.auth, ...data, authenticated: true };
  await loadBootstrap();
  return data;
}

export async function logout() {
  try {
    await api.post('/api/auth/logout', {});
  } catch {
    // The local session is cleared even if the request fails.
  }
  setUnauthenticated();
  resetState();
  store.ready = true;
}

export function handleUnauthorized() {
  if (!store.auth.authenticated) return;
  setUnauthenticated();
  toast('登录状态已失效，请重新登录', 'error');
}

function connectEvents() {
  disconnectEvents();
  if (typeof EventSource === 'undefined') return;
  store.sseStatus = 'connecting';
  eventSource = new EventSource('/api/events');
  eventSource.onopen = () => {
    store.sseStatus = 'open';
    store.lastEventAt = Date.now();
  };
  eventSource.onerror = () => {
    store.sseStatus = 'reconnecting';
  };
  eventSource.addEventListener('hello', (event) => {
    const data = JSON.parse(event.data);
    if (Array.isArray(data.logs)) {
      const merged = new Map();
      for (const entry of [...store.logs, ...data.logs]) merged.set(entry.seq, entry);
      store.logs = [...merged.values()].sort((a, b) => a.seq - b.seq).slice(-1500);
    }
    if (data.runtime) store.runtime = data.runtime;
    store.sseStatus = 'open';
    store.lastEventAt = Date.now();
  });
  eventSource.addEventListener('log', (event) => {
    const entry = JSON.parse(event.data);
    store.logs.push(entry);
    if (store.logs.length > 1500) store.logs.splice(0, store.logs.length - 1500);
    store.lastEventAt = Date.now();
  });
  eventSource.addEventListener('state', (event) => {
    store.runtime = JSON.parse(event.data);
    store.lastEventAt = Date.now();
  });
}

function disconnectEvents() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  store.sseStatus = 'closed';
}

function startRuntimePolling() {
  stopRuntimePolling();
  runtimeTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && store.auth.authenticated) {
      refreshRuntime().catch(() => {});
    }
  }, 15000);
}

function stopRuntimePolling() {
  if (runtimeTimer) {
    clearInterval(runtimeTimer);
    runtimeTimer = null;
  }
}

export async function refreshRuntime() {
  const data = await api.get('/api/runtime');
  store.runtime = data;
  return data;
}

export async function refreshLogs(limit = 1000) {
  const data = await api.get(`/api/logs?limit=${limit}`);
  const merged = new Map();
  for (const entry of [...(data.logs || []), ...store.logs]) merged.set(entry.seq, entry);
  store.logs = [...merged.values()].sort((a, b) => a.seq - b.seq).slice(-1500);
  return data;
}

export async function saveConfig({ restart = true } = {}) {
  if (store.saving) return null;
  store.saving = true;
  try {
    const result = await api.put('/api/config', { config: store.config, restart });
    store.config = result.config;
    store.savedConfig = clone(result.config);
    store.savedAt = result.savedAt;
    store.issues = result.issues || [];
    if (result.runtime) store.runtime = result.runtime;
    if (result.apply?.attempted && !result.apply.ok) {
      toast(`配置已保存，但 frpc 未能启动：${result.apply.error}`, 'error', 8000);
    } else if (result.restartRequired) {
      toast('配置已保存，重启 frpc 后生效', 'info');
    } else if (result.apply?.attempted) {
      toast('配置已应用，frpc 已更新', 'success');
    } else {
      toast('配置已保存', 'success');
    }
    if (result.verify?.unavailable) {
      toast('未找到 frpc，已跳过 frpc 原生校验', 'info');
    }
    return result;
  } catch (error) {
    if (error.details?.issues) store.issues = error.details.issues;
    toast(error.message || '保存失败', 'error', 8000);
    throw error;
  } finally {
    store.saving = false;
  }
}

export function discardChanges() {
  if (!store.savedConfig) return;
  store.config = clone(store.savedConfig);
  store.issues = [];
}

export async function validateDraft() {
  const result = await api.post('/api/config/validate', { config: store.config });
  store.issues = result.issues || [];
  return result;
}

export async function previewToml() {
  const result = await api.post('/api/config/validate', { config: store.config });
  store.issues = result.issues || [];
  return result;
}

export async function importConfig(content, filename) {
  return api.post('/api/config/import', { content, filename });
}

export async function saveSettings(patch) {
  const result = await api.put('/api/settings', patch);
  store.settings = result.settings;
  return result.settings;
}

export async function changePassword(currentPassword, password) {
  const data = await api.post('/api/auth/password', { currentPassword, password });
  store.auth = { ...store.auth, ...data, authenticated: true };
  return data;
}

export async function runtimeAction(action) {
  store.busy = true;
  try {
    const result = await api.post(`/api/runtime/${action}`, {});
    store.runtime = result.runtime;
    if (action === 'stop') toast('frpc 已停止', 'info');
    else if (action === 'restart') toast('frpc 已重启', 'success');
    else toast('frpc 已启动', 'success');
    return result;
  } catch (error) {
    toast(error.message || '操作失败', 'error', 6000);
    throw error;
  } finally {
    store.busy = false;
  }
}

export async function resetConfig() {
  const result = await api.post('/api/config/reset', { confirm: 'RESET' });
  store.config = result.config;
  store.savedConfig = clone(result.config);
  store.savedAt = result.savedAt;
  store.runtime = result.runtime;
  store.issues = result.issues || [];
  toast('配置已重置', 'success');
  return result;
}

export function formatUptime(seconds) {
  const value = Number(seconds) || 0;
  if (value < 60) return `${value} 秒`;
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

export function formatTime(value, withSeconds = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  });
}

export function timeAgo(value) {
  if (!value) return '—';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}
