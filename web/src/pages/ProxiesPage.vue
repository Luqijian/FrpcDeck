<template>
  <div class="page proxies-page">
    <div class="page-toolbar">
      <div class="toolbar-main">
        <div class="search-box">
          <Search :size="16" class="search-icon" />
          <input v-model="query" type="search" placeholder="搜索名称、域名或端口…" aria-label="搜索代理" />
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
      <button type="button" class="btn btn-primary toolbar-add" @click="openCreate">
        <Plus :size="16" />
        <span>新建代理</span>
      </button>
    </div>

    <div class="list-summary">
      <span><strong>{{ totalCount }}</strong> 个代理</span>
      <span class="summary-dot">·</span>
      <span>{{ enabledCount }} 个启用</span>
      <span class="summary-dot">·</span>
      <span>{{ runningCount }} 个运行中</span>
      <span v-if="store.dirty" class="summary-unsaved">有未应用的更改</span>
    </div>

    <div v-if="filteredProxies.length" class="proxy-table">
      <div class="proxy-table-head" aria-hidden="true">
        <span>代理</span>
        <span>本地服务</span>
        <span>公网入口</span>
        <span>状态</span>
        <span />
      </div>
      <div class="proxy-rows">
        <div
          v-for="proxy in filteredProxies"
          :key="proxy.name"
          class="proxy-item"
          :class="{ 'is-disabled': !proxy.enabled }"
          role="button"
          tabindex="0"
          @click="openEdit(proxy)"
          @keydown.enter="openEdit(proxy)"
        >          <div class="proxy-main">
            <span class="proxy-toggle" @click.stop>
              <ToggleSwitch
                :model-value="proxy.enabled"
                small
                :aria-label="proxy.enabled ? '停用代理' : '启用代理'"
                @update:model-value="proxy.enabled = $event"
              />
            </span>
            <span class="proxy-type-icon" :style="{ '--type-color': proxyMeta(proxy).color }">
              <TypeIcon :type="proxy.type" :size="17" />
            </span>
            <span class="proxy-name-cell">
              <span class="proxy-name">
                {{ proxy.name }}
                <span v-if="proxy.healthCheck?.type" class="proxy-mini-badge" title="已启用健康检查">
                  <HeartPulse :size="11" /> HC
                </span>
              </span>
              <span class="proxy-sub">
                <TypeBadge :type="proxy.type" />
                <span v-if="proxy.plugin?.type">{{ pluginLabel(proxy) }}</span>
                <span v-else>{{ statusKey(proxy) === 'draft' ? '未应用草稿' : '运行在 frpc' }}</span>
              </span>
            </span>
          </div>

          <div class="proxy-field proxy-local">
            <span class="proxy-field-label">本地服务</span>
            <span class="proxy-field-value input-mono">{{ proxyLocal(proxy) }}</span>
          </div>

          <div class="proxy-field proxy-remote">
            <span class="proxy-field-label">公网入口</span>
            <span class="proxy-field-value">{{ endpointFor(proxy) }}</span>
            <span v-if="proxy.type === 'http' || proxy.type === 'https'" class="proxy-sub-text">
              {{ proxy.customDomains?.length > 1 ? `+${proxy.customDomains.length - 1} 个域名` : 'HTTP 域名' }}
            </span>
            <span v-else-if="['tcp', 'udp'].includes(proxy.type)" class="proxy-sub-text">远程端口</span>
          </div>

          <div class="proxy-status">
            <span class="status-badge" :class="`tone-${statusInfo(proxy).tone}`" :title="statusTitle(proxy)">
              <StatusDot :tone="statusInfo(proxy).tone" :pulse="statusKey(proxy) === 'running'" />
              <span>{{ statusInfo(proxy).label }}</span>
            </span>
          </div>

          <div class="proxy-actions" @click.stop>
            <button type="button" class="icon-btn" title="编辑" aria-label="编辑代理" @click="openEdit(proxy)">
              <Pencil :size="15" />
            </button>
            <button type="button" class="icon-btn" title="复制" aria-label="复制代理" @click="duplicateProxy(proxy)">
              <Copy :size="15" />
            </button>
            <button type="button" class="icon-btn danger-hover" title="删除" aria-label="删除代理" @click="askDelete(proxy)">
              <Trash2 :size="15" />
            </button>
          </div>
        </div>
      </div>
      <div class="proxy-table-foot">
        <span><ShieldCheck :size="13" /> 应用前由 frpc 原生校验</span>
        <span><RefreshCw :size="13" /> 应用后自动重启 frpc</span>
        <span class="proxy-table-foot-right">状态每 4 秒同步</span>
      </div>
    </div>

    <div v-else class="card list-empty-card">
      <EmptyState
        v-if="totalCount === 0"
        title="还没有代理"
        description="创建一个隧道，把内网 SSH、网站、数据库或任意 TCP/UDP 服务安全地暴露到公网。"
      >
        <div class="empty-actions-row">
          <button type="button" class="btn btn-primary" @click="openCreate">
            <Plus :size="16" />
            新建第一个代理
          </button>
          <RouterLink to="/connection" class="btn btn-ghost">先配置 frps</RouterLink>
        </div>
      </EmptyState>
      <EmptyState
        v-else
        title="没有匹配的代理"
        description="试试更换筛选条件或清空搜索关键词。"
      >
        <button type="button" class="btn btn-secondary" @click="resetFilters">清空筛选</button>
      </EmptyState>
    </div>

    <ProxyEditor
      :open="editorOpen"
      :proxy="editingProxy"
      :mode="editorMode"
      :existing-names="existingNames"
      @close="closeEditor"
      @save="handleSave"
    />

    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除这个代理？"
      :message="`代理 “${deleteTarget?.name || ''}” 将从草稿中移除，应用配置后 frpc 会停止该隧道。`"
      confirm-label="删除代理"
      :loading="false"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Copy,
  HeartPulse,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-vue-next';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import ProxyEditor from '@/components/ProxyEditor.vue';
import StatusDot from '@/components/StatusDot.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import TypeBadge from '@/components/TypeBadge.vue';
import TypeIcon from '@/components/TypeIcon.vue';
import {
  PLUGIN_META,
  jsonClone,
  nextName,
  proxyEndpoint,
  proxyLocal,
  proxyMeta,
  runtimeProxyMap,
  statusOf,
} from '@/frp';
import { saveConfig, store, toast } from '@/store';

const route = useRoute();
const router = useRouter();
const query = ref('');
const filter = ref('all');
const editorOpen = ref(false);
const editorMode = ref('create');
const editingProxy = ref(null);
const deleteTarget = ref(null);

const proxies = computed(() => store.config?.proxies || []);
const runtimeMap = computed(() => runtimeProxyMap(store.runtime?.proxies || []));
const isRunning = computed(() => store.runtimeStatus === 'running');
const totalCount = computed(() => proxies.value.length);
const enabledCount = computed(() => proxies.value.filter((proxy) => proxy.enabled !== false).length);
const runningCount = computed(
  () => proxies.value.filter((proxy) => statusKey(proxy) === 'running').length,
);

const filters = computed(() => [
  { value: 'all', label: '全部', count: totalCount.value },
  { value: 'running', label: '运行中', count: runningCount.value },
  { value: 'disabled', label: '已停用', count: proxies.value.filter((proxy) => !proxy.enabled).length },
  {
    value: 'attention',
    label: '异常',
    count: proxies.value.filter((proxy) => ['error', 'offline'].includes(statusKey(proxy))).length,
  },
]);

const filteredProxies = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return proxies.value.filter((proxy) => {
    const haystack = [
      proxy.name,
      proxy.type,
      proxy.localIP,
      proxy.localPort,
      proxy.remotePort,
      ...(proxy.customDomains || []),
      proxy.subdomain,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (keyword && !haystack.includes(keyword)) return false;
    const key = statusKey(proxy);
    if (filter.value === 'running') return key === 'running';
    if (filter.value === 'disabled') return key === 'disabled';
    if (filter.value === 'attention') return ['error', 'offline'].includes(key);
    return true;
  });
});

const existingNames = computed(() => {
  const original = editingProxy.value?.name;
  return proxies.value.map((proxy) => proxy.name).filter((name) => name !== original);
});

function statusKey(proxy) {
  if (!proxy.enabled) return 'disabled';
  if (store.dirty) {
    const saved = store.savedConfig?.proxies?.find((item) => item.name === proxy.name);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(proxy)) return 'draft';
  }
  if (!isRunning.value) return store.runtimeStatus === 'error' ? 'error' : 'stopped';
  const live = runtimeMap.value.get(proxy.name);
  if (!live) return 'pending';
  return live.status || 'pending';
}

function statusInfo(proxy) {
  return statusOf(statusKey(proxy));
}

function statusTitle(proxy) {
  const live = runtimeMap.value.get(proxy.name);
  return live?.err || statusInfo(proxy).label;
}

function pluginLabel(proxy) {
  return PLUGIN_META[proxy.plugin?.type]?.label || proxy.plugin.type;
}

function endpointFor(proxy) {
  const live = runtimeMap.value.get(proxy.name);
  if (['tcp', 'udp'].includes(proxy.type) && Number(proxy.remotePort) === 0 && live?.remote_addr) {
    return live.remote_addr;
  }
  return proxyEndpoint(proxy, store.config?.serverAddr);
}

function resetFilters() {
  query.value = '';
  filter.value = 'all';
}

function openCreate() {
  editorMode.value = 'create';
  editingProxy.value = null;
  editorOpen.value = true;
}

function openEdit(proxy) {
  editorMode.value = 'edit';
  editingProxy.value = jsonClone(proxy);
  editorOpen.value = true;
}

function duplicateProxy(proxy) {
  const copy = jsonClone(proxy);
  copy.name = nextName(proxies.value, proxy.type);
  copy.enabled = false;
  copy.remotePort = undefined;
  copy.customDomains = [];
  copy.subdomain = '';
  editorMode.value = 'create';
  editingProxy.value = copy;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  editingProxy.value = null;
  if (route.query.new || route.query.edit) {
    router.replace({ name: 'proxies' });
  }
}

async function handleSave(proxy, options = {}) {
  const list = store.config.proxies;
  if (editorMode.value === 'edit') {
    const original = editingProxy.value?.name;
    const index = list.findIndex((item) => item.name === original);
    if (index >= 0) list[index] = proxy;
    else list.push(proxy);
  } else {
    list.push(proxy);
  }
  closeEditor();
  if (options.apply) {
    try {
      await saveConfig({ restart: true });
    } catch {
      // saveConfig already shows the error, the draft stays editable.
    }
  } else {
    toast('已保存到草稿，点击“应用更改”生效', 'success', 3200);
  }
}

function askDelete(proxy) {
  deleteTarget.value = proxy;
}

function confirmDelete() {
  if (!deleteTarget.value) return;
  const index = store.config.proxies.findIndex((item) => item.name === deleteTarget.value.name);
  if (index >= 0) store.config.proxies.splice(index, 1);
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
      const proxy = proxies.value.find((item) => item.name === params.edit);
      if (proxy) {
        openEdit(proxy);
        handled = true;
      }
    }
    if (handled) router.replace({ name: 'proxies' });
  },
  { immediate: true },
);
</script>
