import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT_DOCS = [
  { file: 'README.md', slug: 'readme', category: '项目说明', label: 'README' },
  { file: 'README.en.md', slug: 'readme-en', category: '项目说明', label: 'README (English)' },
  { file: 'CHANGELOG.md', slug: 'changelog', category: '更新日志', label: 'CHANGELOG' },
  { file: 'SECURITY.md', slug: 'security', category: '开发与项目', label: '安全策略' },
  { file: 'CONTRIBUTING.md', slug: 'contributing', category: '开发与项目', label: '贡献指南' },
  { file: 'CODE_OF_CONDUCT.md', slug: 'code-of-conduct', category: '开发与项目', label: '行为准则' },
  { file: 'SUPPORT.md', slug: 'support', category: '开发与项目', label: '支持' },
];

const DOCS_DOCS = [
  { file: 'docs/README.md', slug: 'docs', category: '使用文档', label: '文档索引' },
  { file: 'docs/deployment.md', slug: 'deployment', category: '使用文档', label: '部署指南' },
  { file: 'docs/configuration.md', slug: 'configuration', category: '使用文档', label: '配置说明' },
  { file: 'docs/api.md', slug: 'api', category: '使用文档', label: 'HTTP API' },
  { file: 'docs/architecture.md', slug: 'architecture', category: '使用文档', label: '架构说明' },
  { file: 'docs/troubleshooting.md', slug: 'troubleshooting', category: '使用文档', label: '故障排查' },
  { file: 'docs/development.md', slug: 'development', category: '开发与项目', label: '开发指南' },
];

const CATEGORY_ORDER = ['使用文档', '项目说明', '开发与项目', '更新日志'];

function firstHeading(text, fallback) {
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const markdown = line.match(/^#\s+(.+)$/);
    if (markdown) return markdown[1].replace(/[*_`]/g, '').trim();
    const html = line.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (html) return html[1].replace(/<[^>]+>/g, '').trim();
  }
  return fallback;
}

function firstParagraph(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#\s+/.test(line));
  let inFence = false;
  for (let index = Math.max(0, start + 1); index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line || line.startsWith('#') || line.startsWith('!') || line.startsWith('<') || line.startsWith('|')) continue;
    return line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`>#]/g, '')
      .slice(0, 140);
  }
  return '';
}

export async function loadDocs({ projectRoot }) {
  const descriptors = [];
  const seen = new Set();
  let sequence = 0;

  async function add(entry) {
    if (seen.has(entry.slug)) return;
    const absolute = path.resolve(projectRoot, entry.file);
    const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
    if (relative.startsWith('..') || path.isAbsolute(relative)) return;
    try {
      const text = await fs.readFile(absolute, 'utf8');
      seen.add(entry.slug);
      descriptors.push({
        ...entry,
        order: sequence++,
        source: relative,
        directory: path.posix.dirname(relative),
        title: firstHeading(text, entry.label || path.basename(relative, '.md')),
        description: firstParagraph(text),
      });
    } catch {
      // Documentation files are optional in minimal builds.
    }
  }

  for (const entry of DOCS_DOCS) await add(entry);
  for (const entry of ROOT_DOCS) await add(entry);

  try {
    const releaseDir = path.join(projectRoot, 'docs', 'release-notes');
    const files = (await fs.readdir(releaseDir))
      .filter((name) => name.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const file of files) {
      await add({
        file: `docs/release-notes/${file}`,
        slug: `release-${file.replace(/\.md$/, '')}`,
        category: '更新日志',
        label: file.replace(/\.md$/, ''),
      });
    }
  } catch {
    // Release notes are optional.
  }

  descriptors.sort((a, b) => {
    const category = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (category !== 0) return category;
    return a.order - b.order;
  });

  const bySlug = new Map(descriptors.map((entry) => [entry.slug, entry]));
  const bySource = new Map(descriptors.map((entry) => [entry.source, entry]));
  const docsRoot = path.resolve(projectRoot, 'docs');

  return {
    list() {
      const categories = [];
      for (const entry of descriptors) {
        let category = categories.find((item) => item.name === entry.category);
        if (!category) {
          category = { name: entry.category, docs: [] };
          categories.push(category);
        }
        category.docs.push(entry);
      }
      return { docs: descriptors, categories };
    },
    async read(slug) {
      const entry = bySlug.get(String(slug || ''));
      if (!entry) return null;
      const content = await fs.readFile(path.resolve(projectRoot, entry.source), 'utf8');
      return { ...entry, content };
    },
    resolveSource(source) {
      return bySource.get(String(source || ''));
    },
    docsRoot,
  };
}
