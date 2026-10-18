export function stripLogTimestamp(text) {
  return String(text || '').replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?\s*/, '');
}

export function logLevelTone(level) {
  if (level === 'error') return 'danger';
  if (level === 'warn') return 'warning';
  if (level === 'debug') return 'muted';
  if (level === 'trace') return 'faint';
  return 'info';
}

export function shortAddress(value) {
  const text = String(value || '');
  return text.length > 44 ? `${text.slice(0, 41)}…` : text;
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function dateLabel(value = Date.now()) {
  const date = new Date(value);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 19) return '下午好';
  return '晚上好';
}
