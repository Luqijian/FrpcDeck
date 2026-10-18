<template>
  <ModalShell
    :open="open"
    :title="isNew ? '新建访问器' : '编辑访问器'"
    :subtitle="isNew ? '通过访问器连接其他 frpc 暴露的秘密服务。' : `正在编辑 ${form?.name || ''}`"
    eyebrow="访问器配置"
    variant="drawer"
    size="lg"
    @close="close"
  >
    <div v-if="form" ref="formTop" class="proxy-editor">
      <div class="editor-summary">
        <span class="editor-summary-icon" :style="{ '--type-color': currentMeta.color }">
          <TypeIcon :type="form.type" :size="20" />
        </span>
        <div class="editor-summary-copy">
          <strong>{{ form.name || '未命名访问器' }}</strong>
          <span>{{ currentMeta.label }} · {{ form.serverName || '未选择目标代理' }} → {{ bindLabel }}</span>
        </div>
        <span class="editor-summary-state">{{ pluginEnabled ? 'VirtualNet' : '已配置' }}</span>
      </div>

      <Transition name="fade">
        <div v-if="attempted && errorList.length" class="editor-errors" role="alert">
          <TriangleAlert :size="17" />
          <div>
            <strong>请先修正以下问题</strong>
            <ul>
              <li v-for="message in errorList" :key="message">{{ message }}</li>
            </ul>
          </div>
        </div>
      </Transition>

      <section class="editor-block">
        <div class="editor-block-head">
          <div>
            <h3>访问器类型</h3>
            <p>STCP / SUDP 通过 frps 中转，XTCP 优先尝试 P2P 直连。</p>
          </div>
        </div>
        <div class="type-grid type-grid-three">
          <button
            v-for="choice in visitorTypeChoices"
            :key="choice.value"
            type="button"
            class="type-choice"
            :class="{ 'is-active': form.type === choice.value }"
            :style="{ '--type-color': choice.color }"
            @click="chooseType(choice.value)"
          >
            <span class="type-choice-icon"><TypeIcon :type="choice.value" :size="18" /></span>
            <span class="type-choice-copy">
              <strong>{{ choice.label }}</strong>
              <small>{{ choice.name }}</small>
            </span>
            <Check v-if="form.type === choice.value" :size="14" class="type-choice-check" />
          </button>
        </div>
      </section>

      <FormSection title="目标与身份" description="目标来自另一台 frpc 上配置的秘密代理。">
        <div class="form-grid">
          <FormField label="访问器名称" required :error="attempted ? errors.name : ''">
            <input v-model="form.name" class="input" type="text" placeholder="my-visitor" @input="autoName = false" />
          </FormField>
          <FormField label="目标代理名称" required :error="attempted ? errors.serverName : ''">
            <input v-model="form.serverName" class="input" type="text" placeholder="secret-tcp" />
          </FormField>
          <FormField label="目标用户" hint="留空表示当前 frpc 的 user。">
            <input v-model="form.serverUser" class="input" type="text" placeholder="other-user" />
          </FormField>
          <FormField label="Secret Key" required :error="attempted ? errors.secretKey : ''">
            <div class="input-button-group">
              <input v-model="form.secretKey" class="input input-mono" type="text" placeholder="与服务端一致" />
              <CopyButton :text="form.secretKey" icon-only />
            </div>
          </FormField>
        </div>
      </FormSection>

      <FormSection title="本地绑定" description="访问器在本机监听的地址，连接会转发到目标代理。">
        <div class="form-grid">
          <FormField label="绑定地址" required :error="attempted ? errors.bindAddr : ''">
            <input v-model="form.bindAddr" class="input input-mono" type="text" placeholder="127.0.0.1" />
          </FormField>
          <FormField
            label="绑定端口"
            required
            :error="attempted ? errors.bindPort : ''"
            :hint="form.bindPort === -1 ? '-1 表示不监听端口，仅供其他访问器回退使用。' : '建议使用未被占用的高位端口。'"
          >
            <input
              v-model.number="form.bindPort"
              class="input input-mono"
              type="number"
              min="-1"
              max="65535"
              placeholder="9000"
              :disabled="pluginEnabled"
            />
          </FormField>
        </div>
        <p v-if="pluginEnabled" class="form-note">
          <Info :size="14" />
          VirtualNet 插件会将绑定端口设为 -1，无需本机监听。
        </p>
      </FormSection>

      <FormSection title="访问器插件" description="使用 VirtualNet 加入 frps 虚拟网络。">
        <div class="switch-row">
          <div class="switch-copy">
            <strong>启用 VirtualNet</strong>
            <small>通过虚拟网络直接访问目标 IP，需要 frps 开启 VirtualNet。</small>
          </div>
          <ToggleSwitch v-model="pluginEnabled" />
        </div>
        <div v-if="pluginEnabled" class="plugin-panel">
          <FormField label="目标 IP" required :error="attempted ? errors.destinationIP : ''">
            <input v-model="form.plugin.destinationIP" class="input input-mono" type="text" placeholder="100.86.0.1" />
          </FormField>
        </div>
      </FormSection>

      <div class="advanced-stack">
        <FormAccordion v-if="form.type === 'xtcp'" title="XTCP 穿透选项" description="保持隧道与回退策略">
          <template #icon><Zap :size="16" /></template>
          <div class="switch-list">
            <div class="switch-row">
              <div class="switch-copy"><strong>保持隧道</strong><small>定期尝试维持 P2P 通道。</small></div>
              <ToggleSwitch v-model="form.keepTunnelOpen" />
            </div>
          </div>
          <div class="form-grid">
            <FormField label="每小时最大重试" :hint="form.keepTunnelOpen ? '' : '仅保持隧道开启时生效。'">
              <input v-model.number="form.maxRetriesAnHour" class="input input-mono" type="number" min="1" />
            </FormField>
            <FormField label="最小重试间隔（秒）">
              <input v-model.number="form.minRetryInterval" class="input input-mono" type="number" min="1" />
            </FormField>
            <FormField label="回退访问器" hint="P2P 失败时切换到另一个访问器。">
              <input v-model="form.fallbackTo" class="input" type="text" placeholder="stcp-visitor" />
            </FormField>
            <FormField label="回退超时（毫秒）">
              <input v-model.number="form.fallbackTimeoutMs" class="input input-mono" type="number" min="1" />
            </FormField>
          </div>
        </FormAccordion>

        <FormAccordion title="NAT 穿透" description="调整 P2P / 秘密连接的穿透行为">
          <template #icon><Radar :size="16" /></template>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>禁用本地网卡辅助地址</strong>
              <small>仅使用 STUN 发现的公网地址。</small>
            </div>
            <ToggleSwitch v-model="form.natTraversal.disableAssistedAddrs" />
          </div>
        </FormAccordion>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="close">取消</button>
      <div class="footer-spacer" />
      <button type="button" class="btn btn-secondary" @click="save(false)">保存到草稿</button>
      <button type="button" class="btn btn-primary" @click="save(true)">
        <Check :size="15" />
        保存并应用
      </button>
    </template>
  </ModalShell>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Check, Info, Radar, TriangleAlert, Zap } from 'lucide-vue-next';
import CopyButton from '@/components/CopyButton.vue';
import FormAccordion from '@/components/FormAccordion.vue';
import FormField from '@/components/FormField.vue';
import FormSection from '@/components/FormSection.vue';
import ModalShell from '@/components/ModalShell.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import TypeIcon from '@/components/TypeIcon.vue';
import {
  TYPE_META,
  VISITOR_TYPE_CHOICES,
  createVisitor,
  jsonClone,
  visitorEndpoint,
} from '@/frp';

const props = defineProps({
  open: { type: Boolean, default: false },
  visitor: { type: Object, default: null },
  mode: { type: String, default: 'create' },
  existingNames: { type: Array, default: () => [] },
});
const emit = defineEmits(['close', 'save']);

const form = ref(null);
const attempted = ref(false);
const autoName = ref(true);
const formTop = ref(null);

const isNew = computed(() => props.mode === 'create');
const visitorTypeChoices = VISITOR_TYPE_CHOICES;
const currentMeta = computed(() => TYPE_META[form.value?.type] || TYPE_META.stcp);
const pluginEnabled = computed({
  get: () => form.value?.plugin?.type === 'virtual_net',
  set: (enabled) => {
    if (!form.value) return;
    if (enabled) {
      form.value.plugin = { type: 'virtual_net', destinationIP: '' };
      form.value.bindPort = -1;
    } else {
      form.value.plugin = { type: '' };
      if (form.value.bindPort === -1) form.value.bindPort = undefined;
    }
  },
});
const bindLabel = computed(() => (form.value?.plugin?.type === 'virtual_net' ? 'VirtualNet' : visitorEndpoint(form.value || {})));

const errors = computed(() => {
  const result = {};
  if (!form.value) return result;
  const name = String(form.value.name || '').trim();
  if (!name) result.name = '请填写访问器名称';
  else if (props.existingNames.includes(name)) result.name = '该名称已被其他访问器使用';
  else if (!/^[A-Za-z0-9_.-]+$/.test(name)) result.name = '名称只能包含字母、数字、下划线、点和短横线';
  if (!String(form.value.serverName || '').trim()) result.serverName = '请填写目标代理名称';
  if (!String(form.value.secretKey || '').trim()) result.secretKey = '请填写与服务端一致的 secretKey';
  if (!String(form.value.bindAddr || '').trim()) result.bindAddr = '请填写绑定地址';
  const port = Number(form.value.bindPort);
  if (form.value.bindPort === '' || form.value.bindPort === undefined || form.value.bindPort === null) {
    result.bindPort = '请填写绑定端口';
  } else if (!Number.isInteger(port) || port < -1 || port > 65535) {
    result.bindPort = '绑定端口必须在 -1–65535 之间';
  } else if (port === 0) {
    result.bindPort = '绑定端口不能为 0';
  } else if (form.value.type === 'sudp' && port === -1) {
    result.bindPort = 'SUDP 不支持 -1 端口';
  }
  if (form.value.plugin?.type === 'virtual_net' && !String(form.value.plugin.destinationIP || '').trim()) {
    result.destinationIP = '请填写 VirtualNet 目标 IP';
  }
  return result;
});
const errorList = computed(() => Object.values(errors.value).filter(Boolean));

function uniqueName(base) {
  const names = new Set(props.existingNames);
  let index = 1;
  while (names.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function ensureFormShape(visitor) {
  if (!visitor.plugin) visitor.plugin = { type: '' };
  if (!visitor.natTraversal) visitor.natTraversal = { disableAssistedAddrs: false };
  return visitor;
}

function chooseType(type) {
  if (!form.value || form.value.type === type) return;
  form.value.type = type;
  if (type === 'sudp' && form.value.bindPort === -1) form.value.bindPort = undefined;
  if (isNew.value && autoName.value) form.value.name = uniqueName(type);
}

function close() {
  emit('close');
}

async function save(apply) {
  if (!form.value) return;
  attempted.value = true;
  if (errorList.value.length) {
    await nextTick();
    formTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const payload = jsonClone(form.value);
  payload.name = String(payload.name || '').trim();
  payload.bindPort = payload.bindPort === '' || payload.bindPort === null ? undefined : Number(payload.bindPort);
  emit('save', payload, { apply: Boolean(apply) });
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    attempted.value = false;
    autoName.value = props.mode === 'create';
    if (props.visitor) {
      form.value = ensureFormShape(jsonClone(props.visitor));
    } else {
      const visitor = createVisitor('stcp', '');
      visitor.name = uniqueName('stcp');
      form.value = ensureFormShape(visitor);
    }
    nextTick(() => formTop.value?.scrollIntoView({ block: 'start' }));
  },
  { immediate: true },
);
</script>
