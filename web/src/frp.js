import {
  PROXY_PLUGIN_TYPES,
  PROXY_TYPES,
  VISITOR_PLUGIN_TYPES,
  VISITOR_TYPES,
} from '@shared/constants.js';

export const TYPE_META = {
  tcp: {
    label: 'TCP',
    name: 'TCP 隧道',
    description: '转发 SSH、RDP、数据库等任意 TCP 服务',
    color: '#4f9cff',
    icon: 'network',
  },
  udp: {
    label: 'UDP',
    name: 'UDP 隧道',
    description: '转发 DNS、游戏、语音等 UDP 服务',
    color: '#71c8ff',
    icon: 'radio',
  },
  http: {
    label: 'HTTP',
    name: 'HTTP 网站',
    description: '通过域名访问本地 HTTP 服务',
    color: '#3ee0b0',
    icon: 'globe',
  },
  https: {
    label: 'HTTPS',
    name: 'HTTPS 网站',
    description: '通过域名访问本地 HTTPS 服务',
    color: '#2fd0c8',
    icon: 'shield',
  },
  tcpmux: {
    label: 'TCPMUX',
    name: 'TCPMUX 复用',
    description: '使用 HTTP CONNECT 复用单个端口',
    color: '#b18cff',
    icon: 'split',
  },
  stcp: {
    label: 'STCP',
    name: '秘密 TCP',
    description: '需要访问器连接的加密 TCP 隧道',
    color: '#ffb454',
    icon: 'lock',
  },
  sudp: {
    label: 'SUDP',
    name: '秘密 UDP',
    description: '需要访问器连接的加密 UDP 隧道',
    color: '#ff9f6e',
    icon: 'waves',
  },
  xtcp: {
    label: 'XTCP',
    name: 'P2P 穿透',
    description: '点对点 NAT 穿透，流量不经过 frps',
    color: '#ff7aa2',
    icon: 'zap',
  },
};

export const TYPE_CHOICES = PROXY_TYPES.map((value) => ({ value, ...TYPE_META[value] }));
export const VISITOR_TYPE_CHOICES = VISITOR_TYPES.map((value) => ({ value, ...TYPE_META[value] }));
export { PROXY_PLUGIN_TYPES, VISITOR_PLUGIN_TYPES };

export const PLUGIN_META = {
  unix_domain_socket: { label: 'Unix Socket', description: '转发本机 Unix Socket' },
  http_proxy: { label: 'HTTP 代理', description: '将连接作为 HTTP 代理处理' },
  socks5: { label: 'SOCKS5 代理', description: '将连接作为 SOCKS5 代理处理' },
  static_file: { label: '静态文件', description: '直接提供本地目录中的静态文件' },
  https2http: { label: 'HTTPS → HTTP', description: '将 HTTPS 请求解密后转发到本地 HTTP' },
  https2https: { label: 'HTTPS → HTTPS', description: '将 HTTPS 请求解密后转发到本地 HTTPS' },
  http2https: { label: 'HTTP → HTTPS', description: '将 HTTP 请求转发到本地 HTTPS' },
  http2http: { label: 'HTTP → HTTP', description: '将 HTTP 请求转发到本地 HTTP' },
  tls2raw: { label: 'TLS → 原始', description: '解密 TLS 后转发原始 TCP' },
  virtual_net: { label: 'VirtualNet', description: '加入虚拟网络' },
};

export const PLUGIN_FIELDS = {
  unix_domain_socket: [
    { key: 'unixPath', label: 'Unix Socket 路径', placeholder: '/var/run/docker.sock' },
  ],
  http_proxy: [
    { key: 'httpUser', label: '代理用户名', placeholder: '可留空' },
    { key: 'httpPassword', label: '代理密码', type: 'password' },
  ],
  socks5: [
    { key: 'username', label: '用户名', placeholder: '可留空' },
    { key: 'password', label: '密码', type: 'password' },
  ],
  static_file: [
    { key: 'localPath', label: '本地目录', placeholder: '/var/www' },
    { key: 'stripPrefix', label: 'URL 前缀剥离', placeholder: 'static' },
    { key: 'httpUser', label: 'HTTP 用户名', placeholder: '可留空' },
    { key: 'httpPassword', label: 'HTTP 密码', type: 'password' },
  ],
  https2http: [
    { key: 'localAddr', label: '本地地址', placeholder: '127.0.0.1:80' },
    { key: 'crtPath', label: '证书路径', placeholder: './server.crt' },
    { key: 'keyPath', label: '私钥路径', placeholder: './server.key' },
    { key: 'hostHeaderRewrite', label: 'Host 重写', placeholder: '127.0.0.1' },
  ],
  https2https: [
    { key: 'localAddr', label: '本地地址', placeholder: '127.0.0.1:443' },
    { key: 'crtPath', label: '证书路径', placeholder: './server.crt' },
    { key: 'keyPath', label: '私钥路径', placeholder: './server.key' },
    { key: 'hostHeaderRewrite', label: 'Host 重写', placeholder: '127.0.0.1' },
  ],
  http2https: [
    { key: 'localAddr', label: '本地地址', placeholder: '127.0.0.1:443' },
    { key: 'hostHeaderRewrite', label: 'Host 重写', placeholder: '127.0.0.1' },
  ],
  http2http: [
    { key: 'localAddr', label: '本地地址', placeholder: '127.0.0.1:80' },
    { key: 'hostHeaderRewrite', label: 'Host 重写', placeholder: '127.0.0.1' },
  ],
  tls2raw: [
    { key: 'localAddr', label: '本地地址', placeholder: '127.0.0.1:80' },
    { key: 'crtPath', label: '证书路径', placeholder: './server.crt' },
    { key: 'keyPath', label: '私钥路径', placeholder: './server.key' },
  ],
  virtual_net: [],
};

export const PLUGIN_DEFAULTS = {
  unix_domain_socket: { unixPath: '' },
  http_proxy: { httpUser: '', httpPassword: '' },
  socks5: { username: '', password: '' },
  static_file: { localPath: '', stripPrefix: '', httpUser: '', httpPassword: '' },
  https2http: { localAddr: '', crtPath: '', keyPath: '', hostHeaderRewrite: '', requestHeaders: { set: {} } },
  https2https: { localAddr: '', crtPath: '', keyPath: '', hostHeaderRewrite: '', requestHeaders: { set: {} } },
  http2https: { localAddr: '', hostHeaderRewrite: '', requestHeaders: { set: {} } },
  http2http: { localAddr: '', hostHeaderRewrite: '', requestHeaders: { set: {} } },
  tls2raw: { localAddr: '', crtPath: '', keyPath: '' },
  virtual_net: {},
};

export const LOCAL_PRESETS = [
  { label: 'SSH', port: 22, type: 'tcp' },
  { label: '远程桌面', port: 3389, type: 'tcp' },
  { label: 'HTTP', port: 80, type: 'http' },
  { label: 'HTTPS', port: 443, type: 'https' },
  { label: 'MySQL', port: 3306, type: 'tcp' },
  { label: 'PostgreSQL', port: 5432, type: 'tcp' },
];

export function makeSecret(length = 24) {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('');
  }
  return Math.random().toString(36).slice(2).padEnd(length, 'x').slice(0, length);
}

export function createProxy(type = 'tcp', name = '') {
  return {
    name,
    type,
    enabled: true,
    localIP: '127.0.0.1',
    localPort: undefined,
    remotePort: undefined,
    subdomain: '',
    customDomains: [],
    locations: [],
    httpUser: '',
    httpPassword: '',
    hostHeaderRewrite: '',
    routeByHTTPUser: '',
    requestHeaders: { set: {} },
    responseHeaders: { set: {} },
    multiplexer: type === 'tcpmux' ? 'httpconnect' : '',
    secretKey: '',
    allowUsers: [],
    transport: {
      bandwidthLimit: '',
      bandwidthLimitMode: 'client',
      useEncryption: false,
      useCompression: false,
      proxyProtocolVersion: '',
    },
    loadBalancer: { group: '', groupKey: '' },
    healthCheck: {
      type: '',
      path: '',
      httpHeaders: [],
      intervalSeconds: 10,
      maxFailed: 3,
      timeoutSeconds: 3,
    },
    plugin: { type: '' },
    metadatas: {},
    annotations: {},
    natTraversal: { disableAssistedAddrs: false },
  };
}

export function createVisitor(type = 'stcp', name = '') {
  return {
    name,
    type,
    serverName: '',
    serverUser: '',
    secretKey: '',
    bindAddr: '127.0.0.1',
    bindPort: undefined,
    keepTunnelOpen: false,
    maxRetriesAnHour: 8,
    minRetryInterval: 90,
    fallbackTo: '',
    fallbackTimeoutMs: 500,
    plugin: { type: '' },
    natTraversal: { disableAssistedAddrs: false },
  };
}

export function nextName(items, base, excludeName = '') {
  const names = new Set(items.map((item) => item.name).filter((name) => name && name !== excludeName));
  let index = 1;
  while (names.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function proxyLocal(proxy) {
  if (proxy.plugin?.type) return PLUGIN_META[proxy.plugin.type]?.label || proxy.plugin.type;
  return `${proxy.localIP || '127.0.0.1'}:${proxy.localPort || '—'}`;
}

export function proxyEndpoint(proxy, serverAddr = '') {
  if (proxy.plugin?.type) return PLUGIN_META[proxy.plugin.type]?.label || proxy.plugin.type;
  if (['tcp', 'udp'].includes(proxy.type)) {
    if (proxy.remotePort === 0) return '随机端口';
    return proxy.remotePort ? `${serverAddr || 'frps'}:${proxy.remotePort}` : '未设置远程端口';
  }
  if (['http', 'https'].includes(proxy.type)) {
    if (proxy.customDomains?.length) return proxy.customDomains[0];
    if (proxy.subdomain) return `${proxy.subdomain}.<子域名>`;
  }
  if (proxy.type === 'tcpmux') {
    return proxy.customDomains?.[0] || '未设置域名';
  }
  if (['stcp', 'sudp', 'xtcp'].includes(proxy.type)) {
    return `访问器 → ${proxy.name || '未命名'}`;
  }
  return '—';
}

export function proxyMeta(proxy) {
  return TYPE_META[proxy.type] || TYPE_META.tcp;
}

export function visitorEndpoint(visitor) {
  if (visitor.plugin?.type === 'virtual_net') {
    return `VirtualNet ${visitor.plugin.destinationIP || ''}`.trim();
  }
  return `${visitor.bindAddr || '127.0.0.1'}:${visitor.bindPort ?? '—'}`;
}

export function runtimeProxyMap(runtimeProxies = []) {
  const map = new Map();
  for (const proxy of runtimeProxies) map.set(proxy.name, proxy);
  return map;
}

function splitHostPort(value) {
  const text = String(value || '');
  if (!text) return { host: '', port: undefined };
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end > 0) {
      const host = text.slice(1, end);
      const port = text.slice(end + 1).replace(/^:/, '');
      return { host, port: port ? Number(port) : undefined };
    }
  }
  const index = text.lastIndexOf(':');
  if (index < 0) return { host: text, port: undefined };
  return {
    host: text.slice(0, index),
    port: Number(text.slice(index + 1)) || undefined,
  };
}

export function runtimeProxyToDisplay(proxy = {}) {
  const local = splitHostPort(proxy.local_addr);
  const remote = splitHostPort(proxy.remote_addr);
  return {
    ...proxy,
    name: proxy.name || '',
    type: proxy.type || 'tcp',
    enabled: proxy.status !== 'disabled',
    localIP: local.host,
    localPort: local.port,
    remotePort: remote.port,
    remoteAddr: proxy.remote_addr || '',
    customDomains: Array.isArray(proxy.custom_domains) ? proxy.custom_domains : [],
    _runtime: true,
  };
}

export function proxyRuntimeStatus(proxy, runtimeMap) {
  if (!proxy.enabled) return 'disabled';
  const live = runtimeMap.get(proxy.name);
  if (!live) return 'pending';
  return live.status || 'pending';
}

export const STATUS_META = {
  running: { label: '运行中', tone: 'success' },
  online: { label: '已连接', tone: 'success' },
  new: { label: '启动中', tone: 'warning' },
  waiting: { label: '等待中', tone: 'warning' },
  start: { label: '启动中', tone: 'warning' },
  pending: { label: '同步中', tone: 'muted' },
  draft: { label: '待应用', tone: 'warning' },
  disabled: { label: '已停用', tone: 'muted' },
  offline: { label: '离线', tone: 'danger' },
  error: { label: '异常', tone: 'danger' },
  stopped: { label: '未运行', tone: 'muted' },
  unknown: { label: '未知', tone: 'muted' },
  configured: { label: '已配置', tone: 'muted' },
};

export function statusOf(value) {
  return STATUS_META[value] || { label: value || '未知', tone: 'muted' };
}

export function jsonClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function pluginDefaults(type) {
  return { type, ...(PLUGIN_DEFAULTS[type] || {}) };
}

export function visitorPluginDefaults(type) {
  return type === 'virtual_net' ? { type, destinationIP: '' } : { type };
}

export function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m`;
  if (value < 86400) return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
  return `${Math.floor(value / 86400)}d ${Math.floor((value % 86400) / 3600)}h`;
}
