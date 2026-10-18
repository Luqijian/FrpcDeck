export const PROXY_TYPES = ['tcp', 'udp', 'http', 'https', 'tcpmux', 'stcp', 'sudp', 'xtcp'];
export const VISITOR_TYPES = ['stcp', 'sudp', 'xtcp'];
export const PROXY_PLUGIN_TYPES = [
  'unix_domain_socket',
  'http_proxy',
  'socks5',
  'static_file',
  'https2http',
  'https2https',
  'http2https',
  'http2http',
  'tls2raw',
  'virtual_net',
];
export const VISITOR_PLUGIN_TYPES = ['virtual_net'];
export const AUTH_METHODS = ['token', 'oidc'];
export const TRANSPORT_PROTOCOLS = ['tcp', 'kcp', 'quic', 'websocket', 'wss'];
export const WIRE_PROTOCOLS = ['v1', 'v2'];
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'];
export const BANDWIDTH_MODES = ['client', 'server'];
export const ADDITIONAL_AUTH_SCOPES = ['HeartBeats', 'NewWorkConns'];
export const PROXY_PROTOCOL_VERSIONS = ['v1', 'v2'];
export const HEALTH_CHECK_TYPES = ['tcp', 'http'];
export const MULTIPLEXERS = ['httpconnect'];

export const PLUGIN_REQUIRED_FIELDS = {
  unix_domain_socket: ['unixPath'],
  http_proxy: [],
  socks5: [],
  static_file: ['localPath'],
  https2http: ['localAddr', 'crtPath', 'keyPath'],
  https2https: ['localAddr', 'crtPath', 'keyPath'],
  http2https: ['localAddr'],
  http2http: ['localAddr'],
  tls2raw: ['localAddr', 'crtPath', 'keyPath'],
  virtual_net: [],
};

export const PLUGIN_LABELS = {
  unix_domain_socket: 'Unix Socket',
  http_proxy: 'HTTP 代理',
  socks5: 'SOCKS5 代理',
  static_file: '静态文件',
  https2http: 'HTTPS → HTTP',
  https2https: 'HTTPS → HTTPS',
  http2https: 'HTTP → HTTPS',
  http2http: 'HTTP → HTTP',
  tls2raw: 'TLS → Raw',
  virtual_net: 'VirtualNet',
};
