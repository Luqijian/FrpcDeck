<template>
  <div class="page docs-page">
    <div class="docs-layout">
      <aside class="card docs-nav">
        <header class="docs-nav-head">
          <div>
            <h3>文档</h3>
            <p>随应用一起发布</p>
          </div>
          <BookOpen :size="18" />
        </header>
        <div class="docs-search">
          <Search :size="14" />
          <input v-model="query" type="search" placeholder="搜索文档…" aria-label="搜索文档" />
        </div>
        <div v-if="loadingList" class="docs-nav-loading">
          <Loader2 :size="16" class="spin" />
          正在加载…
        </div>
        <nav v-else class="docs-nav-groups" aria-label="文档目录">
          <section v-for="group in filteredGroups" :key="group.name" class="docs-nav-group">
            <p class="docs-nav-category">{{ group.name }}</p>
            <RouterLink
              v-for="item in group.docs"
              :key="item.slug"
              :to="{ name: 'docs', params: { slug: item.slug } }"
              class="docs-nav-link"
              :class="{ 'is-active': item.slug === activeSlug }"
            >
              <span>{{ item.title }}</span>
              <small>{{ item.label }}</small>
            </RouterLink>
          </section>
          <p v-if="!filteredGroups.length" class="docs-nav-empty">没有匹配的文档</p>
        </nav>
      </aside>

      <article class="card docs-article">
        <div v-if="loadingDoc" class="docs-loading">
          <Loader2 :size="19" class="spin" />
          正在加载文档…
        </div>
        <div v-else-if="docError" class="docs-error">
          <TriangleAlert :size="18" />
          <span>{{ docError }}</span>
        </div>
        <template v-else-if="currentDoc">
          <header class="docs-article-head">
            <div class="docs-article-breadcrumb">
              <span>{{ currentDoc.category }}</span>
              <ChevronRight :size="12" />
              <span>{{ currentDoc.label }}</span>
            </div>
            <div class="docs-article-title-row">
              <h1>{{ currentDoc.title }}</h1>
              <a
                :href="githubUrl(currentDoc.source)"
                class="btn btn-ghost btn-sm docs-github"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink :size="14" />
                GitHub
              </a>
            </div>
            <p v-if="currentDoc.description" class="docs-article-desc">{{ currentDoc.description }}</p>
          </header>
          <div class="docs-content" @click="onContentClick" v-html="rendered" />
        </template>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  TriangleAlert,
} from 'lucide-vue-next';
import { api } from '@/api';

const route = useRoute();
const router = useRouter();
const docs = ref([]);
const groups = ref([]);
const currentDoc = ref(null);
const rendered = ref('');
const query = ref('');
const loadingList = ref(true);
const loadingDoc = ref(false);
const docError = ref('');

const activeSlug = computed(() => String(route.params.slug || currentDoc.value?.slug || ''));

const docsBySource = computed(() => new Map(docs.value.map((doc) => [doc.source, doc.slug])));

const filteredGroups = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return groups.value;
  return groups.value
    .map((group) => ({
      ...group,
      docs: group.docs.filter((doc) => (
        `${doc.title} ${doc.label} ${doc.description} ${doc.source}`.toLowerCase().includes(keyword)
      )),
    }))
    .filter((group) => group.docs.length > 0);
});

function resolveAsset(source, doc) {
  if (!source || /^(https?:|data:|\/)/i.test(source)) return source;
  try {
    const url = new URL(source, `http://docs.local/${doc.source}`);
    let pathname = url.pathname.replace(/^\//, '');
    if (pathname.startsWith('docs/')) pathname = pathname.slice(5);
    if (pathname === 'web/public/favicon.svg') return '/favicon.svg';
    return `/api/docs/assets/${pathname}`;
  } catch {
    return source;
  }
}

function resolveDocLink(href, doc) {
  if (!href || /^(https?:|mailto:|#|\/)/i.test(href)) return null;
  try {
    const url = new URL(href, `http://docs.local/${doc.source}`);
    const pathname = url.pathname.replace(/^\//, '');
    return docsBySource.value.get(pathname) || null;
  } catch {
    return null;
  }
}

function renderMarkdown(doc) {
  const raw = marked.parse(doc.content, { gfm: true, breaks: false });
  const clean = DOMPurify.sanitize(raw);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = clean;
  const firstHeading = wrapper.querySelector('h1');
  if (firstHeading && firstHeading.textContent.trim() === doc.title) firstHeading.remove();
  const firstParagraph = wrapper.querySelector('p');
  if (firstParagraph && firstParagraph.textContent.trim() === doc.description.trim()) firstParagraph.remove();
  for (const image of wrapper.querySelectorAll('img')) {
    image.setAttribute('src', resolveAsset(image.getAttribute('src'), doc));
    image.setAttribute('loading', 'lazy');
  }
  for (const link of wrapper.querySelectorAll('a')) {
    const href = link.getAttribute('href');
    if (/^https?:/i.test(href || '')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noreferrer');
      continue;
    }
    const slug = resolveDocLink(href, doc);
    if (slug) {
      link.setAttribute('href', `/docs/${slug}`);
      link.setAttribute('data-doc-slug', slug);
    }
  }
  rendered.value = wrapper.innerHTML;
}

function onContentClick(event) {
  const link = event.target.closest?.('a[data-doc-slug]');
  if (!link) return;
  event.preventDefault();
  router.push({ name: 'docs', params: { slug: link.dataset.docSlug } });
}

function githubUrl(source) {
  return `https://github.com/Luqijian/FrpcDeck/blob/main/${source}`;
}

async function loadDoc(slug) {
  if (!slug) return;
  loadingDoc.value = true;
  docError.value = '';
  try {
    const doc = await api.get(`/api/docs/${encodeURIComponent(slug)}`);
    currentDoc.value = doc;
    renderMarkdown(doc);
  } catch (error) {
    currentDoc.value = null;
    rendered.value = '';
    docError.value = error.message || '无法加载文档';
  } finally {
    loadingDoc.value = false;
  }
}

async function loadDocs() {
  loadingList.value = true;
  try {
    const result = await api.get('/api/docs');
    docs.value = result.docs || [];
    groups.value = result.categories || [];
    const slug = String(route.params.slug || '');
    if (!slug) {
      const fallback = docs.value.find((doc) => doc.slug === 'docs') || docs.value[0];
      if (fallback) await router.replace({ name: 'docs', params: { slug: fallback.slug } });
    } else if (!docs.value.some((doc) => doc.slug === slug)) {
      docError.value = '文档不存在';
    }
  } catch (error) {
    docError.value = error.message || '无法加载文档列表';
  } finally {
    loadingList.value = false;
  }
}

watch(
  () => route.params.slug,
  (slug) => {
    if (slug && docs.value.length) loadDoc(String(slug));
  },
);

onMounted(async () => {
  await loadDocs();
  if (route.params.slug) await loadDoc(String(route.params.slug));
});
</script>
