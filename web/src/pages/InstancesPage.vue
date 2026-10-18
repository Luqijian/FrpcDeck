<template>
  <div class="page instances-page">
    <div class="instance-grid">
      <article
        v-for="item in store.instances"
        :key="item.id"
        class="card instance-card"
        :class="{ 'is-active': item.id === store.instanceId }"
      >
        <header class="instance-card-head">
          <span class="instance-icon"><Layers :size="18" /></span>
          <div class="instance-heading">
            <div class="instance-name-row">
              <h3>{{ item.name }}</h3>
              <span v-if="item.id === store.instanceId" class="instance-current">当前</span>
            </div>
            <span class="instance-status" :class="`tone-${statusTone(item)}`">
              <StatusDot :tone="statusTone(item)" :pulse="item.status === 'running'" />
              {{ statusLabel(item) }}
            </span>
          </div>
        </header>

        <dl class="instance-facts">
          <div>
            <dt>frps 服务</dt>
            <dd>{{ item.serverAddr ? `${item.serverAddr}:${item.serverPort}` : '尚未配置' }}</dd>
          </div>
          <div>
            <dt>代理 / 访问器</dt>
            <dd>{{ item.proxyCount }} / {{ item.visitorCount }}</dd>
          </div>
          <div>
            <dt>自动启动</dt>
            <dd>{{ item.autoStart ? '已开启' : '已关闭' }}</dd>
          </div>
        </dl>

        <footer class="instance-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="item.id === store.instanceId"
            @click="switchTo(item)"
          >
            <Check v-if="item.id === store.instanceId" :size="14" />
            <ArrowRight v-else :size="14" />
            {{ item.id === store.instanceId ? '正在使用' : '切换到此实例' }}
          </button>
          <button type="button" class="icon-btn" title="重命名" aria-label="重命名实例" @click="openRename(item)">
            <Pencil :size="15" />
          </button>
          <button
            type="button"
            class="icon-btn danger-hover"
            title="删除"
            aria-label="删除实例"
            :disabled="store.instances.length <= 1"
            @click="deleteTarget = item"
          >
            <Trash2 :size="15" />
          </button>
        </footer>
      </article>

      <button type="button" class="card instance-card instance-add" @click="openCreate">
        <span class="instance-add-icon"><Plus :size="22" /></span>
        <strong>新建 frpc 实例</strong>
        <span>连接另一台 frps，使用独立的代理与运行状态</span>
      </button>
    </div>

    <ModalShell
      :open="editorOpen"
      :title="editorMode === 'create' ? '新建 frpc 实例' : '重命名实例'"
      :subtitle="editorMode === 'create' ? '创建后可以切换到该实例，继续配置代理和 frps 认证。' : '只修改显示名称，不影响 frpc 配置。'"
      eyebrow="实例"
      size="sm"
      @close="editorOpen = false"
    >
      <div class="instance-form">
        <FormField label="实例名称" required :error="formError && !form.name.trim() ? '请填写实例名称' : ''">
          <input v-model="form.name" class="input" type="text" maxlength="40" placeholder="例如：日本节点" />
        </FormField>

        <template v-if="editorMode === 'create'">
          <div class="form-grid">
            <FormField label="frps 地址" hint="可以先创建，稍后在连接配置中填写。">
              <input v-model="form.serverAddr" class="input input-mono" type="text" placeholder="frps.example.com" />
            </FormField>
            <FormField label="端口">
              <input v-model.number="form.serverPort" class="input input-mono" type="number" min="1" max="65535" />
            </FormField>
          </div>
          <FormField label="Token" hint="可留空；后续也可以在连接配置中设置。">
            <input v-model="form.token" class="input input-mono" type="password" autocomplete="new-password" placeholder="可选" />
          </FormField>
          <div class="instance-form-note">
            <Info :size="14" />
            <span>每个实例使用独立的 frpc 进程和本地管理端口，不会影响其他实例。</span>
          </div>
        </template>

        <p v-if="formError" class="text-danger instance-form-error">{{ formError }}</p>
      </div>

      <template #footer>
        <button type="button" class="btn btn-ghost" @click="editorOpen = false">取消</button>
        <div class="footer-spacer" />
        <button type="button" class="btn btn-primary" :disabled="saving" @click="submitEditor">
          <Loader2 v-if="saving" :size="15" class="spin" />
          <Plus v-else-if="editorMode === 'create'" :size="15" />
          <Check v-else :size="15" />
          {{ saving ? '保存中…' : editorMode === 'create' ? '创建实例' : '保存名称' }}
        </button>
      </template>
    </ModalShell>

    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除这个实例？"
      :message="deleteTarget ? `实例「${deleteTarget.name}」的 frpc 进程会停止，配置与备份会移到 instances/.deleted/ 保留。` : ''"
      confirm-label="删除实例"
      :loading="deleting"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import {
  ArrowRight,
  Check,
  Info,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FormField from '@/components/FormField.vue';
import ModalShell from '@/components/ModalShell.vue';
import StatusDot from '@/components/StatusDot.vue';
import {
  createInstance,
  deleteInstance,
  renameInstance,
  store,
  switchInstance,
  toast,
} from '@/store';

const editorOpen = ref(false);
const editorMode = ref('create');
const editing = ref(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({
  name: '',
  serverAddr: '',
  serverPort: 7000,
  token: '',
});

const deleteTarget = ref(null);
const deleting = ref(false);

function statusTone(item) {
  if (item.status === 'error') return 'danger';
  if (item.status === 'running' && item.connection === 'online') return 'success';
  if (item.status === 'running' || item.status === 'starting') return 'warning';
  return 'muted';
}

function statusLabel(item) {
  if (item.status === 'error') return '启动失败';
  if (item.status === 'running') return item.connection === 'online' ? '已连接 frps' : '运行中';
  if (item.status === 'starting') return '启动中';
  if (item.status === 'stopping') return '停止中';
  return '未运行';
}

function resetForm() {
  form.name = '';
  form.serverAddr = '';
  form.serverPort = 7000;
  form.token = '';
  formError.value = '';
}

function openCreate() {
  editorMode.value = 'create';
  editing.value = null;
  resetForm();
  editorOpen.value = true;
}

function openRename(item) {
  editorMode.value = 'rename';
  editing.value = item;
  resetForm();
  form.name = item.name;
  editorOpen.value = true;
}

async function submitEditor() {
  if (saving.value) return;
  formError.value = '';
  if (!form.name.trim()) {
    formError.value = '请填写实例名称';
    return;
  }
  saving.value = true;
  try {
    if (editorMode.value === 'rename') {
      await renameInstance(editing.value.id, form.name.trim());
      toast('实例名称已更新', 'success');
      editorOpen.value = false;
      return;
    }
    const config = {
      serverAddr: form.serverAddr.trim(),
      serverPort: Number(form.serverPort) || 7000,
      auth: {
        method: 'token',
        token: form.token,
      },
    };
    const created = await createInstance({ name: form.name.trim(), config });
    editorOpen.value = false;
    toast(`实例「${created.name}」已创建`, 'success');
    await switchInstance(created.id);
  } catch (error) {
    formError.value = error.message || '保存实例失败';
  } finally {
    saving.value = false;
  }
}

async function switchTo(item) {
  if (item.id === store.instanceId) return;
  await switchInstance(item.id);
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return;
  deleting.value = true;
  try {
    await deleteInstance(deleteTarget.value.id, deleteTarget.value.name);
    toast('实例已删除，数据已移到回收目录', 'success');
    deleteTarget.value = null;
  } catch (error) {
    toast(error.message || '删除实例失败', 'error');
  } finally {
    deleting.value = false;
  }
}
</script>
