import crypto from 'node:crypto';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import {
  ADDITIONAL_AUTH_SCOPES,
  AUTH_METHODS,
  BANDWIDTH_MODES,
  HEALTH_CHECK_TYPES,
  LOG_LEVELS,
  MULTIPLEXERS,
  PLUGIN_REQUIRED_FIELDS,
  PROXY_PLUGIN_TYPES,
  PROXY_PROTOCOL_VERSIONS,
  PROXY_TYPES,
  TRANSPORT_PROTOCOLS,
  VISITOR_PLUGIN_TYPES,
  VISITOR_TYPES,
  WIRE_PROTOCOLS,
} from '../shared/constants.js';
import { batchPatternName, batchProxyNames, parsePortPairs } from '../shared/ports.js';
import { stringifyToml } from './toml.js';

const CONFIG_FORMAT_VERSION = 1;

const DEFAULT_LOG = {
  to: 'console',
  level: 'info',
  maxDays: 3,
  disablePrintColor: false,
};

const DEFAULT_AUTH = {
  method: 'token',
  token: '',
  additionalScopes: [],
  tokenSource: { type: '', file: { path: '' } },
  oidc: {
    clientID: '',
    clientSecret: '',
    audience: '',
    scope: '',
    tokenEndpointURL: '',
    additionalEndpointParams: {},
    trustedCaFile: '',
    insecureSkipVerify: false,
    proxyURL: '',
  },
};

const DEFAULT_TRANSPORT = {
  protocol: 'tcp',
  wireProtocol: '',
  dialServerTimeout: 10,
  dialServerKeepalive: 7200,
  poolCount: 0,
  tcpMux: true,
  tcpMuxKeepaliveInterval: 30,
  connectServerLocalIP: '',
  proxyURL: '',
  quic: {
    keepalivePeriod: 10,
    maxIdleTimeout: 30,
    maxIncomingStreams: 100000,
  },
  tls: {
    enable: true,
    certFile: '',
    keyFile: '',
    trustedCaFile: '',
    serverName: '',
    disableCustomTLSFirstByte: true,
  },
  heartbeatInterval: 10,
  heartbeatTimeout: 90,
};

const DEFAULT_WEBSERVER = {
  addr: '127.0.0.1',
  port: 7400,
  user: 'admin',
  password: '',
  assetsDir: '',
  pprofEnable: false,
};

const DEFAULT_PROXY = {
  name: '',
  type: 'tcp',
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
  multiplexer: '',
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
  batch: null,
};

const DEFAULT_VISITOR = {
  name: '',
  type: 'stcp',
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

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value) {
  return isPlainObject(value) ? { ...value } : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function str(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return typeof value === 'string' ? value : String(value);
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function intValue(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : value;
}

function stringArray(value) {
  return asArray(value)
    .map((item) => str(item).trim())
    .filter(Boolean);
}

function normalizeStringMap(value) {
  return Object.fromEntries(
    Object.entries(asObject(value)).map(([key, item]) => [key, str(item)]),
  );
}

function normalizeHeaders(value) {
  const source = asObject(value);
  const set = normalizeStringMap(source.set);
  return { ...source, set };
}

function normalizeHeaderList(value) {
  return asArray(value)
    .filter(isPlainObject)
    .map((item) => ({ name: str(item.name), value: str(item.value) }));
}

function normalizeProxy(input) {
  const source = asObject(input);
  const transport = { ...DEFAULT_PROXY.transport, ...asObject(source.transport) };
  const loadBalancer = { ...DEFAULT_PROXY.loadBalancer, ...asObject(source.loadBalancer) };
  const healthCheck = { ...DEFAULT_PROXY.healthCheck, ...asObject(source.healthCheck) };
  const plugin = { ...DEFAULT_PROXY.plugin, ...asObject(source.plugin) };
  const natTraversal = { ...DEFAULT_PROXY.natTraversal, ...asObject(source.natTraversal) };
  const batchSource = isPlainObject(source.batch) ? source.batch : null;

  return {
    ...source,
    name: str(source.name).trim(),
    type: str(source.type, 'tcp'),
    enabled: bool(source.enabled, true),
    localIP: str(source.localIP, '127.0.0.1'),
    localPort: batchSource ? undefined : intValue(source.localPort),
    remotePort: batchSource ? undefined : intValue(source.remotePort),
    subdomain: str(source.subdomain),
    customDomains: stringArray(source.customDomains),
    locations: stringArray(source.locations),
    httpUser: str(source.httpUser),
    httpPassword: str(source.httpPassword),
    hostHeaderRewrite: str(source.hostHeaderRewrite),
    routeByHTTPUser: str(source.routeByHTTPUser),
    requestHeaders: normalizeHeaders(source.requestHeaders),
    responseHeaders: normalizeHeaders(source.responseHeaders),
    multiplexer: str(source.multiplexer),
    secretKey: str(source.secretKey),
    allowUsers: stringArray(source.allowUsers),
    transport: {
      ...transport,
      bandwidthLimit: str(transport.bandwidthLimit),
      bandwidthLimitMode: str(transport.bandwidthLimitMode, 'client'),
      useEncryption: bool(transport.useEncryption, false),
      useCompression: bool(transport.useCompression, false),
      proxyProtocolVersion: str(transport.proxyProtocolVersion),
    },
    loadBalancer: {
      ...loadBalancer,
      group: str(loadBalancer.group),
      groupKey: str(loadBalancer.groupKey),
    },
    healthCheck: {
      ...healthCheck,
      type: str(healthCheck.type),
      path: str(healthCheck.path),
      httpHeaders: normalizeHeaderList(healthCheck.httpHeaders),
      intervalSeconds: intValue(healthCheck.intervalSeconds),
      maxFailed: intValue(healthCheck.maxFailed),
      timeoutSeconds: intValue(healthCheck.timeoutSeconds),
    },
    plugin: { ...plugin, type: str(plugin.type) },
    metadatas: normalizeStringMap(source.metadatas),
    annotations: normalizeStringMap(source.annotations),
    natTraversal: {
      ...natTraversal,
      disableAssistedAddrs: bool(natTraversal.disableAssistedAddrs, false),
    },
    batch: batchSource
      ? {
          localPorts: str(batchSource.localPorts).trim(),
          remotePorts: str(batchSource.remotePorts).trim(),
          namePattern: str(batchSource.namePattern, `${str(source.name)}-{localPort}`).trim(),
        }
      : null,
  };
}

function normalizeVisitor(input) {
  const source = asObject(input);
  const plugin = { ...DEFAULT_VISITOR.plugin, ...asObject(source.plugin) };
  const natTraversal = { ...DEFAULT_VISITOR.natTraversal, ...asObject(source.natTraversal) };
  return {
    ...source,
    name: str(source.name).trim(),
    type: str(source.type, 'stcp'),
    serverName: str(source.serverName).trim(),
    serverUser: str(source.serverUser).trim(),
    secretKey: str(source.secretKey),
    bindAddr: str(source.bindAddr, '127.0.0.1'),
    bindPort: intValue(source.bindPort),
    keepTunnelOpen: bool(source.keepTunnelOpen, false),
    maxRetriesAnHour: intValue(source.maxRetriesAnHour),
    minRetryInterval: intValue(source.minRetryInterval),
    fallbackTo: str(source.fallbackTo),
    fallbackTimeoutMs: intValue(source.fallbackTimeoutMs),
    plugin: { ...plugin, type: str(plugin.type) },
    natTraversal: {
      ...natTraversal,
      disableAssistedAddrs: bool(natTraversal.disableAssistedAddrs, false),
    },
  };
}

export function normalizeConfig(input) {
  const source = asObject(input);
  const log = { ...DEFAULT_LOG, ...asObject(source.log) };
  const auth = { ...DEFAULT_AUTH, ...asObject(source.auth) };
  const transport = { ...DEFAULT_TRANSPORT, ...asObject(source.transport) };
  const webServer = { ...DEFAULT_WEBSERVER, ...asObject(source.webServer) };
  const tokenSource = { ...DEFAULT_AUTH.tokenSource, ...asObject(auth.tokenSource) };
  const oidc = { ...DEFAULT_AUTH.oidc, ...asObject(auth.oidc) };
  const quic = { ...DEFAULT_TRANSPORT.quic, ...asObject(transport.quic) };
  const tls = { ...DEFAULT_TRANSPORT.tls, ...asObject(transport.tls) };

  const config = {
    ...source,
    clientID: str(source.clientID),
    user: str(source.user),
    serverAddr: str(source.serverAddr).trim(),
    serverPort: intValue(source.serverPort),
    natHoleStunServer: str(source.natHoleStunServer),
    loginFailExit: bool(source.loginFailExit, true),
    dnsServer: str(source.dnsServer),
    udpPacketSize: intValue(source.udpPacketSize),
    start: stringArray(source.start),
    includes: stringArray(source.includes),
    metadatas: normalizeStringMap(source.metadatas),
    featureGates: { ...asObject(source.featureGates) },
    virtualNet: { ...asObject(source.virtualNet), address: str(asObject(source.virtualNet).address) },
    log: {
      ...log,
      to: str(log.to, 'console'),
      level: str(log.level, 'info'),
      maxDays: intValue(log.maxDays),
      disablePrintColor: bool(log.disablePrintColor, false),
    },
    auth: {
      ...auth,
      method: str(auth.method, 'token'),
      token: str(auth.token),
      additionalScopes: stringArray(auth.additionalScopes),
      tokenSource: {
        ...tokenSource,
        type: str(tokenSource.type),
        file: { ...asObject(tokenSource.file), path: str(asObject(tokenSource.file).path) },
      },
      oidc: {
        ...oidc,
        clientID: str(oidc.clientID),
        clientSecret: str(oidc.clientSecret),
        audience: str(oidc.audience),
        scope: str(oidc.scope),
        tokenEndpointURL: str(oidc.tokenEndpointURL),
        additionalEndpointParams: normalizeStringMap(oidc.additionalEndpointParams),
        trustedCaFile: str(oidc.trustedCaFile),
        insecureSkipVerify: bool(oidc.insecureSkipVerify, false),
        proxyURL: str(oidc.proxyURL),
      },
    },
    transport: {
      ...transport,
      protocol: str(transport.protocol, 'tcp'),
      wireProtocol: str(transport.wireProtocol),
      dialServerTimeout: intValue(transport.dialServerTimeout),
      dialServerKeepalive: intValue(transport.dialServerKeepalive),
      poolCount: intValue(transport.poolCount),
      tcpMux: bool(transport.tcpMux, true),
      tcpMuxKeepaliveInterval: intValue(transport.tcpMuxKeepaliveInterval),
      connectServerLocalIP: str(transport.connectServerLocalIP),
      proxyURL: str(transport.proxyURL),
      quic: {
        ...quic,
        keepalivePeriod: intValue(quic.keepalivePeriod),
        maxIdleTimeout: intValue(quic.maxIdleTimeout),
        maxIncomingStreams: intValue(quic.maxIncomingStreams),
      },
      tls: {
        ...tls,
        enable: bool(tls.enable, true),
        certFile: str(tls.certFile),
        keyFile: str(tls.keyFile),
        trustedCaFile: str(tls.trustedCaFile),
        serverName: str(tls.serverName),
        disableCustomTLSFirstByte: bool(tls.disableCustomTLSFirstByte, true),
      },
      heartbeatInterval: intValue(transport.heartbeatInterval),
      heartbeatTimeout: intValue(transport.heartbeatTimeout),
    },
    webServer: {
      ...webServer,
      addr: str(webServer.addr, '127.0.0.1'),
      port: intValue(webServer.port),
      user: str(webServer.user),
      password: str(webServer.password),
      assetsDir: str(webServer.assetsDir),
      pprofEnable: bool(webServer.pprofEnable, false),
    },
    proxies: asArray(source.proxies).map(normalizeProxy),
    visitors: asArray(source.visitors).map(normalizeVisitor),
  };

  config.serverPort ??= 7000;
  config.udpPacketSize ??= 1500;
  config.webServer.port ??= 7400;
  return config;
}

export function createDefaultConfig() {
  return normalizeConfig({
    serverAddr: '',
    webServer: {
      ...DEFAULT_WEBSERVER,
      password: crypto.randomBytes(12).toString('base64url'),
    },
  });
}

const OMIT_TRUE_DEFAULTS = new Set([
  'enabled',
  'loginFailExit',
  'tcpMux',
  'enable',
  'disableCustomTLSFirstByte',
]);

const OMIT_FALSE_DEFAULTS = new Set([
  'useEncryption',
  'useCompression',
  'disablePrintColor',
  'pprofEnable',
  'insecureSkipVerify',
  'disableAssistedAddrs',
  'keepTunnelOpen',
]);

const OMIT_STRING_DEFAULTS = new Map([
  ['bandwidthLimitMode', 'client'],
]);

const OMIT_NUMBER_DEFAULTS = new Map([
  ['poolCount', 0],
  ['udpPacketSize', 1500],
  ['maxDays', 3],
  ['dialServerTimeout', 10],
  ['dialServerKeepalive', 7200],
  ['tcpMuxKeepaliveInterval', 30],
  ['heartbeatInterval', 10],
  ['heartbeatTimeout', 90],
  ['keepalivePeriod', 10],
  ['maxIdleTimeout', 30],
  ['maxIncomingStreams', 100000],
  ['intervalSeconds', 10],
  ['maxFailed', 3],
  ['timeoutSeconds', 3],
  ['maxRetriesAnHour', 8],
  ['minRetryInterval', 90],
  ['fallbackTimeoutMs', 500],
]);

/**
 * Turns the internal model into the minimal set of keys that frpc needs.
 * Default-valued fields are omitted to keep the generated TOML readable.
 */
export function compactConfig(input) {
  const compacted = compactObject(input);
  // Always keep the admin API settings: the panel needs them for live status.
  if (!compacted.webServer) {
    const source = asObject(input).webServer || DEFAULT_WEBSERVER;
    compacted.webServer = compactObject({ ...DEFAULT_WEBSERVER, ...source });
  }
  return compacted;
}

function compactObject(input) {
  const source = asObject(input);
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('_') || key === 'rawTemplate') continue;
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      if (value === '') continue;
      if (OMIT_STRING_DEFAULTS.get(key) === value) continue;
      output[key] = value;
      continue;
    }

    if (typeof value === 'boolean') {
      if (value === true && OMIT_TRUE_DEFAULTS.has(key)) continue;
      if (value === false && OMIT_FALSE_DEFAULTS.has(key)) continue;
      output[key] = value;
      continue;
    }

    if (typeof value === 'number') {
      if (OMIT_NUMBER_DEFAULTS.get(key) === value) continue;
      output[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      const items = [];
      for (const item of value) {
        if (isPlainObject(item)) {
          items.push(compactObject(item));
        } else if (typeof item === 'string') {
          if (item !== '') items.push(item);
        } else if (typeof item === 'number' || typeof item === 'boolean') {
          items.push(item);
        }
      }
      if (items.length > 0) output[key] = items;
      continue;
    }

    if (isPlainObject(value)) {
      const child = compactObject(value);
      if (Object.keys(child).length > 0) output[key] = child;
      continue;
    }
  }
  return output;
}

const TOML_HEADER = [
  'frpc 配置 · 由 FrpcDeck 生成',
  '建议通过 Web 面板修改。手动编辑后可在“连接配置 → 导入配置”中重新载入。',
  '文档：https://github.com/fatedier/frp',
].join('\n');

const TOML_COMMENTS = {
  log: '日志',
  auth: '身份认证',
  'auth.tokenSource': '从文件读取 token',
  'auth.oidc': 'OIDC 认证',
  transport: '连接 frps 的传输设置',
  'transport.quic': 'QUIC 传输选项',
  'transport.tls': 'TLS 设置',
  webServer: 'frpc 管理接口（面板实时状态依赖此接口）',
  proxies: '代理',
  visitors: '访问器（visitor）',
};

export function generateToml(input) {
  const config = normalizeConfig(input);
  const base = stringifyToml(
    compactConfig({ ...config, proxies: [], visitors: [] }),
    { header: TOML_HEADER, comments: TOML_COMMENTS },
  ).trimEnd();
  const blocks = [];
  for (const proxy of config.proxies) {
    if (proxy.batch) blocks.push(renderBatchBlock(proxy));
    else blocks.push(renderEntityBlock('proxies', proxy, '代理'));
  }
  for (const visitor of config.visitors) {
    blocks.push(renderEntityBlock('visitors', visitor, '访问器（visitor）'));
  }
  return `${[base, ...blocks].filter(Boolean).join('\n\n')}\n`;
}

function renderEntityBlock(key, entity, comment) {
  return stringifyToml({ [key]: [compactObject(entity)] }, {
    comments: { [key]: comment },
  }).trim();
}

function renderBatchBlock(proxy) {
  const batch = proxy.batch;
  const sample = {
    ...compactObject(proxy),
    name: '__FRPCDECK_BATCH_NAME__',
    localPort: 60000,
    remotePort: 60001,
  };
  delete sample.batch;
  let block = renderEntityBlock('proxies', sample, '批量代理');
  const goNamePattern = batch.namePattern
    .replaceAll('{localPort}', '{{ $v.First }}')
    .replaceAll('{remotePort}', '{{ $v.Second }}');
  block = block.replace(
    'name = "__FRPCDECK_BATCH_NAME__"',
    `name = ${JSON.stringify(goNamePattern)}`,
  );
  block = block.replace(/^localPort = 60000$/m, 'localPort = {{ $v.First }}');
  block = block.replace(/^remotePort = 60001$/m, 'remotePort = {{ $v.Second }}');
  return [
    `{{- range $_, $v := parseNumberRangePair ${JSON.stringify(batch.localPorts)} ${JSON.stringify(batch.remotePorts)} }}`,
    block,
    '{{- end }}',
  ].join('\n');
}

function issue(path, message, level = 'error', label = '') {
  return { path, message, level, label };
}

function checkPort(issues, path, label, value, { allowZero = false, allowNegative = false } = {}) {
  if (value === undefined || value === '') {
    issues.push(issue(path, `${label}不能为空`, 'error', label));
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.push(issue(path, `${label}必须是整数`, 'error', label));
    return;
  }
  const min = allowNegative ? -1 : allowZero ? 0 : 1;
  if (value < min || value > 65535) {
    issues.push(
      issue(path, `${label}必须在 ${min} – 65535 之间`, 'error', label),
    );
  }
}

function checkPositive(issues, path, label, value, { allowZero = false } = {}) {
  if (value === undefined || value === '') return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(issue(path, `${label}必须是数字`, 'error', label));
    return;
  }
  if (value < (allowZero ? 0 : 1)) {
    issues.push(issue(path, `${label}必须大于${allowZero ? '等于' : ''} 0`, 'error', label));
  }
}

function pluginRequiresField(type, field) {
  return (PLUGIN_REQUIRED_FIELDS[type] || []).includes(field);
}

function validateHeaders(issues, path, headers, label) {
  asArray(headers).forEach((header, index) => {
    if (!str(header.name).trim()) {
      issues.push(issue(`${path}.${index}.name`, `${label}第 ${index + 1} 项的 Header 名称不能为空`, 'error', label));
    }
  });
}

export function validateConfig(input) {
  const config = normalizeConfig(input);
  const issues = [];

  if (!config.serverAddr) {
    issues.push(issue('serverAddr', '请填写 frps 服务器地址', 'error', '服务器地址'));
  } else if (/\s/.test(config.serverAddr)) {
    issues.push(issue('serverAddr', '服务器地址不能包含空格', 'error', '服务器地址'));
  }
  checkPort(issues, 'serverPort', '服务器端口', config.serverPort);
  if (config.user && /[\s.]/.test(config.user)) {
    issues.push(issue('user', '用户名不能包含空格或点号', 'warning', '用户'));
  }
  if (!['trace', 'debug', 'info', 'warn', 'error'].includes(config.log.level)) {
    issues.push(issue('log.level', '日志级别无效', 'error', '日志级别'));
  }
  if (!config.log.to) {
    issues.push(issue('log.to', '日志输出位置不能为空', 'error', '日志输出'));
  }
  if (config.log.maxDays !== undefined && (typeof config.log.maxDays !== 'number' || config.log.maxDays < 0)) {
    issues.push(issue('log.maxDays', '日志保留天数不能小于 0', 'error', '保留天数'));
  }

  if (!AUTH_METHODS.includes(config.auth.method)) {
    issues.push(issue('auth.method', '认证方式必须是 token 或 oidc', 'error', '认证方式'));
  }
  if (config.auth.method === 'token') {
    if (config.auth.tokenSource.type) {
      if (config.auth.token) {
        issues.push(issue('auth.token', 'token 与 tokenSource 不能同时设置', 'error', 'Token'));
      }
      if (!['file'].includes(config.auth.tokenSource.type)) {
        issues.push(issue('auth.tokenSource.type', 'tokenSource 目前仅支持 file', 'error', 'Token 来源'));
      }
      if (!config.auth.tokenSource.file.path) {
        issues.push(issue('auth.tokenSource.file.path', '请选择 token 文件路径', 'error', 'Token 文件'));
      }
    }
  }
  config.auth.additionalScopes.forEach((scope, index) => {
    if (!ADDITIONAL_AUTH_SCOPES.includes(scope)) {
      issues.push(issue(`auth.additionalScopes.${index}`, `未知的认证范围：${scope}`, 'warning', '认证范围'));
    }
  });
  if (config.auth.method === 'oidc') {
    for (const [field, label] of [
      ['clientID', 'OIDC Client ID'],
      ['clientSecret', 'OIDC Client Secret'],
      ['tokenEndpointURL', 'OIDC Token Endpoint'],
    ]) {
      if (!config.auth.oidc[field]) {
        issues.push(issue(`auth.oidc.${field}`, `使用 OIDC 时必须填写 ${label}`, 'error', label));
      }
    }
    if (config.auth.oidc.tokenEndpointURL) {
      try {
        new URL(config.auth.oidc.tokenEndpointURL);
      } catch {
        issues.push(issue('auth.oidc.tokenEndpointURL', 'OIDC Token Endpoint 不是合法 URL', 'error', 'Token Endpoint'));
      }
    }
  }

  if (!TRANSPORT_PROTOCOLS.includes(config.transport.protocol)) {
    issues.push(issue('transport.protocol', '传输协议无效', 'error', '传输协议'));
  }
  if (config.transport.wireProtocol && !WIRE_PROTOCOLS.includes(config.transport.wireProtocol)) {
    issues.push(issue('transport.wireProtocol', 'FRP 线路协议仅支持 v1 或 v2', 'error', '线路协议'));
  }
  checkPositive(issues, 'transport.poolCount', '连接池数量', config.transport.poolCount, { allowZero: true });
  checkPositive(issues, 'transport.dialServerTimeout', '连接超时', config.transport.dialServerTimeout);
  checkPositive(issues, 'transport.heartbeatInterval', '心跳间隔', config.transport.heartbeatInterval);
  checkPositive(issues, 'transport.heartbeatTimeout', '心跳超时', config.transport.heartbeatTimeout);
  if (config.transport.tls.certFile && !config.transport.tls.keyFile) {
    issues.push(issue('transport.tls.keyFile', '设置客户端证书时还需要私钥文件', 'warning', 'TLS 私钥'));
  }
  if (!config.transport.tls.certFile && config.transport.tls.keyFile) {
    issues.push(issue('transport.tls.certFile', '设置私钥文件时还需要客户端证书', 'warning', 'TLS 证书'));
  }

  if (!config.webServer.addr) {
    issues.push(issue('webServer.addr', '管理接口监听地址不能为空', 'error', '管理地址'));
  }
  checkPort(issues, 'webServer.port', '管理接口端口', config.webServer.port);
  if (config.webServer.user && !config.webServer.password) {
    issues.push(issue('webServer.password', '已设置管理用户名，建议同时设置密码', 'warning', '管理密码'));
  }
  if (config.webServer.pprofEnable) {
    issues.push(issue('webServer.pprofEnable', 'pprof 会暴露诊断信息，请确保管理接口只监听内网', 'warning', 'pprof'));
  }
  if (config.webServer.port === config.serverPort) {
    issues.push(issue('webServer.port', '管理接口端口不能与 frps 端口相同', 'error', '管理端口'));
  }

  if (config.includes.length > 0) {
    issues.push(issue('includes', 'includes 中定义的代理不会显示在面板中，建议迁移到面板管理', 'warning', '包含文件'));
  }
  if (config.start.length > 0) {
    issues.push(issue('start', 'start 白名单会覆盖各代理的启用开关', 'warning', '启动白名单'));
    for (const name of config.start) {
      if (!config.proxies.some((proxy) => proxy.name === name)) {
        issues.push(issue('start', `start 中的代理 “${name}” 不存在`, 'warning', '启动白名单'));
      }
    }
  }
  if (config.featureGates.VirtualNet && !config.virtualNet.address) {
    issues.push(issue('virtualNet.address', '启用 VirtualNet 后需要填写虚拟网络地址，例如 100.86.1.1/24', 'warning', 'VirtualNet'));
  }

  const proxyNames = new Set();
  config.proxies.forEach((proxy, index) => {
    const prefix = `proxies.${index}`;
    const isBatch = Boolean(proxy.batch);
    if (!proxy.name) {
      issues.push(issue(`${prefix}.name`, `第 ${index + 1} 个代理缺少名称`, 'error', '代理名称'));
    } else if (proxyNames.has(proxy.name)) {
      issues.push(issue(`${prefix}.name`, `代理名称 “${proxy.name}” 重复`, 'error', '代理名称'));
    } else {
      proxyNames.add(proxy.name);
    }

    if (!PROXY_TYPES.includes(proxy.type)) {
      issues.push(issue(`${prefix}.type`, `未知的代理类型：${proxy.type}`, 'error', '代理类型'));
      return;
    }
    if (isBatch && !['tcp', 'udp'].includes(proxy.type)) {
      issues.push(issue(`${prefix}.batch`, '批量端口仅支持 TCP / UDP 类型', 'error', '批量端口'));
    }

    const hasPlugin = Boolean(proxy.plugin.type);
    if (isBatch && hasPlugin) {
      issues.push(issue(`${prefix}.plugin.type`, '批量端口暂不支持插件', 'error', '插件'));
    }
    if (hasPlugin && !PROXY_PLUGIN_TYPES.includes(proxy.plugin.type)) {
      issues.push(issue(`${prefix}.plugin.type`, `未知的插件类型：${proxy.plugin.type}`, 'error', '插件类型'));
    }
    for (const field of PLUGIN_REQUIRED_FIELDS[proxy.plugin.type] || []) {
      if (!str(proxy.plugin[field])) {
        issues.push(issue(`${prefix}.plugin.${field}`, `插件 “${proxy.plugin.type}” 缺少 ${field}`, 'error', '插件配置'));
      }
    }

    if (!hasPlugin) {
      if (!proxy.localIP) {
        issues.push(issue(`${prefix}.localIP`, '本地服务地址不能为空', 'error', '本地地址'));
      }
      if (!isBatch) checkPort(issues, `${prefix}.localPort`, '本地端口', proxy.localPort);
    }

    if (isBatch) {
      const batch = proxy.batch;
      if (!batch.namePattern) {
        issues.push(issue(`${prefix}.batch.namePattern`, '批量端口名称模板不能为空', 'error', '批量名称'));
      } else if (!/\{(?:localPort|remotePort)\}/.test(batch.namePattern)) {
        issues.push(issue(`${prefix}.batch.namePattern`, '批量端口名称模板必须包含 {localPort} 或 {remotePort}', 'error', '批量名称'));
      }
      try {
        const names = batchProxyNames(proxy);
        if (names.length === 0) {
          issues.push(issue(`${prefix}.batch`, '批量端口范围不能为空', 'error', '批量端口'));
        }
        const localNames = new Set();
        for (const name of names) {
          if (localNames.has(name)) {
            issues.push(issue(`${prefix}.batch.namePattern`, `批量名称 “${name}” 重复`, 'error', '批量名称'));
            break;
          }
          localNames.add(name);
          if (proxyNames.has(name)) {
            issues.push(issue(`${prefix}.batch.namePattern`, `生成的代理名称 “${name}” 与其他代理重复`, 'error', '批量名称'));
            break;
          }
          proxyNames.add(name);
        }
      } catch (error) {
        issues.push(issue(`${prefix}.batch`, error.message, 'error', '批量端口'));
      }
    } else if (['tcp', 'udp'].includes(proxy.type)) {
      if (proxy.remotePort === undefined || proxy.remotePort === '') {
        issues.push(issue(`${prefix}.remotePort`, 'TCP/UDP 代理必须填写远程端口', 'error', '远程端口'));
      } else if (typeof proxy.remotePort !== 'number' || proxy.remotePort < 0 || proxy.remotePort > 65535) {
        issues.push(issue(`${prefix}.remotePort`, '远程端口必须在 0 – 65535 之间（0 表示随机分配）', 'error', '远程端口'));
      }
    }

    if (['http', 'https', 'tcpmux'].includes(proxy.type)) {
      if (!proxy.subdomain && proxy.customDomains.length === 0) {
        issues.push(issue(`${prefix}.subdomain`, 'HTTP/HTTPS/TCPMUX 代理需要自定义域名或子域名', 'error', '访问域名'));
      }
    }
    if (proxy.locations.length > 0 && proxy.type !== 'http') {
      issues.push(issue(`${prefix}.locations`, 'locations 仅对 HTTP 类型有效', 'warning', '路径'));
    }
    if (proxy.type === 'tcpmux' && !MULTIPLEXERS.includes(proxy.multiplexer)) {
      issues.push(issue(`${prefix}.multiplexer`, 'TCPMUX 多路复用器必须为 httpconnect', 'error', '多路复用器'));
    }
    if (['stcp', 'sudp', 'xtcp'].includes(proxy.type) && !proxy.secretKey) {
      issues.push(issue(`${prefix}.secretKey`, '建议为秘密代理设置 secretKey，否则访问者无法安全连接', 'warning', '密钥'));
    }
    if (proxy.routeByHTTPUser && !['http', 'tcpmux'].includes(proxy.type)) {
      issues.push(issue(`${prefix}.routeByHTTPUser`, 'routeByHTTPUser 仅对 HTTP/TCPMUX 类型有效', 'warning', 'HTTP 用户路由'));
    }

    if (proxy.transport.bandwidthLimit && !/^\d+(\.\d+)?\s?(KB|MB|GB)?$/i.test(proxy.transport.bandwidthLimit)) {
      issues.push(issue(`${prefix}.transport.bandwidthLimit`, '带宽限制格式示例：1MB 或 500KB', 'warning', '带宽限制'));
    }
    if (proxy.transport.bandwidthLimitMode && !BANDWIDTH_MODES.includes(proxy.transport.bandwidthLimitMode)) {
      issues.push(issue(`${prefix}.transport.bandwidthLimitMode`, '带宽限制位置必须是 client 或 server', 'error', '限速位置'));
    }
    if (proxy.transport.proxyProtocolVersion && !PROXY_PROTOCOL_VERSIONS.includes(proxy.transport.proxyProtocolVersion)) {
      issues.push(issue(`${prefix}.transport.proxyProtocolVersion`, 'Proxy Protocol 版本仅支持 v1 或 v2', 'error', 'Proxy Protocol'));
    }

    if (proxy.healthCheck.type) {
      if (!HEALTH_CHECK_TYPES.includes(proxy.healthCheck.type)) {
        issues.push(issue(`${prefix}.healthCheck.type`, '健康检查类型仅支持 tcp 或 http', 'error', '健康检查'));
      }
      if (proxy.healthCheck.type === 'http' && !proxy.healthCheck.path) {
        issues.push(issue(`${prefix}.healthCheck.path`, 'HTTP 健康检查需要填写路径', 'error', '健康检查路径'));
      }
      checkPositive(issues, `${prefix}.healthCheck.intervalSeconds`, '健康检查间隔', proxy.healthCheck.intervalSeconds);
      checkPositive(issues, `${prefix}.healthCheck.timeoutSeconds`, '健康检查超时', proxy.healthCheck.timeoutSeconds);
      checkPositive(issues, `${prefix}.healthCheck.maxFailed`, '最大失败次数', proxy.healthCheck.maxFailed);
      validateHeaders(issues, `${prefix}.healthCheck.httpHeaders`, proxy.healthCheck.httpHeaders, '健康检查');
    }
    validateHeaders(issues, `${prefix}.requestHeaders.set`, Object.entries(proxy.requestHeaders?.set || {}).map(([name, value]) => ({ name, value })), '请求');
    validateHeaders(issues, `${prefix}.responseHeaders.set`, Object.entries(proxy.responseHeaders?.set || {}).map(([name, value]) => ({ name, value })), '响应');
  });

  const visitorNames = new Set();
  config.visitors.forEach((visitor, index) => {
    const prefix = `visitors.${index}`;
    if (!visitor.name) {
      issues.push(issue(`${prefix}.name`, `第 ${index + 1} 个访问器缺少名称`, 'error', '访问器名称'));
    } else if (visitorNames.has(visitor.name)) {
      issues.push(issue(`${prefix}.name`, `访问器名称 “${visitor.name}” 重复`, 'error', '访问器名称'));
    } else {
      visitorNames.add(visitor.name);
    }
    if (!VISITOR_TYPES.includes(visitor.type)) {
      issues.push(issue(`${prefix}.type`, `未知的访问器类型：${visitor.type}`, 'error', '访问器类型'));
      return;
    }
    if (!visitor.serverName) {
      issues.push(issue(`${prefix}.serverName`, '请填写要访问的代理名称', 'error', '目标代理'));
    }
    if (['stcp', 'sudp', 'xtcp'].includes(visitor.type) && !visitor.secretKey) {
      issues.push(issue(`${prefix}.secretKey`, '建议填写与服务端一致的 secretKey', 'warning', '密钥'));
    }
    if (!visitor.bindAddr) {
      issues.push(issue(`${prefix}.bindAddr`, '绑定地址不能为空', 'error', '绑定地址'));
    }
    if (visitor.bindPort === undefined || visitor.bindPort === '') {
      issues.push(issue(`${prefix}.bindPort`, '请填写本地绑定端口', 'error', '绑定端口'));
    } else if (typeof visitor.bindPort !== 'number' || visitor.bindPort < -1 || visitor.bindPort > 65535) {
      issues.push(issue(`${prefix}.bindPort`, '绑定端口必须在 -1 – 65535 之间', 'error', '绑定端口'));
    } else if (visitor.bindPort === 0) {
      issues.push(issue(`${prefix}.bindPort`, '绑定端口不能为 0', 'error', '绑定端口'));
    }
    if (visitor.type === 'sudp' && visitor.bindPort === -1) {
      issues.push(issue(`${prefix}.bindPort`, 'SUDP 访问器不支持 -1 端口', 'error', '绑定端口'));
    }
    if (visitor.plugin.type) {
      if (!VISITOR_PLUGIN_TYPES.includes(visitor.plugin.type)) {
        issues.push(issue(`${prefix}.plugin.type`, `未知的访问器插件：${visitor.plugin.type}`, 'error', '插件类型'));
      }
      if (visitor.plugin.type === 'virtual_net' && !str(visitor.plugin.destinationIP)) {
        issues.push(issue(`${prefix}.plugin.destinationIP`, 'VirtualNet 访问器需要填写目标 IP', 'error', '目标 IP'));
      }
    }
    if (visitor.keepTunnelOpen && visitor.type !== 'xtcp') {
      issues.push(issue(`${prefix}.keepTunnelOpen`, '保持隧道仅对 XTCP 访问器有效', 'warning', '保持隧道'));
    }
    if (visitor.fallbackTo && visitor.type !== 'xtcp') {
      issues.push(issue(`${prefix}.fallbackTo`, 'fallbackTo 仅对 XTCP 访问器有效', 'warning', '回退目标'));
    }
  });

  return issues;
}

export function hasErrors(issues) {
  return issues.some((item) => item.level === 'error');
}

/**
 * Detect and parse TOML / YAML / JSON / legacy INI.
 * @returns {{config: object, format: string, warnings: string[]}}
 */
export function parseConfigText(text, filename = '') {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('配置文件内容为空');
  }
  if (text.length > 1024 * 1024) {
    throw new Error('配置文件超过 1 MB，无法导入');
  }
  const extension = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  let format = '';
  let parsed;
  const warnings = [];

  if (extension === 'ini') {
    format = 'ini';
    parsed = iniToRaw(parseIni(text));
    warnings.push('已从旧版 INI 格式转换，部分不支持的字段可能被忽略');
  } else if (extension === 'yaml' || extension === 'yml') {
    format = 'yaml';
    parsed = parseYaml(text);
  } else if (extension === 'json') {
    format = 'json';
    parsed = JSON.parse(text);
  } else if (extension === 'toml') {
    format = 'toml';
    parsed = parseTomlDocument(text, warnings);
  } else if (/^\s*\[common\]\s*$/im.test(text)) {
    format = 'ini';
    parsed = iniToRaw(parseIni(text));
    warnings.push('已从旧版 INI 格式转换，部分不支持的字段可能被忽略');
  } else {
    format = 'toml';
    try {
      parsed = parseTomlDocument(text, warnings);
    } catch (tomlError) {
      if (text.includes('{{')) throw tomlError;
      try {
        format = 'yaml';
        parsed = parseYaml(text);
      } catch {
        throw new Error(`无法识别配置格式：${tomlError.message}`);
      }
    }
  }

  if (!isPlainObject(parsed)) {
    throw new Error('配置文件根节点必须是一个对象');
  }
  return { config: normalizeConfig(parsed), raw: parsed, format, warnings };
}

function parseTomlDocument(text, warnings) {
  try {
    return parseToml(text);
  } catch (error) {
    if (!text.includes('{{')) throw error;
    const extracted = parseBatchTemplates(text);
    if (!extracted) {
      throw new Error('暂不支持该 Go 模板写法：仅支持 parseNumberRangePair 批量端口配置');
    }
    warnings.push(`已识别 ${extracted.count} 个批量端口配置，将作为单个代理展示`);
    return extracted.parsed;
  }
}

function parseBatchTemplates(text) {
  const rangePattern = /\{\{-?\s*range\s+(?:\$\w+\s*,\s*)?\$(\w+)\s*:=\s*parseNumberRangePair\s+"([^"]*)"\s+"([^"]*)"\s*-?\}\}([\s\S]*?)\{\{-?\s*end\s*-?\}\}/g;
  const proxies = [];
  let remaining = text;
  let match;
  let count = 0;

  while ((match = rangePattern.exec(text))) {
    const [full, variable, localPorts, remotePorts, body] = match;
    let pairs;
    try {
      pairs = parsePortPairs(localPorts, remotePorts);
    } catch (error) {
      throw new Error(`批量端口范围无效：${error.message}`);
    }
    const firstExpression = new RegExp(`\\{\\{-?\\s*\\$${variable}\\.First\\s*-?\\}\\}`, 'g');
    const secondExpression = new RegExp(`\\{\\{-?\\s*\\$${variable}\\.Second\\s*-?\\}\\}`, 'g');
    const nameMatch = body.match(/^\s*name\s*=\s*("(?:[^"\\]|\\.)*")\s*$/m);
    if (!nameMatch) throw new Error('批量端口块中的代理缺少 name');

    const namePatternRaw = nameMatch[1]
      .replace(firstExpression, '{localPort}')
      .replace(secondExpression, '{remotePort}');
    const namePattern = parseToml(`name = ${namePatternRaw}`).name;
    const unsupportedBody = body
      .replace(/^\s*name\s*=.*$/m, '')
      .replace(/^\s*localPort\s*=.*$/m, '')
      .replace(/^\s*remotePort\s*=.*$/m, '');
    if (/\{\{/.test(unsupportedBody)) {
      throw new Error('批量端口块只支持在 name / localPort / remotePort 中使用 $v.First / $v.Second');
    }
    const bodyWithSample = body
      .replace(firstExpression, String(pairs[0].localPort))
      .replace(secondExpression, String(pairs[0].remotePort));
    if (/\{\{/.test(bodyWithSample)) {
      throw new Error('批量端口块只支持在 name / localPort / remotePort 中使用 $v.First / $v.Second');
    }
    const fragment = parseToml(bodyWithSample);
    if (!Array.isArray(fragment.proxies) || fragment.proxies.length !== 1) {
      throw new Error('批量端口块必须且只能包含一个 [[proxies]]');
    }
    const proxy = fragment.proxies[0];
    delete proxy.localPort;
    delete proxy.remotePort;
    proxy.batch = { localPorts, remotePorts, namePattern };
    proxy.name = batchPatternName({ name: proxy.name, batch: proxy.batch });
    proxies.push(proxy);
    remaining = remaining.replace(full, '\n');
    count += 1;
  }

  if (count === 0) return null;
  if (/\{\{/.test(remaining)) {
    throw new Error('暂不支持 parseNumberRangePair 之外的自定义模板表达式');
  }
  const parsed = remaining.trim() ? parseToml(remaining) : {};
  parsed.proxies = [...(parsed.proxies || []), ...proxies];
  return { parsed, count };
}

function splitList(value) {
  const text = str(value).trim();
  if (!text) return [];
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function coerceIniValue(value) {
  const text = str(value).trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

function parseIni(text) {
  const sections = new Map();
  let current = 'common';
  sections.set(current, {});
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      if (!sections.has(current)) sections.set(current, {});
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    sections.get(current)[key] = value;
  }
  return sections;
}

const INI_COMMON_MAP = {
  server_addr: ['serverAddr'],
  server_port: ['serverPort'],
  user: ['user'],
  client_id: ['clientID'],
  login_fail_exit: ['loginFailExit'],
  protocol: ['transport', 'protocol'],
  wire_protocol: ['transport', 'wireProtocol'],
  tls_enable: ['transport', 'tls', 'enable'],
  tls_cert_file: ['transport', 'tls', 'certFile'],
  tls_key_file: ['transport', 'tls', 'keyFile'],
  tls_trusted_ca_file: ['transport', 'tls', 'trustedCaFile'],
  tls_server_name: ['transport', 'tls', 'serverName'],
  disable_custom_tls_first_byte: ['transport', 'tls', 'disableCustomTLSFirstByte'],
  pool_count: ['transport', 'poolCount'],
  tcp_mux: ['transport', 'tcpMux'],
  tcp_mux_keepalive_interval: ['transport', 'tcpMuxKeepaliveInterval'],
  dial_server_timeout: ['transport', 'dialServerTimeout'],
  dial_server_keepalive: ['transport', 'dialServerKeepalive'],
  heartbeat_interval: ['transport', 'heartbeatInterval'],
  heartbeat_timeout: ['transport', 'heartbeatTimeout'],
  token: ['auth', 'token'],
  authentication_method: ['auth', 'method'],
  oidc_client_id: ['auth', 'oidc', 'clientID'],
  oidc_client_secret: ['auth', 'oidc', 'clientSecret'],
  oidc_audience: ['auth', 'oidc', 'audience'],
  oidc_scope: ['auth', 'oidc', 'scope'],
  oidc_token_endpoint_url: ['auth', 'oidc', 'tokenEndpointURL'],
  log_file: ['log', 'to'],
  log_level: ['log', 'level'],
  log_max_days: ['log', 'maxDays'],
  dns_server: ['dnsServer'],
  udp_packet_size: ['udpPacketSize'],
  admin_addr: ['webServer', 'addr'],
  admin_port: ['webServer', 'port'],
  admin_user: ['webServer', 'user'],
  admin_pwd: ['webServer', 'password'],
  nat_hole_stun_server: ['natHoleStunServer'],
  start: ['start'],
  includes: ['includes'],
};

const INI_PROXY_MAP = {
  type: ['type'],
  local_ip: ['localIP'],
  local_port: ['localPort'],
  remote_port: ['remotePort'],
  custom_domains: ['customDomains'],
  subdomain: ['subdomain'],
  locations: ['locations'],
  http_user: ['httpUser'],
  http_password: ['httpPassword'],
  host_header_rewrite: ['hostHeaderRewrite'],
  route_by_http_user: ['routeByHTTPUser'],
  multiplexer: ['multiplexer'],
  secret_key: ['secretKey'],
  allow_users: ['allowUsers'],
  use_encryption: ['transport', 'useEncryption'],
  use_compression: ['transport', 'useCompression'],
  bandwidth_limit: ['transport', 'bandwidthLimit'],
  bandwidth_limit_mode: ['transport', 'bandwidthLimitMode'],
  proxy_protocol_version: ['transport', 'proxyProtocolVersion'],
  group: ['loadBalancer', 'group'],
  group_key: ['loadBalancer', 'groupKey'],
  health_check_type: ['healthCheck', 'type'],
  health_check_timeout_s: ['healthCheck', 'timeoutSeconds'],
  health_check_max_failed: ['healthCheck', 'maxFailed'],
  health_check_interval_s: ['healthCheck', 'intervalSeconds'],
  health_check_url: ['healthCheck', 'path'],
  plugin: ['plugin', 'type'],
  plugin_local_addr: ['plugin', 'localAddr'],
  plugin_crt_path: ['plugin', 'crtPath'],
  plugin_key_path: ['plugin', 'keyPath'],
  plugin_host_header_rewrite: ['plugin', 'hostHeaderRewrite'],
  plugin_local_path: ['plugin', 'localPath'],
  plugin_strip_prefix: ['plugin', 'stripPrefix'],
  plugin_http_user: ['plugin', 'httpUser'],
  plugin_http_password: ['plugin', 'httpPassword'],
  plugin_unix_path: ['plugin', 'unixPath'],
  plugin_user: ['plugin', 'username'],
  plugin_password: ['plugin', 'password'],
  server_name: ['serverName'],
  server_user: ['serverUser'],
  bind_addr: ['bindAddr'],
  bind_port: ['bindPort'],
  keep_tunnel_open: ['keepTunnelOpen'],
  max_retries_an_hour: ['maxRetriesAnHour'],
  min_retry_interval: ['minRetryInterval'],
  fallback_to: ['fallbackTo'],
  fallback_timeout_ms: ['fallbackTimeoutMs'],
};

function setDeep(target, path, value) {
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!isPlainObject(current[key])) current[key] = {};
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

function iniToRaw(sections) {
  const config = { serverAddr: '', webServer: {} };
  const common = sections.get('common') || {};
  for (const [key, value] of Object.entries(common)) {
    const target = INI_COMMON_MAP[key];
    if (!target) continue;
    let parsed = coerceIniValue(value);
    if (['custom_domains', 'locations', 'allow_users', 'start', 'includes'].includes(key)) {
      parsed = splitList(value);
    }
    setDeep(config, target, parsed);
  }

  const proxies = [];
  const visitors = [];
  for (const [section, values] of sections.entries()) {
    if (section === 'common') continue;
    const item = { name: section };
    const isVisitor = str(values.role).toLowerCase() === 'visitor';
    for (const [key, value] of Object.entries(values)) {
      if (key === 'role') continue;
      const target = INI_PROXY_MAP[key];
      if (!target) {
        if (key.startsWith('meta_')) {
          if (!item.metadatas) item.metadatas = {};
          item.metadatas[key.slice(5)] = value;
        }
        continue;
      }
      let parsed = coerceIniValue(value);
      if (['custom_domains', 'locations', 'allow_users'].includes(key)) {
        parsed = splitList(value);
      }
      setDeep(item, target, parsed);
    }
    if (isVisitor) visitors.push(item);
    else proxies.push(item);
  }
  if (proxies.length) config.proxies = proxies;
  if (visitors.length) config.visitors = visitors;
  return config;
}

export const CONFIG_VERSION = CONFIG_FORMAT_VERSION;
