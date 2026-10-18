<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="sidebar-brand">
        <BrandMark :size="38" />
        <span class="brand-copy">
          <span class="brand-name">FrpcDeck</span>
          <span class="brand-sub">frpc 控制台</span>
        </span>
      </RouterLink>

      <nav class="side-nav" aria-label="主导航">
        <p class="side-label">工作台</p>
        <RouterLink
          v-for="item in primaryNav"
          :key="item.name"
          :to="{ name: item.name }"
          class="side-link"
          :class="{ 'is-active': route.name === item.name }"
        >
          <span class="side-link-icon"><component :is="item.icon" :size="18" /></span>
          <span class="side-link-label">{{ item.label }}</span>
          <span v-if="item.count" class="side-link-count">{{ item.count }}</span>
          <span v-if="item.dot" class="side-link-dot" />
        </RouterLink>

        <p class="side-label side-label-spaced">系统</p>
        <RouterLink
          v-for="item in secondaryNav"
          :key="item.name"
          :to="{ name: item.name }"
          class="side-link"
          :class="{ 'is-active': route.name === item.name }"
        >
          <span class="side-link-icon"><component :is="item.icon" :size="18" /></span>
          <span class="side-link-label">{{ item.label }}</span>
          <span v-if="item.dot" class="side-link-dot" />
        </RouterLink>
      </nav>

      <div class="sidebar-bottom">
        <RouterLink to="/logs" class="side-runtime" :class="`tone-${connectionTone}`">
          <div class="side-runtime-head">
            <StatusDot :tone="connectionTone" :pulse="isLive" />
            <span class="side-runtime-status">{{ connectionLabel }}</span>
            <span v-if="frpc.version" class="side-runtime-version">v{{ frpc.version }}</span>
          </div>
          <div class="side-runtime-server">{{ serverLabel }}</div>
          <div class="side-runtime-meta">
            <span>{{ liveProxyCount }} 个代理在线</span>
            <span v-if="isLive" class="meta-sep">·</span>
            <span v-if="isLive">{{ uptimeLabel }}</span>
          </div>
        </RouterLink>

        <div class="sidebar-user">
          <span class="user-avatar">{{ userInitial }}</span>
          <span class="user-copy">
            <span class="user-name">{{ store.auth.username || 'admin' }}</span>
            <span class="user-role">{{ store.auth.envManaged ? '环境变量账户' : '管理员' }}</span>
          </span>
          <button type="button" class="icon-btn user-logout" title="退出登录" aria-label="退出登录" @click="logout">
            <LogOut :size="16" />
          </button>
        </div>
      </div>
    </aside>

    <div class="main-shell">
      <header class="topbar">
        <div class="topbar-heading">
          <div class="topbar-mobile-brand">
            <BrandMark :size="28" />
            <span>FrpcDeck</span>
          </div>
          <div class="topbar-breadcrumb">
            <span>FrpcDeck</span>
            <ChevronRight :size="12" />
            <span class="current">{{ route.meta.title || '概览' }}</span>
          </div>
          <div class="topbar-title-row">
            <h1 class="topbar-title">{{ route.meta.title || '概览' }}</h1>
            <span v-if="store.dirty" class="unsaved-pill">未应用</span>
          </div>
          <p class="topbar-subtitle">{{ route.meta.subtitle || '' }}</p>
        </div>

        <div class="topbar-actions">
          <RouterLink to="/logs" class="connection-pill" :class="`tone-${connectionTone}`">
            <StatusDot :tone="connectionTone" :pulse="isLive" />
            <span>{{ connectionLabel }}</span>
          </RouterLink>

          <button
            type="button"
            class="icon-btn theme-toggle"
            :title="store.theme === 'dark' ? '切换到浅色' : '切换到深色'"
            :aria-label="store.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
            @click="toggleTheme"
          >
            <Sun v-if="store.theme === 'dark'" :size="18" />
            <Moon v-else :size="18" />
          </button>

          <template v-if="store.dirty">
            <button type="button" class="icon-btn discard-btn" title="放弃更改" aria-label="放弃更改" @click="askDiscard()">
              <RotateCcw :size="17" />
            </button>
            <button type="button" class="btn btn-primary save-btn" :disabled="store.saving" @click="apply">
              <Loader2 v-if="store.saving" :size="16" class="spin" />
              <Check v-else :size="16" />
              <span>{{ store.saving ? '应用中' : '应用更改' }}</span>
              <span class="save-shortcut">⌘S</span>
            </button>
          </template>
          <span v-else-if="store.config" class="saved-state">
            <Check :size="14" />
            <span>已保存</span>
          </span>
        </div>
      </header>

      <main class="page-main">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <nav class="mobile-nav" aria-label="移动端导航">
      <RouterLink
        v-for="item in mobileNav"
        :key="item.name"
        :to="{ name: item.name }"
        class="mobile-nav-link"
        :class="{ 'is-active': route.name === item.name }"
      >
        <span class="mobile-nav-icon">
          <component :is="item.icon" :size="20" />
          <i v-if="item.dot" class="mobile-nav-dot" />
        </span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <Transition name="save-bar">
      <div v-if="store.dirty" class="mobile-save-bar">
        <span class="mobile-save-copy">
          <strong>配置有更改</strong>
          <small>应用后自动重启 frpc</small>
        </span>
        <button type="button" class="btn btn-ghost btn-sm" @click="askDiscard()">放弃</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="store.saving" @click="apply">
          <Loader2 v-if="store.saving" :size="14" class="spin" />
          <span>{{ store.saving ? '应用中' : '应用' }}</span>
        </button>
      </div>
    </Transition>

    <ConfirmDialog
      :open="discardOpen"
      title="放弃未应用的更改？"
      message="当前草稿中还有尚未应用的内容，放弃后将恢复到上一次保存的配置。"
      confirm-label="放弃更改"
      :loading="false"
      @cancel="cancelDiscard"
      @confirm="confirmDiscard"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  RotateCcw,
  ScrollText,
  Server,
  Settings,
  Sun,
  Waypoints,
} from 'lucide-vue-next';
import BrandMark from './BrandMark.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import StatusDot from './StatusDot.vue';
import {
  discardChanges,
  formatUptime,
  logout as doLogout,
  saveConfig,
  store,
  toggleTheme,
} from '@/store';

const route = useRoute();
const router = useRouter();
const discardOpen = ref(false);
const pendingRoute = ref(null);
const now = ref(Date.now());
let clockTimer = null;

const primaryNav = computed(() => [
  { name: 'dashboard', label: '概览', icon: LayoutDashboard },
  { name: 'proxies', label: '代理', icon: Waypoints, count: proxyCount.value },
  { name: 'visitors', label: '访问器', icon: ArrowLeftRight, count: visitorCount.value },
]);

const secondaryNav = computed(() => [
  { name: 'connection', label: '连接配置', icon: Server, dot: !store.config?.serverAddr && !store.templateMode },
  { name: 'logs', label: '运行日志', icon: ScrollText, dot: store.runtimeStatus === 'error' },
  { name: 'settings', label: '设置', icon: Settings },
]);

const mobileNav = computed(() => [
  { name: 'dashboard', label: '概览', icon: LayoutDashboard },
  { name: 'proxies', label: '代理', icon: Waypoints },
  { name: 'visitors', label: '访问器', icon: ArrowLeftRight },
  { name: 'connection', label: '连接', icon: Server },
  { name: 'logs', label: '日志', icon: ScrollText, dot: store.runtimeStatus === 'error' },
  { name: 'settings', label: '设置', icon: Settings },
]);

const proxyCount = computed(
  () => (store.templateMode ? (store.runtime?.proxies || []).length : store.config?.proxies?.length || 0),
);
const visitorCount = computed(() => store.config?.visitors?.length || 0);
const liveProxyCount = computed(
  () => (store.runtime?.proxies || []).filter((item) => item.status === 'running').length,
);
const isLive = computed(
  () => store.runtimeStatus === 'running' && ['online', 'connecting'].includes(store.connection),
);
const connectionTone = computed(() => {
  if (store.runtimeStatus === 'error') return 'danger';
  if (store.runtimeStatus === 'starting' || store.runtimeStatus === 'stopping') return 'warning';
  if (store.runtimeStatus !== 'running') return 'muted';
  if (store.connection === 'online') return 'success';
  if (store.connection === 'connecting') return 'warning';
  return 'danger';
});
const connectionLabel = computed(() => {
  if (store.runtimeStatus === 'error') return '启动失败';
  if (store.runtimeStatus === 'starting') return '启动中';
  if (store.runtimeStatus === 'stopping') return '停止中';
  if (store.runtimeStatus !== 'running') return '未运行';
  if (store.connection === 'online') return '已连接';
  if (store.connection === 'connecting') return '连接中';
  return '重连中';
});
const serverLabel = computed(() => {
  const config = store.config;
  if (store.templateMode) return 'Go 模板模式';
  if (!config?.serverAddr) return '尚未配置 frps';
  return `${config.serverAddr}:${config.serverPort || 7000}`;
});
const uptimeLabel = computed(() => {
  const processInfo = store.runtime?.process;
  if (!processInfo?.startedAt) return '';
  const seconds = Math.max(0, Math.floor((now.value - new Date(processInfo.startedAt).getTime()) / 1000));
  return formatUptime(seconds);
});
const userInitial = computed(() => (store.auth.username || 'A').slice(0, 1).toUpperCase());
const frpc = computed(() => store.frpc || {});

async function apply() {
  if (store.saving) return;
  try {
    await saveConfig({ restart: true });
  } catch {
    // The store already surfaced the error.
  }
}

function askDiscard(target = null) {
  pendingRoute.value = target;
  discardOpen.value = true;
}

function cancelDiscard() {
  pendingRoute.value = null;
  discardOpen.value = false;
}

function confirmDiscard() {
  discardChanges();
  discardOpen.value = false;
  const target = pendingRoute.value;
  pendingRoute.value = null;
  if (target) router.push(target);
}

async function logout() {
  await doLogout();
  router.replace({ name: 'login' });
}

function onKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (store.dirty && !document.body.classList.contains('modal-open')) apply();
  }
}

function onBeforeUnload(event) {
  if (!store.dirty) return;
  event.preventDefault();
  event.returnValue = '';
}

onBeforeRouteLeave((to) => {
  if (!store.dirty) return true;
  askDiscard(to);
  return false;
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 15000);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
  clearInterval(clockTimer);
});
</script>
