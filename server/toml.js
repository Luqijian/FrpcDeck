/**
 * Small, dependency-free TOML emitter tailored to frpc configuration.
 * It preserves insertion order and supports nested tables and arrays of tables.
 */

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTableArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

function quoteString(value) {
  return JSON.stringify(String(value))
    .replace(/\u007f/g, '\\u007F')
    .replace(/\u000b/g, '\\u000B');
}

function formatKey(key) {
  const value = String(key);
  return BARE_KEY.test(value) ? value : quoteString(value);
}

function formatValue(value) {
  if (typeof value === 'string') return quoteString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Cannot serialize non-finite number: ${value}`);
    if (!Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatValue(item)).join(', ')}]`;
  }
  throw new TypeError(`Unsupported TOML value type: ${typeof value}`);
}

/**
 * @param {Record<string, unknown>} root
 * @param {{header?: string, comments?: Record<string, string>}} [options]
 */
export function stringifyToml(root, options = {}) {
  const lines = [];
  if (options.header) {
    for (const line of options.header.split('\n')) {
      lines.push(line ? `# ${line}` : '#');
    }
    lines.push('');
  }
  emitTable(root, [], lines, { isRoot: true, comments: options.comments || {} });
  return `${trimBlankLines(lines).join('\n')}\n`;
}

function trimBlankLines(lines) {
  const output = [];
  for (const line of lines) {
    if (line === '' && output[output.length - 1] === '') continue;
    output.push(line);
  }
  while (output[0] === '') output.shift();
  while (output[output.length - 1] === '') output.pop();
  return output;
}

function emitTable(object, path, lines, { isRoot = false, comments = {} } = {}) {
  const scalars = [];
  const tables = [];
  const tableArrays = [];

  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null) continue;
    if (isPlainObject(value)) {
      if (Object.keys(value).length > 0) tables.push([key, value]);
    } else if (isTableArray(value)) {
      tableArrays.push([key, value]);
    } else if (Array.isArray(value)) {
      if (value.length > 0) scalars.push([key, value]);
    } else {
      scalars.push([key, value]);
    }
  }

  if (!isRoot) {
    // A table that only contains sub-tables does not need its own header:
    // `[a.b]` implicitly creates `[a]`.
    if (scalars.length === 0) {
      for (const [key, value] of tables) {
        emitTable(value, [...path, key], lines, { comments });
      }
      for (const [key, items] of tableArrays) {
        const itemPath = [...path, key];
        items.forEach((item, index) => {
          if (lines.length > 0) lines.push('');
          if (index === 0) {
            const comment = comments[itemPath.join('.')];
            if (comment) lines.push(`# ${comment}`);
          }
          lines.push(`[[${itemPath.map(formatKey).join('.')}]]`);
          emitTableBody(item, itemPath, lines, { comments });
        });
      }
      return;
    }

    if (lines.length > 0) lines.push('');
    const comment = comments[path.join('.')];
    if (comment) lines.push(`# ${comment}`);
    lines.push(`[${path.map(formatKey).join('.')}]`);
  }

  for (const [key, value] of scalars) {
    lines.push(`${formatKey(key)} = ${formatValue(value)}`);
  }

  for (const [key, value] of tables) {
    emitTable(value, [...path, key], lines, { comments });
  }

  for (const [key, items] of tableArrays) {
    const itemPath = [...path, key];
    items.forEach((item, index) => {
      if (lines.length > 0) lines.push('');
      if (index === 0) {
        const comment = comments[itemPath.join('.')];
        if (comment) lines.push(`# ${comment}`);
      }
      lines.push(`[[${itemPath.map(formatKey).join('.')}]]`);
      emitTableBody(item, itemPath, lines, { comments });
    });
  }
}

function emitTableBody(object, path, lines, { comments = {} } = {}) {
  const scalars = [];
  const tables = [];
  const tableArrays = [];

  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null) continue;
    if (isPlainObject(value)) {
      if (Object.keys(value).length > 0) tables.push([key, value]);
    } else if (isTableArray(value)) {
      tableArrays.push([key, value]);
    } else if (Array.isArray(value)) {
      if (value.length > 0) scalars.push([key, value]);
    } else {
      scalars.push([key, value]);
    }
  }

  for (const [key, value] of scalars) {
    lines.push(`${formatKey(key)} = ${formatValue(value)}`);
  }

  for (const [key, value] of tables) {
    emitTable(value, [...path, key], lines, { comments });
  }

  for (const [key, items] of tableArrays) {
    const itemPath = [...path, key];
    items.forEach((item, index) => {
      if (lines.length > 0) lines.push('');
      if (index === 0) {
        const comment = comments[itemPath.join('.')];
        if (comment) lines.push(`# ${comment}`);
      }
      lines.push(`[[${itemPath.map(formatKey).join('.')}]]`);
      emitTableBody(item, itemPath, lines, { comments });
    });
  }
}
