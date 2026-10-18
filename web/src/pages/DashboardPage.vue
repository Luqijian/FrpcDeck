<template>
  <div class="page dashboard-page">
    <section class="dash-hero" :class="`status-${heroTone}`">
      <div class="hero-backdrop" aria-hidden="true">
        <div class="hero-grid" />
        <div class="hero-orb">
          <span class="hero-orb-ring ring-1" />
          <span class="hero-orb-ring ring-2" />
          <span class="hero-orb-ring ring-3" />
          <span class="hero-orb-core">
            <Wifi v-if="heroState === 'online'" :size="24" />
            <WifiOff v-else-if="heroState === 'offline'" :size="24" />
            <Loader2 v-else-if="heroState === 'connecting'" :size="24" class="spin" />
            <Power v-else-if="heroState === 'stopped'" :size="24" />
            <TriangleAlert v-else :size="24" />
          </span>
        </div>
      </div>

      <div class="hero-content">
        <p class="hero-eyebrow">
          <StatusDot :tone="heroTone" :pulse="heroState === 'online' || heroState === 'connecting'" />
          <span>{{ heroEyebrow }}</span>
          <span v-if="store.runtime.process.pid" class="hero-pid">PID {{ store.runtime.process.pid }}</span>
        </p>
        <h2 class="hero-title">{{ heroTitle }}</h2>
        <p class="hero-desc">{{ heroDesc }}</p>

        <div class="hero-meta">
          <span class="meta-chip">
            <Server :size="14" />
            <span>{{ serverLabel }}</span>
          </span>
          <span class="meta-chip">
            <Waypoints :size="14" />
            <span>{{ proxyCount }} 个代理</span>
          </span>
          <span v-if="isRunning" class="meta-chip">
            <Clock3 :size="14" />
            <span>已运行 {{ uptimeLabel }}</span>
          </span>
          <span v-if="store.frpc.version" class="meta-chip">
            <Boxes :size="14" />
            <span>frpc {{ store.frpc.version }}</span>
          </span>
        </div>
      </div>

      <div class="hero-actions">
        <button
          v-if="!isRunning"
          type="button"
          class="btn btn-primary"
          :disabled="store.busy || !store.config?.serverAddr"
          @click="runAction('start')"
        >
          <Play :size="16" />
          <span>启动 frpc</span>
        </button>
        <button
          v-else
          type="button"
          class="btn btn-secondary"
          :disabled="store.busy"
          @click="runAction('restart')"
        >
          <RefreshCw :size="15" :class="{ spin: store.busy }" />
          <span>重启 frpc</span>
        </button>
        <button
          v-if="isRunning"
          type="button"
          class="btn btn-ghost"
          :disabled="store.busy"
          @click="runAction('stop')"
        >
          <Square :size="14" />
          <span>停止</span>
        </button>
        <RouterLink to="/connection" class="btn btn-ghost hero-config-btn">
          <SlidersHorizontal :size="15" />
          <span>连接配置</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="!store.config?.serverAddr" class="onboarding-card card">
      <div class="onboarding-icon"><Sparkles :size="22" /></div>
      <div class="onboarding-copy">
        <h3>三步开始使用 FrpcDeck</h3>
        <p>连接你的 frps，添加一个代理，然后应用配置。frpc 会由面板自动拉起。</p>
        <div class="onboarding-steps">
          <RouterLink to="/connection" class="onboarding-step">
            <span class="step-index">1</span>
            <span><strong>连接 frps</strong><small>地址、端口与 token</small></span>
            <ArrowRight :size="15" />
          </RouterLink>
          <RouterLink to="/proxies" class="onboarding-step">
            <span class="step-index">2</span>
            <span><strong>添加代理</strong><small>选择类型并填写内网服务</small></span>
            <ArrowRight :size="15" />
          </RouterLink>
          <span class="onboarding-step is-static">
            <span class="step-index">3</span>
            <span><strong>应用配置</strong><small>自动校验并启动 frpc</small></span>
            <Check :size="15" />
          </span>
        </div>
      </div>
    </section>

    <section class="stat-grid">
      <article class="stat-card">
        <span class="stat-icon tone-blue"><Waypoints :size="19" /></span>
        <div class="stat-copy">
          <span class="stat-label">代理总数</span>
          <strong class="stat-value">{{ proxyCount }}</strong>
          <span class="stat-sub">{{ enabledProxyCount }} 个已启用</span>
        </div>
      </article>
      <article class="stat-card">
        <span class="stat-icon tone-green"><Activity :size="19" /></span>
        <div class="stat-copy">
          <span class="stat-label">运行中</span>
          <strong class="stat-value">{{ runningProxyCount }}<span class="stat-total">/ {{ proxyCount }}</span></strong>
          <span class="stat-sub">{{ runtimeAvailable ? '来自 frpc 实时状态' : 'frpc 未运行' }}</span>
        </div>
      </article>
      <article class="stat-card">
        <span class="stat-icon tone-purple"><ArrowLeftRight :size="19" /></span>
        <div class="stat-copy">
          <span class="stat-label">访问器</span>
          <strong class="stat-value">{{ visitorCount }}</strong>
          <span class="stat-sub">STCP / XTCP 入口</span>
        </div>
      </article>
      <article class="stat-card">
        <span class="stat-icon tone-amber"><Timer :size="19" /></span>
        <div class="stat-copy">
          <span class="stat-label">运行时长</span>
          <strong class="stat-value stat-value-small">{{ uptimeLabel }}</strong>
          <span class="stat-sub">{{ isRunning ? `自 ${startedLabel}` : '等待启动' }}</span>
        </div>
      </article>
    </section>

    <section v-if="store.monitor?.available" class="dash-monitor-strip">
      <div class="dash-monitor-item">
        <span>今日流量</span>
        <strong>{{ formatBytes((store.monitor.today?.in || 0) + (store.monitor.today?.out || 0)) }}</strong>
        <small>入 {{ formatBytes(store.monitor.today?.in) }} · 出 {{ formatBytes(store.monitor.today?.out) }}</small>
      </div>
      <div class="dash-monitor-item">
        <span>当前速度</span>
        <strong>{{ formatBytes(store.monitor.server?.inBps, { rate: true }) }} / {{ formatBytes(store.monitor.server?.outBps, { rate: true }) }}</strong>
        <small>frps 入站 / 出站</small>
      </div>
      <div class="dash-monitor-item">
        <span>活跃连接</span>
        <strong>{{ formatCount(store.monitor.today?.connections) }}</strong>
        <small>{{ store.monitor.server?.clientCounts || 0 }} 个客户端</small>
      </div>
      <RouterLink to="/monitor" class="btn btn-ghost btn-sm dash-monitor-link">
        <Activity :size="14" />
        查看监控
      </RouterLink>
    </section>

    <div class="dash-grid">
      <section class="card proxy-overview-card">
        <header class="card-head">
          <div>
            <h3 class="card-title">代理状态</h3>
            <p class="card-sub">frpc 当前同步的隧道</p>
          </div>
          <RouterLink to="/proxies" class="card-link">
            <span>查看全部</span>
            <ArrowRight :size="14" />
          </RouterLink>
        </header>

        <div v-if="displayProxies.length" class="dash-proxy-list">
          <button
            v-for="proxy in displayProxies"
            :key="proxy.name"
            type="button"
            class="dash-proxy-row"
            @click="editProxy(proxy)"
          >
            <span class="proxy-type-icon" :style="{ '--type-color': proxyMeta(proxy).color }">
              <TypeIcon :type="proxy.type" :size="17" />
            </span>
            <span class="proxy-name-cell">
              <span class="proxy-name">
                {{ proxy.name }}
                <span v-if="proxy.batch" class="proxy-batch-badge">批量 {{ batchPortCount(proxy) }}</span>
              </span>
              <span class="proxy-sub">{{ proxyLocal(proxy) }}</span>
            </span>
            <span class="proxy-route-cell">
              <span class="proxy-route">{{ endpointFor(proxy) }}</span>
              <span class="proxy-sub">{{ proxy.type.toUpperCase() }}</span>
            </span>
            <span class="proxy-live" :class="`tone-${statusOf(statusFor(proxy)).tone}`">
              <StatusDot :tone="statusOf(statusFor(proxy)).tone" :pulse="statusFor(proxy) === 'running'" />
              <span>{{ statusOf(statusFor(proxy)).label }}</span>
            </span>
            <ChevronRight :size="15" class="proxy-chevron" />
          </button>
        </div>
        <EmptyState
          v-else
          compact
          title="还没有代理"
          description="创建一个 TCP 或 HTTP 隧道，把内网服务安全地暴露出去。"
        >
          <RouterLink to="/proxies" class="btn btn-primary btn-sm">
            <Plus :size="15" />
            新建代理
          </RouterLink>
        </EmptyState>

        <div v-if="typeCounts.length" class="type-distribution">
          <div class="type-dist-head">
            <span>类型分布</span>
            <span>{{ typeCounts.length }} 种协议</span>
          </div>
          <div class="type-dist-bar" aria-hidden="true">
            <span
              v-for="item in typeCounts"
              :key="item.type"
              :style="{ flex: item.count, background: item.color }"
              :title="`${item.label} ${item.count}`"
            />
          </div>
          <div class="type-dist-legend">
            <span v-for="item in typeCounts" :key="item.type">
              <i :style="{ background: item.color }" />
              {{ item.label }}
              <b>{{ item.count }}</b>
            </span>
          </div>
        </div>
      </section>

      <aside class="dash-side">
        <section class="card health-card">
          <header class="card-head">
            <div>
              <h3 class="card-title">配置健康</h3>
              <p class="card-sub">应用前会由 frpc 原生校验</p>
            </div>
            <span class="health-badge" :class="healthTone">
              <ShieldCheck v-if="errorCount === 0" :size="14" />
              <TriangleAlert v-else :size="14" />
              {{ errorCount === 0 ? (warningCount ? '有提示' : '良好') : '需处理' }}
            </span>
          </header>
          <div class="health-score">
            <div class="health-ring" :class="healthTone">
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="18" class="ring-bg" />
                <circle cx="22" cy="22" r="18" class="ring-value" :style="{ strokeDashoffset: ringOffset }" />
              </svg>
              <span>{{ errorCount === 0 ? '100' : Math.max(20, 100 - errorCount * 20) }}</span>
            </div>
            <div class="health-copy">
              <strong>{{ errorCount === 0 ? '配置可用' : `${errorCount} 个错误待修复` }}</strong>
              <span>{{ warningCount }} 个提示 · {{ savedLabel }} 保存</span>
            </div>
          </div>
          <div class="health-rows">
            <div class="health-row">
              <span>frpc 二进制</span>
              <span :class="store.frpc.available ? 'text-success' : 'text-danger'">
                {{ store.frpc.available ? `v${store.frpc.version}` : '未找到' }}
              </span>
            </div>
            <div class="health-row">
              <span>管理接口</span>
              <span :class="runtimeAvailable ? 'text-success' : 'text-muted'">
                {{ runtimeAvailable ? '可访问' : '未连接' }}
              </span>
            </div>
            <div class="health-row">
              <span>配置格式</span>
              <span class="text-muted">TOML</span>
            </div>
          </div>
          <div class="health-actions">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="tomlLoading" @click="openToml">
              <FileCode2 :size="15" />
              <span>{{ tomlLoading ? '生成中…' : '查看 TOML' }}</span>
            </button>
            <RouterLink to="/connection" class="btn btn-ghost btn-sm">
              编辑配置
            </RouterLink>
          </div>
        </section>

        <section class="card quick-card">
          <header class="card-head">
            <div>
              <h3 class="card-title">快捷操作</h3>
              <p class="card-sub">常用入口</p>
            </div>
          </header>
          <div class="quick-list">
            <button type="button" class="quick-item" @click="createProxy">
              <span class="quick-icon tone-green"><Plus :size="16" /></span>
              <span><strong>新建代理</strong><small>TCP、HTTP、STCP…</small></span>
              <ChevronRight :size="14" />
            </button>
            <RouterLink to="/logs" class="quick-item">
              <span class="quick-icon tone-blue"><ScrollText :size="16" /></span>
              <span><strong>实时日志</strong><small>{{ logCount }} 条最近记录</small></span>
              <ChevronRight :size="14" />
            </RouterLink>
            <RouterLink to="/settings" class="quick-item">
              <span class="quick-icon tone-purple"><DatabaseBackup :size="16" /></span>
              <span><strong>备份与恢复</strong><small>导出或回滚配置</small></span>
              <ChevronRight :size="14" />
            </RouterLink>
          </div>
        </section>
      </aside>
    </div>

    <section class="card recent-log-card">
      <header class="card-head">
        <div>
          <h3 class="card-title">最近日志</h3>
          <p class="card-sub">来自 frpc 进程的实时输出</p>
        </div>
        <RouterLink to="/logs" class="card-link">
          <span>打开日志</span>
          <ArrowRight :size="14" />
        </RouterLink>
      </header>
      <div v-if="recentLogs.length" class="mini-terminal">
        <div v-for="entry in recentLogs" :key="entry.seq" class="mini-log-line">
          <span class="mini-log-time">{{ timeOnly(entry.t) }}</span>
          <span class="log-level" :class="`level-${entry.level}`">{{ entry.level.toUpperCase() }}</span>
          <span class="mini-log-text">{{ stripLogTimestamp(entry.text) }}</span>
        </div>
      </div>
      <div v-else class="mini-terminal mini-terminal-empty">
        <TerminalSquare :size="18" />
        <span>暂无日志。启动 frpc 后这里会显示实时输出。</span>
      </div>
    </section>

    <ModalShell
      :open="showToml"
      title="生成的 frpc.toml"
      subtitle="保存时写入数据目录，并由 frpc 原生校验。"
      variant="modal"
      size="lg"
      @close="showToml = false"
    >
      <CodeBlock v-if="toml" :code="toml" filename="frpc.toml" max-height="62vh" />
      <div v-else class="toml-loading"><Loader2 :size="18" class="spin" /> 正在生成…</div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="showToml = false">关闭</button>
        <button type="button" class="btn btn-primary" @click="downloadToml">
          <Download :size="15" />
          下载配置
        </button>
      </template>
    </ModalShell>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  Clock3,
  DatabaseBackup,
  Download,
  FileCode2,
  Loader2,
  Play,
  Plus,
  Power,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  TerminalSquare,
  Timer,
  TriangleAlert,
  Wifi,
  WifiOff,
  Waypoints,
} from 'lucide-vue-next';
import CodeBlock from '@/components/CodeBlock.vue';
import EmptyState from '@/components/EmptyState.vue';
import ModalShell from '@/components/ModalShell.vue';
import StatusDot from '@/components/StatusDot.vue';
import TypeIcon from '@/components/TypeIcon.vue';
import {
  formatTime,
  formatUptime,
  previewToml,
  refreshMonitor,
  refreshRuntime,
  runtimeAction,
  store,
  toast,
  validateDraft,
} from '@/store';
import {
  batchPortCount,
  formatBytes,
  formatCount,
  proxyEndpoint,
  proxyLocal,
  proxyMeta,
  proxyRuntimeStatus,
  runtimeProxyMap,
  statusOf,
} from '@/frp';
import { stripLogTimestamp } from '@/utils';

const router = useRouter();
const now = ref(Date.now());
const showToml = ref(false);
const toml = ref('');
const tomlLoading = ref(false);
let timer = null;

const displaySource = computed(() => store.config?.proxies || []);
const proxyCount = computed(() => displaySource.value.length);
const visitorCount = computed(() => store.config?.visitors?.length || 0);
const enabledProxyCount = computed(
  () => displaySource.value.filter((proxy) => proxy.enabled !== false).length,
);
const isRunning = computed(() => ['running', 'starting'].includes(store.runtimeStatus));
const runtimeAvailable = computed(() => Boolean(store.runtime?.process?.adminAvailable));
const runtimeMap = computed(() => runtimeProxyMap(store.runtime?.proxies || []));
const runningProxyCount = computed(
  () => displaySource.value.filter((proxy) => statusFor(proxy) === 'running').length,
);
const displayProxies = computed(() => displaySource.value.slice(0, 6));
const typeCounts = computed(() => {
  const counts = new Map();
  for (const proxy of displaySource.value) {
    const meta = proxyMeta(proxy);
    const current = counts.get(proxy.type) || { type: proxy.type, label: meta.label, color: meta.color, count: 0 };
    current.count += 1;
    counts.set(proxy.type, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
});
const logCount = computed(() => store.logs.length);
const recentLogs = computed(() => store.logs.slice(-5));

const heroState = computed(() => {
  if (!store.config?.serverAddr) return 'unconfigured';
  if (store.runtimeStatus === 'error') return 'error';
  if (store.runtimeStatus === 'starting') return 'connecting';
  if (store.runtimeStatus !== 'running') return 'stopped';
  if (store.connection === 'online') return 'online';
  if (store.connection === 'connecting') return 'connecting';
  return 'offline';
});
const heroTone = computed(() => ({
  online: 'success',
  connecting: 'warning',
  offline: 'danger',
  error: 'danger',
  stopped: 'muted',
  unconfigured: 'muted',
}[heroState.value]));
const heroEyebrow = computed(() => ({
  online: 'frpc 已连接',
  connecting: '正在建立连接',
  offline: '连接已断开',
  error: 'frpc 运行异常',
  stopped: 'frpc 未运行',
  unconfigured: '等待配置',
}[heroState.value]));
const heroTitle = computed(() => ({
  online: '隧道已连接，运行正常',
  connecting: '正在连接 frps…',
  offline: '与 frps 的连接已断开',
  error: 'frpc 启动失败',
  stopped: 'frpc 尚未运行',
  unconfigured: '先连接到你的 frps',
}[heroState.value]));
const heroDesc = computed(() => {
  if (heroState.value === 'online') {
    return `已同步 ${runningProxyCount.value} 个运行中的代理，流量正在安全转发。`;
  }
  if (heroState.value === 'connecting') return '正在登录 frps 并同步代理配置，通常只需要几秒钟。';
  if (heroState.value === 'offline') {
    return store.runtime.process.lastError
      ? store.runtime.process.lastError
      : 'frpc 会持续尝试重新连接，请检查网络或 frps 状态。';
  }
  if (heroState.value === 'error') {
    return store.runtime.process.lastError || '请查看运行日志了解详细错误，并检查配置。';
  }
  if (heroState.value === 'stopped') return '配置已就绪，启动 frpc 后即可建立隧道。';
  return '填写 frps 地址与认证信息，即可开始管理你的内网穿透。';
});
const serverLabel = computed(() => {
  if (!store.config?.serverAddr) return '未配置 frps';
  return `${store.config.serverAddr}:${store.config.serverPort || 7000}`;
});
const uptimeLabel = computed(() => {
  const startedAt = store.runtime?.process?.startedAt;
  if (!startedAt) return '—';
  const seconds = Math.max(0, Math.floor((now.value - new Date(startedAt).getTime()) / 1000));
  return formatUptime(seconds);
});
const startedLabel = computed(() => {
  const startedAt = store.runtime?.process?.startedAt;
  return startedAt ? formatTime(startedAt) : '—';
});
const errorCount = computed(() => (store.issues || []).filter((item) => item.level === 'error').length);
const warningCount = computed(() => (store.issues || []).filter((item) => item.level === 'warning').length);
const healthTone = computed(() => (errorCount.value > 0 ? 'danger' : warningCount.value > 0 ? 'warning' : 'success'));
const ringOffset = computed(() => {
  const value = errorCount.value === 0 ? 0 : Math.min(0.8, errorCount.value * 0.2);
  return `${113 * value}`;
});
const savedLabel = computed(() => (store.savedAt ? formatTime(store.savedAt) : '—'));

function statusFor(proxy) {
  if (!proxy.enabled) return 'disabled';
  if (!['running', 'starting'].includes(store.runtimeStatus)) {
    return store.runtimeStatus === 'error' ? 'error' : 'stopped';
  }
  return proxyRuntimeStatus(proxy, runtimeMap.value);
}

function endpointFor(proxy) {
  const live = runtimeMap.value.get(proxy.name);
  if (['tcp', 'udp'].includes(proxy.type) && Number(proxy.remotePort) === 0 && live?.remote_addr) {
    return live.remote_addr;
  }
  return proxyEndpoint(proxy, store.config?.serverAddr);
}

function timeOnly(value) {
  if (!value) return '--:--:--';
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
}

async function runAction(action) {
  try {
    await runtimeAction(action);
  } catch {
    // Toast already shown.
  }
}

function createProxy() {
  router.push({ name: 'proxies', query: { new: '1' } });
}

function editProxy(proxy) {
  router.push({ name: 'proxies', query: { edit: proxy.name } });
}

async function openToml() {
  showToml.value = true;
  tomlLoading.value = true;
  try {
    const result = await previewToml();
    toml.value = result.toml;
  } catch (error) {
    toast(error.message || '生成 TOML 失败', 'error');
    showToml.value = false;
  } finally {
    tomlLoading.value = false;
  }
}

function downloadToml() {
  const blob = new Blob([toml.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'frpc.toml';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

onMounted(async () => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 10000);
  refreshRuntime().catch(() => {});
  refreshMonitor().catch(() => {});
  validateDraft().catch(() => {});
});

onBeforeUnmount(() => {
  clearInterval(timer);
});
</script>
