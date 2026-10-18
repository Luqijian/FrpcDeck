<template>
  <div class="page visitors-page">
    <div class="page-toolbar">
      <div class="toolbar-main">
        <div class="search-box">
          <Search :size="16" class="search-icon" />
          <input v-model="query" type="search" placeholder="搜索访问器或目标代理…" aria-label="搜索访问器" />
          <button v-if="query" type="button" class="search-clear" aria-label="清空搜索" @click="query = ''">
            <X :size="14" />
          </button>
        </div>
        <div class="filter-chips">
          <button
            v-for="item in filters"
            :key="item.value"
            type="button"
            class="filter-chip"
            :class="{ 'is-active': filter === item.value }"
            @click="filter = item.value"
          >
            {{ item.label }}
            <span>{{ item.count }}</span>
          </button>
        </div>
      </div>
      <button v-if="!templateMode" type="button" class="btn btn-primary toolbar-add" @click="openCreate">
        <Plus :size="16" />
        <span>新建访问器</span>
      </button>
    </div>

    <div v-if="templateMode" class="template-data-banner card">
      <span class="template-data-icon"><FileCode2 :size="18" /></span>
      <div class="template-data-copy">
        <strong>模板模式</strong>
        <span>访问器由 Go 模板在 frpc 启动时生成，面板不会展开或单独编辑。</span>
      </div>
      <RouterLink to="/connection" class="btn btn-secondary btn-sm">编辑模板</RouterLink>
    </div>

    <div v-if="!templateMode" class="visitor-hint">
      <Info :size="15" />
      <span>访问器用于连接其他 frpc 暴露的 STCP / SUDP / XTCP 服务。运行状态由 frpc 管理，可在日志中查看启动结果。</span>
    </div>

    <div v-if="filteredVisitors.length" class="visitor-grid">
      <article
        v-for="visitor in filteredVisitors"
        :key="visitor.name"
        class="visitor-card"
        tabindex="0"
        role="button"
        @click="openEdit(visitor)"
        @keydown.enter="openEdit(visitor)"
      >
        <header class="visitor-card-head">
          <span class="visitor-type-icon" :style="{ '--type-color': meta(visitor).color }">
            <TypeIcon :type="visitor.type" :size="19" />
          </span>
          <div class="visitor-title">
            <strong>{{ visitor.name }}</strong>
            <span>
              <TypeBadge :type="visitor.type" />
              <span v-if="visitor.plugin?.type === 'virtual_net'" class="visitor-plugin">VirtualNet</span>
            </span>
          </div>
          <div class="visitor-actions" @click.stop>
            <button type="button" class="icon-btn" title="编辑" aria-label="编辑访问器" @click="openEdit(visitor)">
              <Pencil :size="15" />
            </button>
            <button type="button" class="icon-btn" title="复制" aria-label="复制访问器" @click="duplicateVisitor(visitor)">
              <Copy :size="15" />
            </button>
            <button type="button" class="icon-btn danger-hover" title="删除" aria-label="删除访问器" @click="deleteTarget = visitor">
              <Trash2 :size="15" />
            </button>
          </div>
        </header>

        <div class="visitor-route">
          <div class="visitor-node">
            <span class="visitor-node-label">目标代理</span>
            <span class="visitor-node-value">
              {{ visitor.serverUser ? `${visitor.serverUser}.` : '' }}{{ visitor.serverName || '未设置' }}
            </span>
          </div>
          <span class="visitor-route-arrow"><ArrowRight :size="15" /></span>
          <div class="visitor-node">
            <span class="visitor-node-label">本地绑定</span>
            <span class="visitor-node-value input-mono">{{ bindLabel(visitor) }}</span>
          </div>
        </div>

        <footer class="visitor-card-foot">
          <span class="visitor-meta">
            <KeyRound :size="13" />
            {{ secretPreview(visitor.secretKey) }}
          </span>
          <span v-if="visitor.type === 'xtcp'" class="visitor-meta">
            <Zap :size="13" />
            {{ visitor.keepTunnelOpen ? '保持隧道' : 'P2P 优先' }}
          </span>
          <span class="config-badge" :class="{ 'is-dirty': visitorDirty(visitor) }">
            {{ visitorDirty(visitor) ? '待应用' : '已配置' }}
          </span>
        </footer>
      </article>
    </div>

    <div v-else class="card list-empty-card">
      <EmptyState
        v-if="templateMode"
        title="模板模式"
        description="访问器由模板定义并在 frpc 启动时创建；如需修改，请编辑连接配置中的模板。"
      >
        <RouterLink to="/connection" class="btn btn-primary">编辑模板</RouterLink>
      </EmptyState>
      <EmptyState
        v-else-if="totalCount === 0"
        title="还没有访问器"
        description="当目标代理是 STCP、SUDP 或 XTCP 时，需要在本机创建一个访问器，才能通过本地端口访问它。"
      >
        <button type="button" class="btn btn-primary" @click="openCreate">
          <Plus :size="16" />
          新建第一个访问器
        </button>
      </EmptyState>
      <EmptyState v-else title="没有匹配的访问器" description="调整搜索或筛选条件后再试。">
        <button type="button" class="btn btn-secondary" @click="resetFilters">清空筛选</button>
      </EmptyState>
    </div>

    <VisitorEditor
      :open="editorOpen"
      :visitor="editingVisitor"
      :mode="editorMode"
      :existing-names="existingNames"
      @close="closeEditor"
      @save="handleSave"
    />

    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除这个访问器？"
      :message="`访问器 “${deleteTarget?.name || ''}” 将从草稿中移除，应用配置后 frpc 会停止监听。`"
      confirm-label="删除访问器"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowRight,
  Copy,
  FileCode2,
  Info,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-vue-next';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import TypeBadge from '@/components/TypeBadge.vue';
import TypeIcon from '@/components/TypeIcon.vue';
import VisitorEditor from '@/components/VisitorEditor.vue';
import {
  TYPE_META,
  jsonClone,
  nextName,
  visitorEndpoint,
} from '@/frp';
import { saveConfig, store, toast } from '@/store';

const route = useRoute();
const router = useRouter();
const query = ref('');
const filter = ref('all');
const editorOpen = ref(false);
const editorMode = ref('create');
const editingVisitor = ref(null);
const deleteTarget = ref(null);

const templateMode = computed(() => Boolean(store.config?.rawTemplate));
const visitors = computed(() => (templateMode.value ? [] : store.config?.visitors || []));
const totalCount = computed(() => visitors.value.length);

const filters = computed(() => [
  { value: 'all', label: '全部', count: totalCount.value },
  ...['stcp', 'sudp', 'xtcp'].map((type) => ({
    value: type,
    label: type.toUpperCase(),
    count: visitors.value.filter((visitor) => visitor.type === type).length,
  })),
]);

const filteredVisitors = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return visitors.value.filter((visitor) => {
    if (filter.value !== 'all' && visitor.type !== filter.value) return false;
    if (!keyword) return true;
    return [visitor.name, visitor.serverName, visitor.serverUser, visitor.bindAddr, visitor.bindPort]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
});

const existingNames = computed(() => {
  const original = editingVisitor.value?.name;
  return visitors.value.map((visitor) => visitor.name).filter((name) => name !== original);
});

function meta(visitor) {
  return TYPE_META[visitor.type] || TYPE_META.stcp;
}

function bindLabel(visitor) {
  if (visitor.plugin?.type === 'virtual_net') return visitor.plugin.destinationIP || 'VirtualNet';
  return visitorEndpoint(visitor);
}

function secretPreview(secret) {
  if (!secret) return '未设置密钥';
  const text = String(secret);
  return `•••• ${text.slice(-4)}`;
}

function visitorDirty(visitor) {
  if (!store.dirty) return false;
  const saved = store.savedConfig?.visitors?.find((item) => item.name === visitor.name);
  return !saved || JSON.stringify(saved) !== JSON.stringify(visitor);
}

function resetFilters() {
  query.value = '';
  filter.value = 'all';
}

function openCreate() {
  if (templateMode.value) return;
  editorMode.value = 'create';
  editingVisitor.value = null;
  editorOpen.value = true;
}

function openEdit(visitor) {
  if (templateMode.value) return;
  editorMode.value = 'edit';
  editingVisitor.value = jsonClone(visitor);
  editorOpen.value = true;
}

function duplicateVisitor(visitor) {
  if (templateMode.value) return;
  const copy = jsonClone(visitor);
  copy.name = nextName(visitors.value, visitor.type);
  copy.bindPort = undefined;
  editorMode.value = 'create';
  editingVisitor.value = copy;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  editingVisitor.value = null;
  if (route.query.new || route.query.edit) router.replace({ name: 'visitors' });
}

async function handleSave(visitor, options = {}) {
  const list = store.config.visitors;
  if (editorMode.value === 'edit') {
    const original = editingVisitor.value?.name;
    const index = list.findIndex((item) => item.name === original);
    if (index >= 0) list[index] = visitor;
    else list.push(visitor);
  } else {
    list.push(visitor);
  }
  closeEditor();
  if (options.apply) {
    try {
      await saveConfig({ restart: true });
    } catch {
      // Error toast comes from the store.
    }
  } else {
    toast('已保存到草稿，点击“应用更改”生效', 'success', 3200);
  }
}

function confirmDelete() {
  if (!deleteTarget.value) return;
  const index = store.config.visitors.findIndex((item) => item.name === deleteTarget.value.name);
  if (index >= 0) store.config.visitors.splice(index, 1);
  toast(`已从草稿移除 “${deleteTarget.value.name}”，应用后生效`, 'success', 3200);
  deleteTarget.value = null;
}

watch(
  () => route.query,
  (params) => {
    let handled = false;
    if (params.new) {
      openCreate();
      handled = true;
    } else if (typeof params.edit === 'string') {
      const visitor = visitors.value.find((item) => item.name === params.edit);
      if (visitor) {
        openEdit(visitor);
        handled = true;
      }
    }
    if (handled) router.replace({ name: 'visitors' });
  },
  { immediate: true },
);
</script>
