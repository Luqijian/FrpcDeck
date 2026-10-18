<template>
  <div class="page settings-page">
    <div class="settings-grid">
      <section class="card settings-card">
        <header class="card-head">
          <div class="settings-card-title">
            <span class="settings-icon tone-green"><UserRound :size="17" /></span>
            <div>
              <h3 class="card-title">管理员账户</h3>
              <p class="card-sub">用于登录 FrpcDeck 面板</p>
            </div>
          </div>
          <span class="settings-badge">本地账户</span>
        </header>
        <div class="settings-account-row">
          <span class="user-avatar user-avatar-lg">{{ userInitial }}</span>
          <div class="settings-account-copy">
            <strong>{{ store.auth.username }}</strong>
            <span>密码使用 scrypt 加盐哈希保存，不会写入 frpc.toml</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" @click="logout">
            <LogOut :size="14" />
            退出登录
          </button>
        </div>

        <form class="password-form" @submit.prevent="submitPassword">
          <div class="form-grid">
            <FormField label="用户名" required hint="仅用于登录 FrpcDeck 面板。">
              <input v-model="passwordForm.username" class="input" type="text" autocomplete="username" placeholder="admin" />
            </FormField>
            <FormField label="当前密码" required>
              <input v-model="passwordForm.current" class="input" type="password" autocomplete="current-password" placeholder="输入当前密码" />
            </FormField>
            <FormField label="新密码" required hint="至少 8 个字符。">
              <input v-model="passwordForm.next" class="input" type="password" autocomplete="new-password" placeholder="输入新密码" />
            </FormField>
            <FormField label="确认新密码" required>
              <input v-model="passwordForm.confirm" class="input" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
            </FormField>
          </div>
          <div class="settings-form-actions">
            <span v-if="passwordError" class="text-danger">{{ passwordError }}</span>
            <button type="submit" class="btn btn-secondary btn-sm" :disabled="changingPassword">
              <Loader2 v-if="changingPassword" :size="14" class="spin" />
              <KeyRound v-else :size="14" />
              更新账户
            </button>
          </div>
        </form>
      </section>

      <section class="card settings-card">
        <header class="card-head">
          <div class="settings-card-title">
            <span class="settings-icon tone-purple"><Palette :size="17" /></span>
            <div>
              <h3 class="card-title">外观</h3>
              <p class="card-sub">主题只保存在当前浏览器</p>
            </div>
          </div>
        </header>
        <div class="theme-choices">
          <button
            type="button"
            class="theme-choice"
            :class="{ 'is-active': store.theme === 'dark' }"
            @click="setTheme('dark')"
          >
            <span class="theme-swatch theme-swatch-dark"><i /><i /><i /></span>
            <span><strong>深色</strong><small>适合夜间与终端环境</small></span>
            <Check v-if="store.theme === 'dark'" :size="15" />
          </button>
          <button
            type="button"
            class="theme-choice"
            :class="{ 'is-active': store.theme === 'light' }"
            @click="setTheme('light')"
          >
            <span class="theme-swatch theme-swatch-light"><i /><i /><i /></span>
            <span><strong>浅色</strong><small>明亮环境下更清晰</small></span>
            <Check v-if="store.theme === 'light'" :size="15" />
          </button>
        </div>

        <div class="switch-list settings-switch-list">
          <div class="switch-row">
            <div class="switch-copy">
              <strong>容器启动时自动运行 frpc</strong>
              <small>面板启动后，如果已配置 frps 地址，会自动拉起 frpc。</small>
            </div>
            <ToggleSwitch :model-value="store.settings.autoStart" :disabled="savingSettings" @update:model-value="updateSetting('autoStart', $event)" />
          </div>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>异常退出后自动重启</strong>
              <small>frpc 非正常退出时，按指数退避自动尝试重新启动。</small>
            </div>
            <ToggleSwitch :model-value="store.settings.autoRestart" :disabled="savingSettings" @update:model-value="updateSetting('autoRestart', $event)" />
          </div>
        </div>
      </section>
    </div>

    <section class="card settings-card settings-backup-card">
      <header class="card-head">
        <div class="settings-card-title">
          <span class="settings-icon tone-amber"><DatabaseBackup :size="17" /></span>
          <div>
            <h3 class="card-title">备份与恢复</h3>
            <p class="card-sub">每次应用配置前会自动创建备份，最多保留 30 份。</p>
          </div>
        </div>
        <div class="card-head-actions">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="backupBusy" @click="createBackup">
            <Plus :size="14" />
            立即备份
          </button>
        </div>
      </header>

      <div v-if="backups.length" class="backup-list">
        <div v-for="backup in backups" :key="backup.id" class="backup-row">
          <span class="backup-icon"><History :size="16" /></span>
          <div class="backup-copy">
            <strong>{{ formatBackupTime(backup.createdAt) }}</strong>
            <span>{{ backup.note || '自动备份' }} · {{ backup.proxyCount }} 个代理 · {{ backup.visitorCount }} 个访问器</span>
          </div>
          <span class="backup-size">{{ formatSize(backup.size) }}</span>
          <div class="backup-actions">
            <button type="button" class="btn btn-ghost btn-sm" @click="restoreTarget = backup">恢复</button>
            <button type="button" class="icon-btn" title="下载" aria-label="下载备份" @click="downloadBackup(backup)">
              <Download :size="15" />
            </button>
            <button type="button" class="icon-btn danger-hover" title="删除" aria-label="删除备份" @click="deleteTarget = backup">
              <Trash2 :size="15" />
            </button>
          </div>
        </div>
      </div>
      <div v-else class="settings-empty">
        <History :size="22" />
        <span>{{ backupsLoading ? '正在读取备份…' : '还没有备份。应用配置或点击“立即备份”后会出现在这里。' }}</span>
      </div>
    </section>

    <div class="settings-grid">
      <section class="card settings-card">
        <header class="card-head">
          <div class="settings-card-title">
            <span class="settings-icon tone-blue"><Download :size="17" /></span>
            <div>
              <h3 class="card-title">导入与导出</h3>
              <p class="card-sub">迁移配置或保存一份离线副本</p>
            </div>
          </div>
        </header>
        <div class="settings-action-list">
          <button type="button" class="settings-action" @click="exportConfig('toml')">
            <span class="settings-action-icon"><FileCode2 :size="16" /></span>
            <span><strong>导出 frpc.toml</strong><small>可直接交给 frpc 使用</small></span>
            <Download :size="14" />
          </button>
          <button type="button" class="settings-action" @click="exportConfig('json')">
            <span class="settings-action-icon"><FileJson2 :size="16" /></span>
            <span><strong>导出 JSON 配置</strong><small>包含面板内部格式与全部字段</small></span>
            <Download :size="14" />
          </button>
          <RouterLink to="/connection" class="settings-action">
            <span class="settings-action-icon"><Upload :size="16" /></span>
            <span><strong>导入现有配置</strong><small>支持 TOML / YAML / JSON / INI</small></span>
            <ChevronRight :size="14" />
          </RouterLink>
        </div>

        <div class="settings-info-rows">
          <div class="settings-info-row">
            <span>配置文件</span>
            <code>{{ store.frpc.configPath || '—' }}</code>
          </div>
          <div class="settings-info-row">
            <span>上次保存</span>
            <span>{{ store.savedAt ? formatFullTime(store.savedAt) : '—' }}</span>
          </div>
        </div>
      </section>

      <section class="card settings-card">
        <header class="card-head">
          <div class="settings-card-title">
            <span class="settings-icon tone-muted"><Info :size="17" /></span>
            <div>
              <h3 class="card-title">系统信息</h3>
              <p class="card-sub">当前运行环境与版本</p>
            </div>
          </div>
        </header>
        <div class="settings-info-rows">
          <div class="settings-info-row">
            <span>FrpcDeck</span>
            <span>v{{ store.app.version || '1.0.0' }}</span>
          </div>
          <div class="settings-info-row">
            <span>frpc</span>
            <span :class="store.frpc.available ? '' : 'text-danger'">
              {{ store.frpc.available ? `v${store.frpc.version}` : '未安装' }}
            </span>
          </div>
          <div class="settings-info-row">
            <span>Node.js</span>
            <span>{{ store.app.node || '—' }}</span>
          </div>
          <div class="settings-info-row">
            <span>frpc 进程</span>
            <span>{{ store.runtime.process.pid ? `PID ${store.runtime.process.pid}` : '未运行' }}</span>
          </div>
        </div>
        <div class="settings-links">
          <a href="https://gofrp.org/zh-cn/docs/" target="_blank" rel="noopener noreferrer">frp 文档 ↗</a>
          <a href="https://github.com/fatedier/frp" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        </div>
      </section>
    </div>

    <section class="card settings-card danger-card">
      <header class="card-head">
        <div class="settings-card-title">
          <span class="settings-icon tone-red"><TriangleAlert :size="17" /></span>
          <div>
            <h3 class="card-title">危险操作</h3>
            <p class="card-sub">这些操作会影响当前配置与运行中的 frpc</p>
          </div>
        </div>
      </header>
      <div class="danger-row">
        <div>
          <strong>重置全部配置</strong>
          <p>清空代理、访问器和连接设置，保留管理员账户。frpc 将停止运行。</p>
        </div>
        <button type="button" class="btn btn-danger-ghost" @click="resetOpen = true">
          <RotateCcw :size="14" />
          重置配置
        </button>
      </div>
    </section>

    <ConfirmDialog
      :open="Boolean(restoreTarget)"
      title="恢复这份备份？"
      :message="`将使用 ${restoreTarget ? formatBackupTime(restoreTarget.createdAt) : ''} 的备份替换当前配置，并立即重启 frpc。`"
      confirm-label="恢复并应用"
      tone="warning"
      :loading="restoring"
      @cancel="restoreTarget = null"
      @confirm="restoreBackup"
    />

    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除这份备份？"
      :message="`备份 ${deleteTarget ? formatBackupTime(deleteTarget.createdAt) : ''} 将被永久删除。`"
      confirm-label="删除备份"
      :loading="backupBusy"
      @cancel="deleteTarget = null"
      @confirm="confirmDeleteBackup"
    />

    <ConfirmDialog
      :open="resetOpen"
      title="重置全部配置？"
      message="代理、访问器、认证与连接设置都会被清空，frpc 将停止运行。管理员账户会保留。"
      confirm-label="永久重置"
      require-text="RESET"
      :loading="resetting"
      @cancel="resetOpen = false"
      @confirm="confirmReset"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Check,
  ChevronRight,
  DatabaseBackup,
  Download,
  FileCode2,
  FileJson2,
  History,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Upload,
  UserRound,
} from 'lucide-vue-next';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FormField from '@/components/FormField.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { api } from '@/api';
import {
  applyTheme,
  changeCredentials,
  logout as doLogout,
  resetConfig,
  saveSettings,
  store,
  toast,
} from '@/store';
import { jsonClone } from '@/frp';

const router = useRouter();
const passwordForm = reactive({ username: store.auth.username || 'admin', current: '', next: '', confirm: '' });
const passwordError = ref('');
const changingPassword = ref(false);
const savingSettings = ref(false);
const backups = ref([]);
const backupsLoading = ref(false);
const backupBusy = ref(false);
const restoring = ref(false);
const resetting = ref(false);
const restoreTarget = ref(null);
const deleteTarget = ref(null);
const resetOpen = ref(false);

const userInitial = computed(() => (store.auth.username || 'A').slice(0, 1).toUpperCase());

function setTheme(theme) {
  applyTheme(theme);
}

async function updateSetting(key, value) {
  savingSettings.value = true;
  try {
    await saveSettings({ [key]: value });
    toast('运行设置已保存', 'success', 1800);
  } catch (error) {
    toast(error.message || '保存失败', 'error');
  } finally {
    savingSettings.value = false;
  }
}

async function submitPassword() {
  passwordError.value = '';
  if (!passwordForm.username.trim()) {
    passwordError.value = '请输入用户名';
    return;
  }
  if (!passwordForm.current) {
    passwordError.value = '请输入当前密码';
    return;
  }
  if (passwordForm.next.length < 8) {
    passwordError.value = '新密码至少需要 8 个字符';
    return;
  }
  if (passwordForm.next !== passwordForm.confirm) {
    passwordError.value = '两次输入的新密码不一致';
    return;
  }
  changingPassword.value = true;
  try {
    await changeCredentials({
      currentPassword: passwordForm.current,
      username: passwordForm.username.trim(),
      password: passwordForm.next,
    });
    passwordForm.current = '';
    passwordForm.next = '';
    passwordForm.confirm = '';
    toast('账户已更新，其他会话已失效', 'success');
  } catch (error) {
    passwordError.value = error.message || '修改账户失败';
  } finally {
    changingPassword.value = false;
  }
}

async function logout() {
  await doLogout();
  router.replace({ name: 'login' });
}

async function loadBackups() {
  backupsLoading.value = true;
  try {
    const result = await api.get('/api/backups');
    backups.value = result.backups || [];
  } catch (error) {
    toast(error.message || '读取备份失败', 'error');
  } finally {
    backupsLoading.value = false;
  }
}

async function createBackup() {
  backupBusy.value = true;
  try {
    await api.post('/api/backups', {});
    await loadBackups();
    toast('备份已创建', 'success');
  } catch (error) {
    toast(error.message || '创建备份失败', 'error');
  } finally {
    backupBusy.value = false;
  }
}

async function restoreBackup() {
  if (!restoreTarget.value) return;
  restoring.value = true;
  try {
    const result = await api.post(`/api/backups/${encodeURIComponent(restoreTarget.value.id)}/restore`, {});
    store.config = result.config;
    store.savedConfig = jsonClone(result.config);
    store.savedAt = result.savedAt;
    store.runtime = result.runtime;
    store.issues = result.issues || [];
    restoreTarget.value = null;
    await loadBackups();
    toast('备份已恢复并应用', 'success');
  } catch (error) {
    toast(error.message || '恢复失败', 'error', 6000);
  } finally {
    restoring.value = false;
  }
}

async function confirmDeleteBackup() {
  if (!deleteTarget.value) return;
  backupBusy.value = true;
  try {
    await api.delete(`/api/backups/${encodeURIComponent(deleteTarget.value.id)}`);
    deleteTarget.value = null;
    await loadBackups();
    toast('备份已删除', 'success');
  } catch (error) {
    toast(error.message || '删除失败', 'error');
  } finally {
    backupBusy.value = false;
  }
}

function downloadBackup(backup) {
  api.download(`/api/backups/${encodeURIComponent(backup.id)}/download`, backup.id).catch((error) => {
    toast(error.message || '下载失败', 'error');
  });
}

function exportConfig(format) {
  const filename = format === 'json' ? 'frpcdeck-config.json' : 'frpc.toml';
  api.download(`/api/config/download?format=${format}`, filename).catch((error) => {
    toast(error.message || '导出失败', 'error');
  });
}

async function confirmReset() {
  resetting.value = true;
  try {
    await resetConfig();
    resetOpen.value = false;
    await loadBackups();
    toast('配置已重置，frpc 已停止', 'success');
  } catch (error) {
    toast(error.message || '重置失败', 'error');
  } finally {
    resetting.value = false;
  }
}

function formatBackupTime(value) {
  if (!value) return '未知时间';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatFullTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

onMounted(loadBackups);
</script>
