import { batchProxyNames } from '../shared/ports.js';

const HISTORY_LIMIT = 60;
const SAMPLE_INTERVAL_MS = 15000;
const FETCH_TIMEOUT_MS = 3500;
const PROXY_TYPES = ['tcp', 'udp', 'http', 'https', 'tcpmux', 'stcp', 'sudp', 'xtcp'];

function expectedProxyNames(config) {
  const names = new Set();
  for (const proxy of config?.proxies || []) {
    if (!proxy?.name) continue;
    names.add(proxy.name);
    if (proxy.batch) {
      try {
        for (const name of batchProxyNames(proxy)) names.add(name);
      } catch {
        // Invalid ranges are reported by config validation.
      }
    }
  }
  return names;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBaseUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return (/^https?:\/\//i.test(value) ? value : `http://${value}`).replace(/\/+$/, '');
}

function derivedUrl(config) {
  const address = String(config?.serverAddr || '').trim();
  if (!address) return '';
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  return `http://${host}:7500`;
}

export class FrpsMonitor {
  constructor({ getConfig, getSettings }) {
    this.getConfig = getConfig;
    this.getSettings = getSettings;
    this.timer = null;
    this.wakeTimer = null;
    this.polling = false;
    this.disposed = false;
    this.lastSample = null;
    this.history = [];
    this.state = {
      enabled: false,
      configured: false,
      available: false,
      error: '',
      sampledAt: null,
      url: '',
      server: null,
      today: { in: 0, out: 0, connections: 0 },
      proxies: [],
      history: [],
    };
  }

  start() {
    this.disposed = false;
    this.#schedule();
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.poll().catch(() => {});
    }, 1200);
    this.wakeTimer.unref?.();
    return this;
  }

  stop() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.timer = null;
    this.wakeTimer = null;
    this.polling = false;
  }

  wake() {
    if (this.disposed || this.wakeTimer) return;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.poll().catch(() => {});
    }, 80);
    this.wakeTimer.unref?.();
  }

  #schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.poll().catch(() => {}), SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
  }

  snapshot() {
    const settings = this.getSettings()?.monitor || {};
    return {
      ...this.state,
      enabled: Boolean(settings.enabled),
      configured: Boolean(settings.url || derivedUrl(this.getConfig())),
      history: this.history,
      intervalSeconds: SAMPLE_INTERVAL_MS / 1000,
    };
  }

  async poll() {
    if (this.polling || this.disposed) return this.snapshot();
    const settings = this.getSettings()?.monitor || {};
    if (!settings.enabled) {
      this.lastSample = null;
      this.history = [];
      this.state = {
        enabled: false,
        configured: false,
        available: false,
        error: '',
        sampledAt: null,
        url: '',
        server: null,
        today: { in: 0, out: 0, connections: 0 },
        proxies: [],
        history: [],
      };
      return this.snapshot();
    }

    const url = normalizeBaseUrl(settings.url) || derivedUrl(this.getConfig());
    if (!url) {
      this.state = {
        ...this.state,
        enabled: true,
        configured: false,
        available: false,
        error: '请填写 frps Dashboard 地址',
        url: '',
        history: this.history,
      };
      return this.snapshot();
    }

    this.polling = true;
    const headers = {};
    if (settings.username || settings.password) {
      headers.Authorization = `Basic ${Buffer.from(`${settings.username || ''}:${settings.password || ''}`).toString('base64')}`;
    }
    try {
      const request = (endpoint) => fetch(`${url}${endpoint}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          throw new Error('frps Dashboard 认证失败');
        }
        if (!response.ok) throw new Error(`frps Dashboard 返回 HTTP ${response.status}`);
        return response.json();
      });

      const server = await request('/api/serverinfo');
      const config = this.getConfig() || {};
      const expected = expectedProxyNames(config);
      const prefix = config.user ? `${config.user}.` : '';
      const types = [...new Set((config.proxies || []).map((proxy) => proxy.type).filter((type) => PROXY_TYPES.includes(type)))];
      const results = await Promise.allSettled(types.map((type) => request(`/api/proxy/${type}`)));
      const proxies = [];
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        for (const item of result.value?.proxies || []) {
          if (!item || typeof item !== 'object') continue;
          const rawName = String(item.name || '');
          const localName = prefix && rawName.startsWith(prefix) ? rawName.slice(prefix.length) : rawName;
          if (expected.size && !expected.has(rawName) && !expected.has(localName)) continue;
          proxies.push({
            name: rawName,
            type: String(item.conf?.type || item.type || ''),
            status: String(item.status || ''),
            trafficIn: number(item.todayTrafficIn),
            trafficOut: number(item.todayTrafficOut),
            connections: number(item.curConns),
            lastStartTime: item.lastStartTime || '',
            lastCloseTime: item.lastCloseTime || '',
          });
        }
      }

      const now = Date.now();
      const totalIn = number(server.totalTrafficIn);
      const totalOut = number(server.totalTrafficOut);
      const previous = this.lastSample;
      let instantIn = 0;
      let instantOut = 0;
      if (previous && now > previous.at) {
        const seconds = (now - previous.at) / 1000;
        if (totalIn >= previous.in) instantIn = (totalIn - previous.in) / seconds;
        if (totalOut >= previous.out) instantOut = (totalOut - previous.out) / seconds;
      }
      const previousRate = this.state.server || {};
      const smooth = (oldValue, nextValue) => (
        previous ? oldValue * 0.55 + nextValue * 0.45 : nextValue
      );
      const inBps = smooth(number(previousRate.inBps), instantIn);
      const outBps = smooth(number(previousRate.outBps), instantOut);
      this.lastSample = { at: now, in: totalIn, out: totalOut };

      const todayIn = proxies.reduce((sum, proxy) => sum + proxy.trafficIn, 0);
      const todayOut = proxies.reduce((sum, proxy) => sum + proxy.trafficOut, 0);
      const proxyConnections = proxies.reduce((sum, proxy) => sum + proxy.connections, 0);
      const sampledAt = new Date(now).toISOString();
      this.history.push({ t: sampledAt, inBps, outBps, connections: number(server.curConns) || proxyConnections });
      if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);

      this.state = {
        enabled: true,
        configured: true,
        available: true,
        error: '',
        sampledAt,
        url,
        server: {
          version: String(server.version || ''),
          clientCounts: number(server.clientCounts),
          connections: number(server.curConns),
          totalIn,
          totalOut,
          inBps,
          outBps,
        },
        today: { in: todayIn, out: todayOut, connections: proxyConnections },
        proxies: proxies.sort((a, b) => (b.trafficIn + b.trafficOut) - (a.trafficIn + a.trafficOut)),
        history: this.history,
      };
    } catch (error) {
      this.state = {
        ...this.state,
        enabled: true,
        configured: true,
        available: false,
        error: error.name === 'TimeoutError' ? 'frps Dashboard 响应超时' : error.message,
        url,
        sampledAt: new Date().toISOString(),
        history: this.history,
      };
    } finally {
      this.polling = false;
    }
    return this.snapshot();
  }
}
