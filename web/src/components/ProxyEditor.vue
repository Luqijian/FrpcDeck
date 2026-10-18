<template>
  <ModalShell
    :open="open"
    :title="isNew ? '新建代理' : '编辑代理'"
    :subtitle="isNew ? '选择类型并填写内网服务信息，保存到草稿后应用。' : `正在编辑 ${form?.name || ''}`"
    eyebrow="代理配置"
    variant="drawer"
    size="xl"
    @close="close"
  >
    <div v-if="form" ref="formTop" class="proxy-editor">
      <div class="editor-summary">
        <span class="editor-summary-icon" :style="{ '--type-color': currentMeta.color }">
          <TypeIcon :type="form.type" :size="20" />
        </span>
        <div class="editor-summary-copy">
          <strong>{{ form.name || '未命名代理' }}</strong>
          <span>{{ summary }}</span>
        </div>
        <span class="editor-summary-state" :class="{ 'is-off': !form.enabled }">
          {{ form.enabled ? '已启用' : '已停用' }}
        </span>
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
            <h3>代理类型</h3>
            <p>根据要暴露的服务选择协议，稍后仍可修改。</p>
          </div>
        </div>
        <div class="type-grid">
          <button
            v-for="choice in typeChoices"
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

      <FormSection title="基础信息" description="代理名称在 frpc 内必须唯一。">
        <div class="form-grid">
          <FormField
            label="代理名称"
            required
            :error="attempted ? errors.name : ''"
            hint="建议使用英文、数字与短横线，例如 nas-web。"
          >
            <input v-model="form.name" class="input" type="text" placeholder="my-service" @input="autoName = false" />
          </FormField>
          <FormField label="启用状态" hint="停用后 frpc 不会加载此代理。">
            <div class="inline-switch-row">
              <ToggleSwitch v-model="form.enabled" :label="form.enabled ? '已启用' : '已停用'" />
            </div>
          </FormField>
        </div>
      </FormSection>

      <FormSection
        v-if="!pluginEnabled"
        title="本地服务"
        description="frpc 将连接这个内网地址，并把流量转发出去。"
      >
        <div class="preset-row">
          <button
            v-for="preset in localPresets"
            :key="preset.label"
            type="button"
            class="preset-chip"
            :class="{ 'is-active': Number(form.localPort) === preset.port }"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}
            <span>{{ preset.port }}</span>
          </button>
        </div>
        <div class="form-grid">
          <FormField label="本地地址" required :error="attempted ? errors.localIP : ''">
            <input v-model="form.localIP" class="input input-mono" type="text" placeholder="127.0.0.1" />
          </FormField>
          <FormField label="本地端口" required :error="attempted ? errors.localPort : ''">
            <input v-model.number="form.localPort" class="input input-mono" type="number" min="1" max="65535" placeholder="8080" />
          </FormField>
          <FormField
            v-if="['tcp', 'udp'].includes(form.type)"
            label="远程端口"
            required
            :error="attempted ? errors.remotePort : ''"
            hint="frps 上暴露的端口，填 0 表示随机分配。"
          >
            <input v-model.number="form.remotePort" class="input input-mono" type="number" min="0" max="65535" placeholder="6001" />
          </FormField>
        </div>
        <p v-if="['tcp', 'udp'].includes(form.type)" class="form-note">
          <Info :size="14" />
          确保 frps 所在服务器的防火墙与云安全组已放行远程端口。
        </p>
      </FormSection>

      <FormSection
        v-else
        title="远程入口"
        description="使用插件时，本地服务由插件处理，无需填写本地端口。"
      >
        <FormField
          v-if="['tcp', 'udp'].includes(form.type)"
          label="远程端口"
          required
          :error="attempted ? errors.remotePort : ''"
          hint="frps 上暴露的端口，填 0 表示随机分配。"
        >
          <input v-model.number="form.remotePort" class="input input-mono" type="number" min="0" max="65535" placeholder="6001" />
        </FormField>
        <p v-else class="form-note">
          <Info :size="14" />
          该类型通过域名访问，无需填写远程端口。
        </p>
      </FormSection>

      <FormSection v-if="isHttpLike" title="访问入口" description="域名需要解析到 frps 服务器地址。">
        <div class="form-grid">
          <FormField
            v-if="form.type !== 'tcpmux'"
            label="自定义域名"
            required
            :error="attempted ? errors.domains : ''"
            hint="可添加多个，frps 将按 Host 匹配并转发。"
            wide
          >
            <TagInput v-model="form.customDomains" placeholder="例如 app.example.com，回车添加" />
          </FormField>
          <FormField
            v-if="form.type !== 'tcpmux'"
            label="子域名"
            hint="需 frps 配置了 subdomainHost。"
          >
            <input v-model="form.subdomain" class="input" type="text" placeholder="myapp" />
          </FormField>
          <FormField
            v-if="form.type === 'tcpmux'"
            label="域名"
            required
            :error="attempted ? errors.domains : ''"
            wide
          >
            <TagInput v-model="form.customDomains" placeholder="例如 tunnel.example.com" />
          </FormField>
          <FormField v-if="form.type === 'tcpmux'" label="多路复用器">
            <select v-model="form.multiplexer" class="input select">
              <option value="httpconnect">httpconnect</option>
            </select>
          </FormField>
          <FormField v-if="form.type === 'http'" label="路径前缀" hint="留空表示匹配所有路径。" wide>
            <TagInput v-model="form.locations" placeholder="例如 /、/api" />
          </FormField>
          <FormField v-if="form.type === 'https'" label="Host 重写" hint="转发时替换 Host 请求头。">
            <input v-model="form.hostHeaderRewrite" class="input" type="text" placeholder="127.0.0.1" />
          </FormField>
          <FormField v-if="form.type === 'http'" label="按用户路由" hint="匹配 HTTP Basic Auth 用户名。">
            <input v-model="form.routeByHTTPUser" class="input" type="text" placeholder="可留空" />
          </FormField>
          <FormField label="HTTP 用户名" hint="为访问入口添加 Basic Auth。">
            <input v-model="form.httpUser" class="input" type="text" autocomplete="off" placeholder="可留空" />
          </FormField>
          <FormField label="HTTP 密码">
            <input v-model="form.httpPassword" class="input" type="password" autocomplete="new-password" placeholder="可留空" />
          </FormField>
        </div>
      </FormSection>

      <FormSection
        v-if="['stcp', 'sudp', 'xtcp'].includes(form.type)"
        title="秘密连接"
        description="只有持有相同 secretKey 的访问器才能连接。"
      >
        <div class="form-grid">
          <FormField label="Secret Key" required :error="attempted ? errors.secretKey : ''" wide>
            <div class="input-button-group">
              <input v-model="form.secretKey" class="input input-mono" type="text" placeholder="输入或生成一个强密钥" />
              <button type="button" class="btn btn-secondary" @click="form.secretKey = makeSecret()">
                <RefreshCw :size="14" />
                生成
              </button>
              <CopyButton :text="form.secretKey" icon-only />
            </div>
          </FormField>
          <FormField label="允许的访问者" hint="留空表示仅同一 user 的访问器；* 表示允许所有用户。" wide>
            <TagInput v-model="form.allowUsers" placeholder="user1, user2 或 *" />
          </FormField>
        </div>
        <p class="form-note">
          <Info :size="14" />
          访问器需要在另一台 frpc（或本面板的“访问器”页面）中填写相同的 serverName 与 secretKey。
        </p>
      </FormSection>

      <FormSection
        title="插件"
        description="由 frpc 直接处理连接，适用于代理、静态文件、TLS 转换等场景。"
      >
        <div class="switch-row">
          <div class="switch-copy">
            <strong>使用插件处理连接</strong>
            <small>启用后将忽略本地地址与端口，改用插件配置。</small>
          </div>
          <ToggleSwitch v-model="pluginEnabled" />
        </div>
        <div v-if="pluginEnabled" class="plugin-panel">
          <div class="form-grid">
            <FormField label="插件类型" wide>
              <select :value="form.plugin.type" class="input select" @change="setPluginType($event.target.value)">
                <option v-for="plugin in pluginChoices" :key="plugin.value" :value="plugin.value">
                  {{ plugin.label }} — {{ plugin.description }}
                </option>
              </select>
            </FormField>
            <FormField
              v-for="field in pluginFields"
              :key="field.key"
              :label="field.label"
              :error="attempted ? errors[`plugin.${field.key}`] : ''"
            >
              <input
                v-model="form.plugin[field.key]"
                class="input"
                :type="field.type || 'text'"
                :placeholder="field.placeholder || ''"
              />
            </FormField>
          </div>
          <FormField
            v-if="pluginHasHeaders"
            label="请求头"
            hint="转发请求时附加的 Header。"
            wide
          >
            <KeyValueEditor v-model="form.plugin.requestHeaders.set" key-placeholder="Header" value-placeholder="值" />
          </FormField>
          <p class="form-note">
            <Info :size="14" />
            插件路径相对于 frpc 的工作目录（数据目录），请确认容器内可访问。
          </p>
        </div>
      </FormSection>

      <div class="advanced-stack">
        <FormAccordion title="传输与限速" description="带宽限制、加密、压缩与 Proxy Protocol">
          <template #icon><Gauge :size="16" /></template>
          <div class="form-grid">
            <FormField label="带宽限制" hint="例如 1MB、500KB；留空表示不限速。" :error="attempted ? errors.bandwidth : ''">
              <input v-model="form.transport.bandwidthLimit" class="input input-mono" type="text" placeholder="1MB" />
            </FormField>
            <FormField label="限速位置">
              <SegmentedControl v-model="form.transport.bandwidthLimitMode" :options="bandwidthModes" />
            </FormField>
          </div>
          <div class="switch-list">
            <div class="switch-row">
              <div class="switch-copy"><strong>流量加密</strong><small>在 frpc 与 frps 之间加密代理流量。</small></div>
              <ToggleSwitch v-model="form.transport.useEncryption" />
            </div>
            <div class="switch-row">
              <div class="switch-copy"><strong>流量压缩</strong><small>适合文本类流量，可能增加 CPU 占用。</small></div>
              <ToggleSwitch v-model="form.transport.useCompression" />
            </div>
          </div>
          <div class="form-grid">
            <FormField label="Proxy Protocol" hint="将真实客户端 IP 传递给本地服务。">
              <select v-model="form.transport.proxyProtocolVersion" class="input select">
                <option value="">不启用</option>
                <option value="v1">v1</option>
                <option value="v2">v2</option>
              </select>
            </FormField>
          </div>
        </FormAccordion>

        <FormAccordion title="健康检查" description="frpc 检测本地服务是否存活">
          <template #icon><HeartPulse :size="16" /></template>
          <div class="form-grid">
            <FormField label="检查类型">
              <SegmentedControl v-model="form.healthCheck.type" :options="healthTypes" />
            </FormField>
            <FormField v-if="form.healthCheck.type === 'http'" label="检查路径" :error="attempted ? errors.healthPath : ''">
              <input v-model="form.healthCheck.path" class="input input-mono" type="text" placeholder="/health" />
            </FormField>
            <FormField label="间隔（秒）">
              <input v-model.number="form.healthCheck.intervalSeconds" class="input input-mono" type="number" min="1" />
            </FormField>
            <FormField label="超时（秒）">
              <input v-model.number="form.healthCheck.timeoutSeconds" class="input input-mono" type="number" min="1" />
            </FormField>
            <FormField label="最大失败次数">
              <input v-model.number="form.healthCheck.maxFailed" class="input input-mono" type="number" min="1" />
            </FormField>
            <FormField v-if="form.healthCheck.type === 'http'" label="检查请求头" wide>
              <KeyValueEditor v-model="healthHeaders" key-placeholder="Header" value-placeholder="值" add-label="添加请求头" />
            </FormField>
          </div>
        </FormAccordion>

        <FormAccordion title="负载均衡" description="同组代理由 frps 分发连接">
          <template #icon><Scale :size="16" /></template>
          <div class="form-grid">
            <FormField label="分组名称" hint="多个代理使用相同分组名与密钥即可负载均衡。">
              <input v-model="form.loadBalancer.group" class="input" type="text" placeholder="my-group" />
            </FormField>
            <FormField label="分组密钥">
              <input v-model="form.loadBalancer.groupKey" class="input input-mono" type="text" placeholder="group-secret" />
            </FormField>
          </div>
        </FormAccordion>

        <FormAccordion
          v-if="isHttpLike"
          title="请求 / 响应头"
          description="转发时改写 HTTP Header"
        >
          <template #icon><ListTree :size="16" /></template>
          <div class="stack-gap">
            <FormField label="请求头">
              <KeyValueEditor v-model="form.requestHeaders.set" key-placeholder="Header" value-placeholder="值" add-label="添加请求头" />
            </FormField>
            <FormField label="响应头">
              <KeyValueEditor v-model="form.responseHeaders.set" key-placeholder="Header" value-placeholder="值" add-label="添加响应头" />
            </FormField>
          </div>
        </FormAccordion>

        <FormAccordion title="元数据与注解" description="传递给服务端插件或显示在 frps 面板">
          <template #icon><Tags :size="16" /></template>
          <div class="stack-gap">
            <FormField label="元数据（metadatas）">
              <KeyValueEditor v-model="form.metadatas" key-placeholder="键" value-placeholder="值" />
            </FormField>
            <FormField label="注解（annotations）">
              <KeyValueEditor v-model="form.annotations" key-placeholder="键（可带前缀）" value-placeholder="值" />
            </FormField>
          </div>
        </FormAccordion>

        <FormAccordion
          v-if="['stcp', 'sudp', 'xtcp'].includes(form.type)"
          title="NAT 穿透"
          description="调整 P2P / 秘密连接的穿透行为"
        >
          <template #icon><Radar :size="16" /></template>
          <div class="switch-row">
            <div class="switch-copy">
              <strong>禁用本地网卡辅助地址</strong>
              <small>仅使用 STUN 发现的公网地址，适合慢速 VPN 环境。</small>
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
import {
  Check,
  Gauge,
  HeartPulse,
  Info,
  ListTree,
  Radar,
  RefreshCw,
  Scale,
  Tags,
  TriangleAlert,
} from 'lucide-vue-next';
import CopyButton from '@/components/CopyButton.vue';
import FormAccordion from '@/components/FormAccordion.vue';
import FormField from '@/components/FormField.vue';
import FormSection from '@/components/FormSection.vue';
import KeyValueEditor from '@/components/KeyValueEditor.vue';
import ModalShell from '@/components/ModalShell.vue';
import SegmentedControl from '@/components/SegmentedControl.vue';
import TagInput from '@/components/TagInput.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import TypeIcon from '@/components/TypeIcon.vue';
import {
  LOCAL_PRESETS,
  PLUGIN_FIELDS,
  PLUGIN_META,
  TYPE_CHOICES,
  TYPE_META,
  createProxy,
  jsonClone,
  makeSecret,
  pluginDefaults,
  proxyEndpoint,
  proxyLocal,
} from '@/frp';
import { PLUGIN_REQUIRED_FIELDS, PROXY_PLUGIN_TYPES } from '@shared/constants.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  proxy: { type: Object, default: null },
  mode: { type: String, default: 'create' },
  existingNames: { type: Array, default: () => [] },
});
const emit = defineEmits(['close', 'save']);

const form = ref(null);
const attempted = ref(false);
const autoName = ref(true);
const formTop = ref(null);

const isNew = computed(() => props.mode === 'create');
const currentMeta = computed(() => TYPE_META[form.value?.type] || TYPE_META.tcp);
const typeChoices = TYPE_CHOICES;
const localPresets = LOCAL_PRESETS;
const bandwidthModes = [
  { value: 'client', label: '客户端' },
  { value: 'server', label: '服务端' },
];
const healthTypes = [
  { value: '', label: '关闭' },
  { value: 'tcp', label: 'TCP' },
  { value: 'http', label: 'HTTP' },
];
const pluginChoices = PROXY_PLUGIN_TYPES.map((value) => ({ value, ...PLUGIN_META[value] }));
const isHttpLike = computed(() => ['http', 'https', 'tcpmux'].includes(form.value?.type));

const pluginEnabled = computed({
  get: () => Boolean(form.value?.plugin?.type),
  set: (enabled) => {
    if (!form.value) return;
    if (enabled) {
      const type = form.value.plugin?.type || 'unix_domain_socket';
      form.value.plugin = pluginDefaults(type);
    } else {
      form.value.plugin = { type: '' };
    }
  },
});

const pluginFields = computed(() => {
  const type = form.value?.plugin?.type;
  return (PLUGIN_FIELDS[type] || []).map((field) => ({ ...field, value: form.value?.plugin?.[field.key] }));
});

const pluginHasHeaders = computed(() =>
  ['https2http', 'https2https', 'http2https', 'http2http'].includes(form.value?.plugin?.type),
);

const healthHeaders = computed({
  get: () => Object.fromEntries((form.value?.healthCheck?.httpHeaders || []).map(({ name, value }) => [name, value])),
  set: (object) => {
    if (!form.value) return;
    form.value.healthCheck.httpHeaders = Object.entries(object).map(([name, value]) => ({ name, value }));
  },
});

const summary = computed(() => {
  if (!form.value) return '';
  const local = pluginEnabled.value ? `插件 ${PLUGIN_META[form.value.plugin.type]?.label || ''}` : proxyLocal(form.value);
  const endpoint = proxyEndpoint(form.value, 'frps');
  return `${currentMeta.value.label} · ${local} → ${endpoint}`;
});

const errors = computed(() => {
  const result = {};
  if (!form.value) return result;
  const name = String(form.value.name || '').trim();
  if (!name) result.name = '请填写代理名称';
  else if (props.existingNames.includes(name)) result.name = '该名称已被其他代理使用';
  else if (!/^[A-Za-z0-9_.-]+$/.test(name)) result.name = '名称只能包含字母、数字、下划线、点和短横线';

  if (!form.value.plugin?.type) {
    if (!String(form.value.localIP || '').trim()) result.localIP = '请填写本地地址';
    const port = Number(form.value.localPort);
    if (!form.value.localPort && form.value.localPort !== 0) result.localPort = '请填写本地端口';
    else if (!Number.isInteger(port) || port < 1 || port > 65535) result.localPort = '端口必须在 1–65535 之间';
  } else {
    for (const field of PLUGIN_REQUIRED_FIELDS[form.value.plugin.type] || []) {
      if (!String(form.value.plugin[field] || '').trim()) {
        result[`plugin.${field}`] = '此项不能为空';
      }
    }
  }

  if (['tcp', 'udp'].includes(form.value.type)) {
    if (form.value.remotePort === '' || form.value.remotePort === undefined || form.value.remotePort === null) {
      result.remotePort = '请填写远程端口（可为 0）';
    } else if (!Number.isInteger(Number(form.value.remotePort)) || Number(form.value.remotePort) < 0 || Number(form.value.remotePort) > 65535) {
      result.remotePort = '远程端口必须在 0–65535 之间';
    }
  }

  if (['http', 'https', 'tcpmux'].includes(form.value.type)) {
    if (!(form.value.customDomains || []).length && !form.value.subdomain) {
      result.domains = '请至少填写一个域名或子域名';
    }
  }

  if (['stcp', 'sudp', 'xtcp'].includes(form.value.type) && !form.value.secretKey) {
    result.secretKey = '建议填写 secretKey';
  }

  if (form.value.healthCheck?.type === 'http' && !form.value.healthCheck.path) {
    result.healthPath = 'HTTP 健康检查需要填写路径';
  }
  if (form.value.transport?.bandwidthLimit && !/^\d+(\.\d+)?\s?(KB|MB|GB)?$/i.test(form.value.transport.bandwidthLimit)) {
    result.bandwidth = '格式示例：1MB 或 500KB';
  }
  return result;
});

const errorList = computed(() => Object.values(errors.value).filter(Boolean));

function ensureFormShape(proxy) {
  if (!proxy.healthCheck) proxy.healthCheck = { type: '', path: '', httpHeaders: [], intervalSeconds: 10, maxFailed: 3, timeoutSeconds: 3 };
  if (!proxy.transport) proxy.transport = { bandwidthLimit: '', bandwidthLimitMode: 'client', useEncryption: false, useCompression: false, proxyProtocolVersion: '' };
  if (!proxy.loadBalancer) proxy.loadBalancer = { group: '', groupKey: '' };
  if (!proxy.metadatas) proxy.metadatas = {};
  if (!proxy.annotations) proxy.annotations = {};
  if (!proxy.natTraversal) proxy.natTraversal = { disableAssistedAddrs: false };
  if (!proxy.requestHeaders) proxy.requestHeaders = { set: {} };
  if (!proxy.requestHeaders.set) proxy.requestHeaders.set = {};
  if (!proxy.responseHeaders) proxy.responseHeaders = { set: {} };
  if (!proxy.responseHeaders.set) proxy.responseHeaders.set = {};
  if (!proxy.plugin) proxy.plugin = { type: '' };
  if (['https2http', 'https2https', 'http2https', 'http2http'].includes(proxy.plugin.type)) {
    if (!proxy.plugin.requestHeaders) proxy.plugin.requestHeaders = { set: {} };
    if (!proxy.plugin.requestHeaders.set) proxy.plugin.requestHeaders.set = {};
  }
  return proxy;
}

function uniqueName(base) {
  const names = new Set(props.existingNames);
  let index = 1;
  while (names.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function setPluginType(value) {
  form.value.plugin = pluginDefaults(value);
}

function applyPreset(preset) {
  form.value.localIP = '127.0.0.1';
  form.value.localPort = preset.port;
}

function chooseType(type) {
  if (!form.value || form.value.type === type) return;
  form.value.type = type;
  if (type === 'tcpmux' && !form.value.multiplexer) form.value.multiplexer = 'httpconnect';
  if (isNew.value && autoName.value) form.value.name = uniqueName(type);
}

function toPort(value) {
  if (value === '' || value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
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
  payload.localPort = toPort(payload.localPort);
  payload.remotePort = toPort(payload.remotePort);
  payload.healthCheck.intervalSeconds = toPort(payload.healthCheck.intervalSeconds);
  payload.healthCheck.timeoutSeconds = toPort(payload.healthCheck.timeoutSeconds);
  payload.healthCheck.maxFailed = toPort(payload.healthCheck.maxFailed);
  if (!payload.plugin?.type) payload.plugin = { type: '' };
  emit('save', payload, { apply: Boolean(apply) });
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    attempted.value = false;
    autoName.value = props.mode === 'create';
    if (props.proxy) {
      form.value = ensureFormShape(jsonClone(props.proxy));
    } else {
      const proxy = createProxy('tcp', '');
      proxy.name = uniqueName('tcp');
      form.value = ensureFormShape(proxy);
    }
    nextTick(() => {
      formTop.value?.scrollIntoView({ block: 'start' });
    });
  },
  { immediate: true },
);
</script>
