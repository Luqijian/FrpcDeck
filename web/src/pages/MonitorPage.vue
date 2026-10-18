<template>
  <div class="page monitor-page">
    <div class="monitor-toolbar">
      <div class="monitor-toolbar-copy">
        <span class="monitor-live-dot" :class="{ 'is-live': monitor?.available }" />
        <span v-if="monitor?.available">frps Dashboard 已连接 · 每 {{ monitor.intervalSeconds || 15 }} 秒采样</span>
        <span v-else-if="monitor?.enabled">等待 frps Dashboard 数据</span>
        <span v-else>流量监控未启用</span>
      </div>
      <div class="monitor-toolbar-actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="refresh">
          <RefreshCw :size="14" :class="{ spin: loading }" />
          刷新
        </button>
        <RouterLink to="/settings" class="btn btn-secondary btn-sm">
          <Settings2 :size="14" />
          监控设置
        </RouterLink>
      </div>
    </div>

    <section v-if="!monitor?.enabled" class="card monitor-setup">
      <span class="monitor-setup-icon"><Activity :size="22" /></span>
      <div>
        <h3>启用 frps 流量监控</h3>
        <p>frpc 本身不提供流量与连接数统计。FrpcDeck 会读取 frps 的 Dashboard API，因此需要先在 frps 开启 webServer，并在当前实例的「设置 → frps 流量监控」中填写地址和认证信息。</p>
        <pre># frps.toml
webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "change-me"</pre>
        <RouterLink to="/settings" class="btn btn-primary btn-sm">
          <Settings2 :size="14" />
          前往设置
        </RouterLink>
      </div>
    </section>

    <section v-else-if="!monitor.available" class="card monitor-setup monitor-error-card">
      <span class="monitor-setup-icon tone-danger"><TriangleAlert :size="22" /></span>
      <div>
        <h3>无法读取 frps Dashboard</h3>
        <p>{{ monitor.error || '请检查 Dashboard 地址、端口和认证信息。' }}</p>
        <RouterLink to="/settings" class="btn btn-secondary btn-sm">
          <Settings2 :size="14" />
          检查监控设置
        </RouterLink>
      </div>
    </section>

    <template v-else>
      <section class="monitor-stat-grid">
        <article class="card monitor-stat">
          <span class="monitor-stat-icon tone-blue"><ArrowDownToLine :size="18" /></span>
          <span class="monitor-stat-label">今日入站</span>
          <strong>{{ formatBytes(monitor.today?.in) }}</strong>
          <small>所有代理累计</small>
        </article>
        <article class="card monitor-stat">
          <span class="monitor-stat-icon tone-green"><ArrowUpFromLine :size="18" /></span>
          <span class="monitor-stat-label">今日出站</span>
          <strong>{{ formatBytes(monitor.today?.out) }}</strong>
          <small>所有代理累计</small>
        </article>
        <article class="card monitor-stat">
          <span class="monitor-stat-icon tone-purple"><Gauge :size="18" /></span>
          <span class="monitor-stat-label">当前速度</span>
          <strong class="monitor-rate"><ArrowDownToLine :size="13" />{{ formatBytes(monitor.server?.inBps, { rate: true }) }}<ArrowUpFromLine :size="13" />{{ formatBytes(monitor.server?.outBps, { rate: true }) }}</strong>
          <small>frps 总入站 / 出站</small>
        </article>
        <article class="card monitor-stat">
          <span class="monitor-stat-icon tone-amber"><Cable :size="18" /></span>
          <span class="monitor-stat-label">活跃连接</span>
          <strong>{{ formatCount(monitor.today?.connections) }}</strong>
          <small>{{ monitor.server?.clientCounts || 0 }} 个 frpc 客户端</small>
        </article>
      </section>

      <section class="card monitor-chart-card">
        <header class="card-head">
          <div>
            <h3 class="card-title">实时吞吐</h3>
            <p class="card-sub">最近 {{ monitor.history?.length || 0 }} 个采样点 · {{ monitor.intervalSeconds || 15 }} 秒 / 点</p>
          </div>
          <div class="monitor-legend">
            <span><i class="tone-green" />出站</span>
            <span><i class="tone-blue" />入站</span>
          </div>
        </header>
        <div class="monitor-chart">
          <svg v-if="history.length > 1" viewBox="0 0 720 210" preserveAspectRatio="none" role="img" aria-label="入站出站速率曲线">
            <defs>
              <linearGradient id="monitorIn" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="var(--info)" stop-opacity="0.22" />
                <stop offset="100%" stop-color="var(--info)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line v-for="line in 3" :key="line" x1="0" x2="720" :y1="line * 52" :y2="line * 52" class="monitor-grid-line" />
            <path v-if="inArea" :d="inArea" fill="url(#monitorIn)" />
            <path :d="inPath" class="monitor-line monitor-line-in" />
            <path :d="outPath" class="monitor-line monitor-line-out" />
          </svg>
          <div v-else class="monitor-chart-empty">正在积累采样点，至少需要 2 个点生成曲线</div>
          <div class="monitor-chart-axis">
            <span>{{ historyRange[0] }}</span>
            <span>{{ historyRange[1] }}</span>
          </div>
        </div>
      </section>

      <section class="card monitor-proxy-card">
        <header class="card-head">
          <div>
            <h3 class="card-title">代理流量</h3>
            <p class="card-sub">按今日流量排序 · 数据来自 frps Dashboard</p>
          </div>
          <span class="monitor-sample-time">{{ monitor.sampledAt ? `采样于 ${timeAgo(monitor.sampledAt)}` : '' }}</span>
        </header>
        <div v-if="proxies.length" class="monitor-table">
          <div class="monitor-table-head">
            <span>代理</span>
            <span>状态</span>
            <span>连接</span>
            <span>入站</span>
            <span>出站</span>
            <span>最近启动</span>
          </div>
          <div v-for="proxy in proxies" :key="proxy.name" class="monitor-table-row">
            <span class="monitor-proxy-name">
              <TypeIcon :type="proxy.type" :size="15" />
              <span><strong>{{ proxy.name }}</strong><small>{{ proxy.type.toUpperCase() }}</small></span>
            </span>
            <span class="monitor-state" :class="proxy.status === 'online' ? 'is-online' : 'is-offline'">{{ proxy.status === 'online' ? '在线' : '离线' }}</span>
            <span class="monitor-number">{{ formatCount(proxy.connections) }}</span>
            <span class="monitor-number">{{ formatBytes(proxy.trafficIn) }}</span>
            <span class="monitor-number">{{ formatBytes(proxy.trafficOut) }}</span>
            <span class="monitor-muted">{{ proxy.lastStartTime || '—' }}</span>
          </div>
        </div>
        <div v-else class="monitor-empty">暂时没有代理流量数据</div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cable,
  Gauge,
  RefreshCw,
  Settings2,
  TriangleAlert,
} from 'lucide-vue-next';
import TypeIcon from '@/components/TypeIcon.vue';
import { formatBytes, formatCount } from '@/frp';
import { refreshMonitor, store, timeAgo } from '@/store';

const loading = ref(false);
const monitor = computed(() => store.monitor);
const proxies = computed(() => monitor.value?.proxies || []);
let timer = null;

const history = computed(() => monitor.value?.history || []);
const chartMax = computed(() => Math.max(1, ...history.value.flatMap((point) => [Number(point.inBps) || 0, Number(point.outBps) || 0])));

function chartPath(key) {
  const points = history.value;
  if (!points.length) return '';
  return points.map((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 720;
    const y = 196 - (Number(point[key]) || 0) / chartMax.value * 176;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function areaPath(key) {
  const path = chartPath(key);
  if (!path) return '';
  return `${path} L720,210 L0,210 Z`;
}

const inPath = computed(() => chartPath('inBps'));
const outPath = computed(() => chartPath('outBps'));
const inArea = computed(() => areaPath('inBps'));
const historyRange = computed(() => {
  const points = history.value;
  if (!points.length) return ['—', '—'];
  const format = (value) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return [format(points[0].t), format(points[points.length - 1].t)];
});

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    await refreshMonitor();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 10000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>
