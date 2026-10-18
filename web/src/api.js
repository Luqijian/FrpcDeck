export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request-failed', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notifyUnauthorized() {
  window.dispatchEvent(new CustomEvent('frpcdeck:unauthorized'));
}

let activeInstanceId = '';

export function setApiInstance(id) {
  activeInstanceId = String(id || '');
}

function instanceHeaders(path) {
  if (!activeInstanceId || path.startsWith('/api/auth/')) return {};
  return { 'X-FrpcDeck-Instance': activeInstanceId };
}

async function request(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const upper = method.toUpperCase();
  const mutating = !['GET', 'HEAD'].includes(upper);
  let response;
  try {
    response = await fetch(path, {
      method: upper,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(mutating ? { 'X-FrpcDeck': '1' } : {}),
        ...instanceHeaders(path),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError('无法连接到 FrpcDeck 服务，请检查容器或后端是否运行', {
      status: 0,
      code: 'network-error',
      details: { cause: error.message },
    });
  }

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    notifyUnauthorized();
  }

  if (raw) {
    if (!response.ok) throw new ApiError(`请求失败（HTTP ${response.status}）`, { status: response.status });
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => '');
  }

  if (!response.ok) {
    const error = data && typeof data === 'object' ? data.error : null;
    throw new ApiError(error?.message || `请求失败（HTTP ${response.status}）`, {
      status: response.status,
      code: error?.code || 'request-failed',
      details: error?.details || null,
    });
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path, body) => request(path, { method: 'DELETE', body }),
  request,
  async download(path, filename) {
    const response = await request(path, { raw: true });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  },
};
