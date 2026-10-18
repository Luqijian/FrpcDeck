<template>
  <div class="page logs-page">
    <div class="log-status-strip">
      <span class="log-status-item">
        <StatusDot :tone="processTone" :pulse="store.runtimeStatus === 'running'" />
        <strong>{{ processLabel }}</strong>
      </span>
      <span class="log-status-sep" />
      <span class="log-status-item">
        <span class="log-status-label">PID</span>
        <span class="input-mono">{{ store.runtime.process.pid || '—' }}</span>
      </span>
      <span class="log-status-item">
        <span class="log-status-label">版本</span>
        <span>{{ store.frpc.version || '—' }}</span>
      </span>
      <span class="log-status-item">
        <span class="log-status-label">已接收</span>
        <span>{{ store.logs.length }} 行</span>
      </span>
      <span class="log-status-item log-status-connection" :class="`tone-${connectionTone}`">
        <Wifi :size="13" />
        {{ connectionText }}
      </span>
      <button type="button" class="btn btn-secondary btn-sm log-restart" :disabled="store.busy" @click="restart">
        <RefreshCw :size="14" :class="{ spin: store.busy }" />
        重启 frpc
      </button>
    </div>

    <div class="log-toolbar">
      <div class="log-toolbar-left">
        <div class="live-pill" :class="{ 'is-paused': paused }">
          <span class="live-dot" />
          <span>{{ paused ? '已暂停' : '实时' }}</span>
          <button type="button" :aria-label="paused ? '继续实时输出' : '暂停实时输出'" @click="togglePause">
            <Play v-if="paused" :size="13" />
            <Pause v-else :size="13" />
          </button>
        </div>
        <div class="filter-chips log-levels">
          <button
            v-for="level in levelFilters"
            :key="level.value"
            type="button"
            class="filter-chip level-chip"
            :class="[`level-${level.value || 'all'}`, { 'is-active': level.value === '' ? levels.length === 0 : levels.includes(level.value) }]"
            @click="toggleLevel(level.value)"
          >
            {{ level.label }}
            <span>{{ level.count }}</span>
          </button>
        </div>
      </div>
      <div class="log-toolbar-right">
        <div class="search-box search-box-sm">
          <Search :size="15" class="search-icon" />
          <input v-model="search" type="search" placeholder="搜索日志…" aria-label="搜索日志" />
          <button v-if="search" type="button" class="search-clear" aria-label="清空搜索" @click="search = ''">
            <X :size="13" />
          </button>
        </div>
        <button type="button" class="icon-btn" title="清空当前视图" aria-label="清空当前视图" @click="clearView">
          <Eraser :size="16" />
        </button>
        <CopyButton :text="visibleText" label="复制" />
        <button type="button" class="btn btn-secondary btn-sm" @click="downloadLogs">
          <Download :size="14" />
          <span class="hide-mobile">下载</span>
        </button>
      </div>
    </div>

    <section class="terminal-card">
      <header class="terminal-head">
        <span class="code-dots" aria-hidden="true"><i /><i /><i /></span>
        <span class="terminal-title">frpc · live output</span>
        <span class="terminal-meta">
          <span v-if="!follow" class="terminal-jump" role="button" tabindex="0" @click="jumpToBottom">回到底部 ↓</span>
          <span>{{ filteredLogs.length }} 行</span>
        </span>
      </header>
      <div ref="terminal" class="terminal-body" @scroll="onScroll">
        <div v-if="filteredLogs.length" class="terminal-lines">
          <div v-for="entry in filteredLogs" :key="entry.seq" class="log-line" :class="`level-${entry.level}`">
            <span class="log-time">{{ timeOnly(entry.t) }}</span>
            <span class="log-level-badge">{{ levelShort(entry.level) }}</span>
            <span v-if="entry.source && entry.source !== 'stdout'" class="log-source">{{ entry.source }}</span>
            <span class="log-text">{{ stripLogTimestamp(entry.text) }}</span>
          </div>
        </div>
        <div v-else class="terminal-empty">
          <TerminalSquare :size="30" />
          <p v-if="store.logs.length === 0">暂无日志。启动 frpc 后，输出会实时出现在这里。</p>
          <p v-else>没有匹配当前筛选条件的日志。</p>
          <button v-if="store.logs.length" type="button" class="btn btn-secondary btn-sm" @click="resetFilters">
            重置筛选
          </button>
        </div>
      </div>
    </section>

    <p class="log-footnote">
      <Info :size="13" />
      日志最多在内存中保留 2000 行；使用文件日志时，面板会自动跟随文件追加内容。
    </p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Download,
  Eraser,
  Info,
  Pause,
  Play,
  RefreshCw,
  Search,
  TerminalSquare,
  Wifi,
  X,
} from 'lucide-vue-next';
import CopyButton from '@/components/CopyButton.vue';
import StatusDot from '@/components/StatusDot.vue';
import { api } from '@/api';
import {
  refreshLogs,
  refreshRuntime,
  runtimeAction,
  store,
  toast,
} from '@/store';
import { stripLogTimestamp } from '@/utils';

const terminal = ref(null);
const paused = ref(false);
const follow = ref(true);
const search = ref('');
const levels = ref([]);
let timer = null;

const processLabel = computed(() => {
  if (store.runtimeStatus === 'running') return 'frpc 运行中';
  if (store.runtimeStatus === 'starting') return 'frpc 启动中';
  if (store.runtimeStatus === 'stopping') return 'frpc 停止中';
  if (store.runtimeStatus === 'error') return 'frpc 启动失败';
  return 'frpc 未运行';
});
const processTone = computed(() => {
  if (store.runtimeStatus === 'error') return 'danger';
  if (['running', 'starting'].includes(store.runtimeStatus)) return 'success';
  return 'muted';
});
const connectionText = computed(() => {
  if (store.runtimeStatus !== 'running') return '未建立连接';
  if (store.connection === 'online') return '已连接 frps';
  if (store.connection === 'connecting') return '连接中';
  return '等待重连';
});
const connectionTone = computed(() => {
  if (store.runtimeStatus !== 'running') return 'muted';
  if (store.connection === 'online') return 'success';
  if (store.connection === 'connecting') return 'warning';
  return 'danger';
});

const levelFilters = computed(() => [
  { value: '', label: '全部', count: store.logs.length },
  { value: 'error', label: '错误', count: store.logs.filter((item) => item.level === 'error').length },
  { value: 'warn', label: '警告', count: store.logs.filter((item) => item.level === 'warn').length },
  { value: 'info', label: '信息', count: store.logs.filter((item) => item.level === 'info').length },
  { value: 'debug', label: '调试', count: store.logs.filter((item) => item.level === 'debug').length },
  { value: 'trace', label: '追踪', count: store.logs.filter((item) => item.level === 'trace').length },
]);

const filteredLogs = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const active = levels.value;
  return store.logs.filter((entry) => {
    if (active.length > 0 && !active.includes(entry.level)) return false;
    if (keyword && !entry.text.toLowerCase().includes(keyword)) return false;
    return true;
  });
});

const visibleText = computed(() =>
  filteredLogs.value
    .map((entry) => `${entry.t} [${entry.level.toUpperCase()}] ${entry.text}`)
    .join('\n'),
);

function timeOnly(value) {
  if (!value) return '--:--:--';
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
}

function levelShort(level) {
  return { trace: 'TRC', debug: 'DBG', info: 'INF', warn: 'WRN', error: 'ERR' }[level] || 'LOG';
}

function togglePause() {
  paused.value = !paused.value;
  if (!paused.value) {
    follow.value = true;
    jumpToBottom();
  }
}

function toggleLevel(value) {
  if (value === '') {
    levels.value = [];
    return;
  }
  if (levels.value.includes(value)) {
    levels.value = levels.value.filter((item) => item !== value);
  } else {
    levels.value = [...levels.value, value];
  }
}

function resetFilters() {
  levels.value = [];
  search.value = '';
}

function clearView() {
  store.logs = [];
  toast('已清空当前日志视图', 'info', 2000);
}

function isAtBottom() {
  const element = terminal.value;
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 60;
}

function onScroll() {
  if (!terminal.value) return;
  follow.value = isAtBottom();
}

function jumpToBottom() {
  follow.value = true;
  nextTick(() => {
    if (terminal.value) terminal.value.scrollTop = terminal.value.scrollHeight;
  });
}

async function restart() {
  try {
    await runtimeAction('restart');
  } catch {
    // Toast handled by store.
  }
}

function downloadLogs() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  api.download('/api/logs/download', `frpc-${stamp}.log`).catch((error) => {
    toast(error.message || '下载失败', 'error');
  });
}

watch(
  () => store.logs.length,
  () => {
    if (!paused.value && follow.value) {
      nextTick(() => {
        if (terminal.value) terminal.value.scrollTop = terminal.value.scrollHeight;
      });
    }
  },
);

watch(
  () => filteredLogs.value.length,
  () => {
    if (!paused.value && follow.value) {
      nextTick(() => {
        if (terminal.value) terminal.value.scrollTop = terminal.value.scrollHeight;
      });
    }
  },
);

onMounted(async () => {
  await Promise.all([
    refreshLogs(1000).catch(() => {}),
    refreshRuntime().catch(() => {}),
  ]);
  jumpToBottom();
  timer = setInterval(() => {
    if (store.sseStatus !== 'open') refreshLogs(1000).catch(() => {});
  }, 15000);
});

onBeforeUnmount(() => {
  clearInterval(timer);
});
</script>
