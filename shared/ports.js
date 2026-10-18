const MAX_BATCH_PORTS = 4096;

function parsePart(part) {
  const match = String(part).trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) throw new Error(`端口范围格式错误：${part}`);
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 65535 || start > end) {
    throw new Error(`端口范围必须在 1-65535 内且起始不大于结束：${part}`);
  }
  return { start, end };
}

export function parsePortSpec(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('端口范围不能为空');
  const ports = [];
  for (const part of text.split(',')) {
    const { start, end } = parsePart(part);
    for (let port = start; port <= end; port += 1) {
      ports.push(port);
      if (ports.length > MAX_BATCH_PORTS) {
        throw new Error(`批量端口数量不能超过 ${MAX_BATCH_PORTS}`);
      }
    }
  }
  return ports;
}

export function parsePortPairs(localSpec, remoteSpec) {
  const local = parsePortSpec(localSpec);
  const remote = parsePortSpec(remoteSpec);
  if (local.length !== remote.length) {
    throw new Error(`本地端口数量（${local.length}）与远程端口数量（${remote.length}）不一致`);
  }
  return local.map((port, index) => ({ localPort: port, remotePort: remote[index] }));
}

export function batchPatternName(proxy) {
  const pattern = proxy?.batch?.namePattern || `${proxy?.name || 'proxy'}-{localPort}`;
  return pattern
    .replace(/\{(?:localPort|remotePort)\}/g, '')
    .replace(/[\s_.-]+$/g, '')
    .trim() || proxy?.name || 'proxy';
}

export function renderBatchName(pattern, pair) {
  return String(pattern)
    .replaceAll('{localPort}', String(pair.localPort))
    .replaceAll('{remotePort}', String(pair.remotePort));
}

export function batchProxyNames(proxy) {
  if (!proxy?.batch) return [];
  const pairs = parsePortPairs(proxy.batch.localPorts, proxy.batch.remotePorts);
  const pattern = proxy.batch.namePattern || `${proxy.name}-{localPort}`;
  return pairs.map((pair) => renderBatchName(pattern, pair));
}

export function batchPortCount(proxy) {
  if (!proxy?.batch) return 0;
  try {
    return parsePortPairs(proxy.batch.localPorts, proxy.batch.remotePorts).length;
  } catch {
    return 0;
  }
}
