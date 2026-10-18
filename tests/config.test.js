import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createDefaultConfig,
  generateToml,
  normalizeConfig,
  parseConfigText,
  validateConfig,
} from '../server/config.js';
import { stringifyToml } from '../server/toml.js';

const templateText = fs.readFileSync(new URL('./fixtures/frpc_template.toml', import.meta.url), 'utf8');

const baseConfig = {
  serverAddr: 'frps.example.com',
  serverPort: 7000,
  auth: { method: 'token', token: 'super-secret' },
  webServer: { addr: '127.0.0.1', port: 7400, user: 'admin', password: 'monitor-secret' },
  proxies: [
    {
      name: 'ssh',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 22,
      remotePort: 6001,
      transport: { bandwidthLimit: '1MB', useEncryption: true },
      loadBalancer: { group: 'group', groupKey: 'key' },
      annotations: { 'prefix/key': 'value' },
    },
    {
      name: 'web',
      type: 'http',
      localIP: '127.0.0.1',
      localPort: 8080,
      customDomains: ['demo.example.com'],
      locations: ['/'],
      requestHeaders: { set: { 'x-frame-options': 'DENY' } },
      responseHeaders: { set: { 'x-test': '1' } },
      healthCheck: {
        type: 'http',
        path: '/health',
        httpHeaders: [{ name: 'x-health', value: '1' }],
      },
    },
    {
      name: 'secret',
      type: 'stcp',
      localIP: '127.0.0.1',
      localPort: 22,
      secretKey: 'secret-key',
      allowUsers: ['*'],
    },
    {
      name: 'file',
      type: 'tcp',
      remotePort: 6002,
      plugin: { type: 'static_file', localPath: '/var/www', stripPrefix: 'static' },
    },
  ],
  visitors: [
    {
      name: 'secret-visitor',
      type: 'stcp',
      serverName: 'secret',
      secretKey: 'secret-key',
      bindAddr: '127.0.0.1',
      bindPort: 9000,
    },
  ],
};

test('generateToml produces valid, parseable TOML with all nested sections', () => {
  const toml = generateToml(normalizeConfig(baseConfig));
  assert.match(toml, /\[\[proxies]]/);
  assert.match(toml, /password = "\{\{ \.Envs\.FRPCDECK_ADMIN_PASSWORD }}"/);
  assert.doesNotMatch(toml, /monitor-secret/);
  assert.match(toml, /\[proxies\.healthCheck]/);
  assert.match(toml, /\[\[proxies\.healthCheck\.httpHeaders]]/);
  assert.match(toml, /\[proxies\.requestHeaders\.set]/);
  assert.doesNotMatch(toml, /\[proxies\.requestHeaders]\s*\n\s*\n/);
  assert.match(toml, /\[\[visitors]]/);
  const parsed = parseConfigText(toml, 'frpc.toml');
  assert.equal(parsed.config.proxies.length, 4);
  assert.equal(parsed.config.visitors.length, 1);
  assert.equal(parsed.config.proxies[1].customDomains[0], 'demo.example.com');
  assert.equal(parsed.config.proxies[1].requestHeaders.set['x-frame-options'], 'DENY');
  assert.equal(parsed.config.proxies[1].healthCheck.httpHeaders[0].name, 'x-health');
});

test('generated TOML omits default values but keeps meaningful false values', () => {
  const config = normalizeConfig({
    serverAddr: 'example.com',
    loginFailExit: false,
    auth: { token: 't' },
    transport: { protocol: 'tcp', tcpMux: false, tls: { enable: false } },
    proxies: [
      { name: 'a', type: 'tcp', localPort: 22, remotePort: 6001, enabled: false },
    ],
  });
  const toml = generateToml(config);
  assert.match(toml, /loginFailExit = false/);
  assert.match(toml, /tcpMux = false/);
  assert.match(toml, /\[transport\.tls]/);
  assert.match(toml, /enable = false/);
  assert.match(toml, /enabled = false/);
  assert.doesNotMatch(toml, /udpPacketSize = 1500/);
  assert.doesNotMatch(toml, /poolCount = 0/);
});

test('unknown imported fields survive a normalization / TOML round trip', () => {
  const toml = `serverAddr = "example.com"
serverPort = 7000

[transport]
protocol = "tcp"
futureOption = "keep-me"

[[proxies]]
name = "future"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6001
customFuture = 42

[proxies.metadatas]
owner = "test"
`;
  const parsed = parseConfigText(toml, 'frpc.toml');
  const output = generateToml(parsed.config);
  assert.match(output, /futureOption = "keep-me"/);
  assert.match(output, /customFuture = 42/);
  assert.match(output, /owner = "test"/);
});

test('validation reports missing and invalid fields', () => {
  const issues = validateConfig({
    serverAddr: '',
    serverPort: 99999,
    webServer: { port: '' },
    proxies: [
      { name: 'dup', type: 'tcp', localPort: 0, remotePort: -1 },
      { name: 'dup', type: 'http', localPort: 80 },
      { name: '', type: 'stcp', localPort: 22 },
    ],
    visitors: [{ name: 'v', type: 'sudp', serverName: '', bindPort: -1 }],
  });
  const messages = issues.filter((item) => item.level === 'error').map((item) => item.message).join('\n');
  assert.match(messages, /服务器地址/);
  assert.match(messages, /服务器端口/);
  assert.match(messages, /代理名称 “dup” 重复/);
  assert.match(messages, /远程端口/);
  assert.match(messages, /自定义域名/);
  assert.match(messages, /目标代理|代理名称/);
  assert.match(messages, /SUDP/);
});

test('valid config has no errors', () => {
  const issues = validateConfig(normalizeConfig(baseConfig));
  assert.equal(issues.filter((item) => item.level === 'error').length, 0);
});

test('YAML and JSON imports are normalized', () => {
  const yaml = `serverAddr: yaml.example.com
serverPort: 7000
auth:
  method: token
  token: secret
proxies:
  - name: yaml-proxy
    type: tcp
    localIP: 127.0.0.1
    localPort: 22
    remotePort: 6001
`;
  const fromYaml = parseConfigText(yaml, 'frpc.yaml');
  assert.equal(fromYaml.format, 'yaml');
  assert.equal(fromYaml.config.proxies[0].name, 'yaml-proxy');

  const fromJson = parseConfigText(JSON.stringify({ serverAddr: 'json.example.com', proxies: [] }), 'frpc.json');
  assert.equal(fromJson.format, 'json');
  assert.equal(fromJson.config.serverAddr, 'json.example.com');
});

test('legacy INI import maps common and proxy sections', () => {
  const ini = `[common]
server_addr = ini.example.com
server_port = 7000
token = ini-token
admin_addr = 127.0.0.1
admin_port = 7401
admin_user = admin
admin_pwd = pass
log_level = warn

[ssh]
type = tcp
local_ip = 127.0.0.1
local_port = 22
remote_port = 6001
use_encryption = true

[secret]
type = stcp
local_port = 22
secret_key = s3cr3t
`;
  const parsed = parseConfigText(ini, 'frpc.ini');
  assert.equal(parsed.format, 'ini');
  assert.equal(parsed.config.serverAddr, 'ini.example.com');
  assert.equal(parsed.config.auth.token, 'ini-token');
  assert.equal(parsed.config.webServer.port, 7401);
  assert.equal(parsed.config.proxies.length, 2);
  assert.equal(parsed.config.proxies[0].name, 'ssh');
  assert.equal(parsed.config.proxies[0].transport.useEncryption, true);
  assert.equal(parsed.config.proxies[1].secretKey, 's3cr3t');
});

test('default config is usable and has a generated admin password', () => {
  const config = createDefaultConfig();
  assert.equal(config.serverAddr, '');
  assert.ok(config.webServer.password.length >= 16);
  assert.notEqual(createDefaultConfig().webServer.password, config.webServer.password);
});

test('TOML stringifier escapes keys and strings safely', () => {
  const output = stringifyToml({
    'a key': 'line\n"quote"',
    'prefix/key': 'value',
    nested: { 'x.y': true },
    list: ['a', 'b'],
  });
  assert.match(output, /"a key" = "line\\n\\"quote\\""/);
  assert.match(output, /"prefix\/key" = "value"/);
  assert.match(output, /\[nested]/);
  assert.match(output, /"x\.y" = true/);
  assert.match(output, /list = \["a", "b"]/);
});

test('normalizeConfig preserves explicit zero remotePort and clears empty domains', () => {
  const config = normalizeConfig({
    proxies: [{ name: 'random', type: 'tcp', remotePort: 0, customDomains: ['', '  '] }],
  });
  assert.equal(config.proxies[0].remotePort, 0);
  assert.deepEqual(config.proxies[0].customDomains, []);
});

test('batch port templates become one editable proxy per range block', () => {
  const parsed = parseConfigText(templateText, 'frpc.toml');
  assert.equal(parsed.format, 'toml');
  assert.equal(parsed.config.proxies.length, 3);
  assert.equal(parsed.config.proxies[0].name, 'Sunshine');
  assert.equal(parsed.config.proxies[0].batch, null);

  const tcp = parsed.config.proxies[1];
  assert.equal(tcp.name, 'Sunshine-TCP');
  assert.equal(tcp.type, 'tcp');
  assert.deepEqual(tcp.batch, {
    localPorts: '47984-47990,48010',
    remotePorts: '47984-47990,48010',
    namePattern: 'Sunshine-TCP-{localPort}',
  });

  const udp = parsed.config.proxies[2];
  assert.equal(udp.name, 'Sunshine-UDP');
  assert.equal(udp.batch.localPorts, '47998-48000,47800,48002,48010');

  assert.ok(parsed.warnings.some((warning) => warning.includes('批量端口')));

  const toml = generateToml(parsed.config);
  assert.equal((toml.match(/parseNumberRangePair/g) || []).length, 2);
  assert.match(toml, /name = "Sunshine-TCP-\{\{ \$v\.First }}"/);
  assert.match(toml, /localPort = \{\{ \$v\.First }}/);
  assert.match(toml, /remotePort = \{\{ \$v\.Second }}/);
  assert.match(toml, /type = "https"/);
  assert.match(toml, /\[webServer]/);
  assert.doesNotMatch(toml, /Sunshine-TCP-47984/);

  const reparsed = parseConfigText(toml, 'frpc.toml');
  assert.equal(reparsed.config.proxies.length, 3);
  assert.deepEqual(reparsed.config.proxies[1].batch, tcp.batch);
  assert.equal(reparsed.config.proxies[1].name, 'Sunshine-TCP');
  assert.equal(validateConfig(parsed.config).filter((item) => item.level === 'error').length, 0);
});

test('batch validation catches invalid ranges and name collisions', () => {
  const config = normalizeConfig({
    serverAddr: '127.0.0.1',
    proxies: [
      {
        name: 'batch',
        type: 'tcp',
        localIP: '127.0.0.1',
        batch: { localPorts: '8000-8002', remotePorts: '9000-9001', namePattern: 'p-{localPort}' },
      },
      {
        name: 'clash',
        type: 'tcp',
        localIP: '127.0.0.1',
        batch: { localPorts: '8000,8001', remotePorts: '9000,9001', namePattern: 'same' },
      },
    ],
  });
  const messages = validateConfig(config)
    .filter((item) => item.level === 'error')
    .map((item) => item.message)
    .join('\n');
  assert.match(messages, /数量.*不一致/);
  assert.match(messages, /名称模板必须包含/);
});

test('official frpc full example round trips through the generator', () => {
  const text = fs.readFileSync(
    new URL('./fixtures/frpc_full_example.toml', import.meta.url),
    'utf8',
  );
  const parsed = parseConfigText(text, 'frpc.toml');
  assert.equal(parsed.config.proxies.length, 18);
  assert.equal(parsed.config.visitors.length, 3);

  const generated = generateToml(parsed.config);
  const reparsed = parseConfigText(generated, 'frpc.toml');
  assert.equal(reparsed.config.proxies.length, 18);
  assert.equal(reparsed.config.visitors.length, 3);

  const pluginTypes = [...new Set(reparsed.config.proxies.map((proxy) => proxy.plugin?.type).filter(Boolean))];
  assert.deepEqual(pluginTypes.sort(), [
    'http2http',
    'http2https',
    'http_proxy',
    'https2http',
    'https2https',
    'socks5',
    'static_file',
    'tls2raw',
    'unix_domain_socket',
    'virtual_net',
  ]);
  assert.equal(validateConfig(reparsed.config).filter((item) => item.level === 'error').length, 0);
  assert.match(generated, /\[\[proxies\.healthCheck\.httpHeaders]]/);
  assert.match(generated, /\[proxies\.annotations]/);
  assert.match(generated, /\[proxies\.plugin]/);
  assert.match(generated, /\[visitors\.plugin]/);
  assert.match(generated, /\[proxies\.loadBalancer]/);
});
