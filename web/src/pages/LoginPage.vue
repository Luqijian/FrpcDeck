<template>
  <div class="login-page">
    <div class="login-grid" aria-hidden="true" />
    <div class="login-glow login-glow-a" aria-hidden="true" />
    <div class="login-glow login-glow-b" aria-hidden="true" />

    <button
      type="button"
      class="icon-btn login-theme"
      :aria-label="store.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
      @click="toggleTheme"
    >
      <Sun v-if="store.theme === 'dark'" :size="18" />
      <Moon v-else :size="18" />
    </button>

    <section class="login-brand">
      <div class="login-brand-top">
        <BrandMark :size="42" />
        <div class="login-brand-name">
          <span>FrpcDeck</span>
          <small>frpc control surface</small>
        </div>
        <span class="login-version">v{{ store.app.version || '1.0.0' }}</span>
      </div>

      <div class="login-hero">
        <p class="login-eyebrow"><span class="eyebrow-dot" /> 内网穿透 · 可视化管理</p>
        <h1>让 frpc 配置<br /><span class="gradient-text">像搭积木一样简单。</span></h1>
        <p class="login-lede">
          在手机或电脑上完成全部 frpc 配置，实时掌握隧道状态与日志。
          一个镜像，同时运行面板和 frpc。
        </p>

        <div class="login-tunnel" aria-hidden="true">
          <div class="tunnel-node">
            <span class="tunnel-node-icon"><Globe2 :size="18" /></span>
            <span class="tunnel-node-copy"><strong>公网访问者</strong><small>https://demo.example.com</small></span>
            <span class="tunnel-node-status tone-success"><i /> 200</span>
          </div>
          <div class="tunnel-path">
            <span class="tunnel-pulse" />
            <span class="tunnel-label">TLS · 加密隧道</span>
          </div>
          <div class="tunnel-node tunnel-node-accent">
            <span class="tunnel-node-icon"><Server :size="18" /></span>
            <span class="tunnel-node-copy"><strong>frps 中转</strong><small>relay.example.com:7000</small></span>
            <span class="tunnel-node-status tone-live"><i /> LIVE</span>
          </div>
          <div class="tunnel-path tunnel-path-short">
            <span class="tunnel-pulse tunnel-pulse-delay" />
          </div>
          <div class="tunnel-node">
            <span class="tunnel-node-icon"><Laptop :size="18" /></span>
            <span class="tunnel-node-copy"><strong>内网服务</strong><small>127.0.0.1:8080</small></span>
            <span class="tunnel-node-status tone-muted"><i /> local</span>
          </div>
        </div>

        <ul class="login-features">
          <li v-for="feature in features" :key="feature.title">
            <span class="login-feature-icon"><component :is="feature.icon" :size="17" /></span>
            <span><strong>{{ feature.title }}</strong><small>{{ feature.desc }}</small></span>
          </li>
        </ul>
      </div>

      <footer class="login-brand-footer">
        <span>FrpcDeck · 开放、轻量、为 frp 而生</span>
        <span>frpc {{ store.frpc.version || '0.71.1' }}</span>
      </footer>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-mobile-brand">
          <BrandMark :size="38" />
          <div>
            <strong>FrpcDeck</strong>
            <small>frpc 控制台</small>
          </div>
        </div>

        <header class="login-card-head">
          <span class="login-kicker">{{ isSetup ? '首次启动' : '安全登录' }}</span>
          <h2>{{ isSetup ? '创建管理员账户' : '欢迎回来' }}</h2>
          <p v-if="isSetup">设置面板账户后即可开始配置 frpc。所有数据只保存在你的服务器上。</p>
          <p v-else>
            {{ store.auth.envManaged ? '使用环境变量中配置的账户登录。' : '登录以管理你的 frpc 隧道与运行状态。' }}
          </p>
        </header>

        <form class="login-form" @submit.prevent="submit">
          <div class="field">
            <label class="field-label" for="login-username">用户名</label>
            <div class="input-wrap">
              <UserRound :size="16" class="input-icon" />
              <input
                id="login-username"
                v-model="username"
                class="input input-with-icon"
                type="text"
                autocomplete="username"
                placeholder="admin"
                :disabled="submitting"
              />
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="login-password">密码</label>
            <div class="input-wrap">
              <LockKeyhole :size="16" class="input-icon" />
              <input
                id="login-password"
                v-model="password"
                class="input input-with-icon input-with-action"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="isSetup ? 'new-password' : 'current-password'"
                :placeholder="isSetup ? '至少 8 个字符' : '输入密码'"
                :disabled="submitting"
              />
              <button
                type="button"
                class="input-action"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </div>

          <div v-if="isSetup" class="field">
            <label class="field-label" for="login-confirm">确认密码</label>
            <div class="input-wrap">
              <ShieldCheck :size="16" class="input-icon" />
              <input
                id="login-confirm"
                v-model="confirmPassword"
                class="input input-with-icon"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="再次输入密码"
                :disabled="submitting"
                @keyup.enter="submit"
              />
            </div>
          </div>

          <Transition name="fade">
            <div v-if="error" class="login-error" role="alert">
              <AlertCircle :size="16" />
              <span>{{ error }}</span>
            </div>
          </Transition>

          <button type="submit" class="btn btn-primary login-submit" :disabled="submitting">
            <Loader2 v-if="submitting" :size="17" class="spin" />
            <template v-else>
              <span>{{ isSetup ? '创建并进入控制台' : '登录控制台' }}</span>
              <ArrowRight :size="17" />
            </template>
            <span v-if="submitting">请稍候…</span>
          </button>
        </form>

        <div v-if="store.auth.envManaged" class="login-note">
          <KeyRound :size="15" />
          <span>密码由 <code>FRPC_WEBUI_PASSWORD</code> 环境变量管理，可在容器设置中修改。</span>
        </div>
        <div v-else-if="isSetup" class="login-note">
          <ShieldCheck :size="15" />
          <span>密码使用 scrypt 加盐哈希保存，面板不会存储明文。</span>
        </div>
        <div v-else class="login-note">
          <ShieldCheck :size="15" />
          <span>会话仅通过 HttpOnly Cookie 传递，7 天后自动失效。</span>
        </div>

        <div class="login-card-foot">
          <span>FrpcDeck {{ store.app.version || '1.0.0' }}</span>
          <span>frpc {{ store.frpc.version || '0.71.1' }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Laptop,
  Loader2,
  LockKeyhole,
  Moon,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sun,
  UserRound,
} from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';
import { login, setup, store, toggleTheme } from '@/store';

const router = useRouter();
const route = useRoute();

const isSetup = computed(() => !store.auth.initialized);
const username = ref(isSetup.value ? 'admin' : store.auth.username || 'admin');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const error = ref('');

const features = [
  { title: '全量配置', desc: '代理、访问器、插件与健康检查', icon: SlidersHorizontal },
  { title: '实时可视', desc: '隧道状态与日志流一览无余', icon: Boxes },
  { title: '移动优先', desc: '手机上也能轻松完成配置', icon: Smartphone },
];

async function submit() {
  if (submitting.value) return;
  error.value = '';
  if (!username.value.trim()) {
    error.value = '请输入用户名';
    return;
  }
  if (!password.value) {
    error.value = '请输入密码';
    return;
  }
  if (isSetup.value) {
    if (password.value.length < 8) {
      error.value = '密码至少需要 8 个字符';
      return;
    }
    if (password.value !== confirmPassword.value) {
      error.value = '两次输入的密码不一致';
      return;
    }
  }
  submitting.value = true;
  try {
    if (isSetup.value) await setup(username.value.trim(), password.value);
    else await login(username.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : '/';
    await router.replace(redirect);
  } catch (submitError) {
    error.value = submitError.message || '登录失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
</script>
