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
        <span class="login-version">v{{ store.app.version || '2.1.1' }}</span>
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
          <span class="login-kicker">安全登录</span>
          <h2>欢迎回来</h2>
          <p>登录以管理你的 frpc 隧道与运行状态。首次启动的随机密码请从容器日志获取。</p>
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
                autocomplete="current-password"
                placeholder="输入密码"
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

          <Transition name="fade">
            <div v-if="error" class="login-error" role="alert">
              <AlertCircle :size="16" />
              <span>{{ error }}</span>
            </div>
          </Transition>

          <button type="submit" class="btn btn-primary login-submit" :disabled="submitting">
            <Loader2 v-if="submitting" :size="17" class="spin" />
            <template v-else>
              <span>登录控制台</span>
              <ArrowRight :size="17" />
            </template>
            <span v-if="submitting">请稍候…</span>
          </button>
        </form>

        <div class="login-note">
          <KeyRound :size="15" />
          <span>首次启动密码可通过 <code>docker compose logs frpcdeck</code> 获取，登录后必须修改。</span>
        </div>
        <div class="login-note">
          <ShieldCheck :size="15" />
          <span>密码使用 scrypt 加盐哈希保存；会话仅通过 HttpOnly Cookie 传递。</span>
        </div>

        <div class="login-card-foot">
          <span>FrpcDeck {{ store.app.version || '2.1.1' }}</span>
          <span>frpc {{ store.frpc.version || '0.71.1' }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue';
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
import { login, store, toggleTheme } from '@/store';

const router = useRouter();
const route = useRoute();

const username = ref(store.auth.username || 'admin');
const password = ref('');
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
  submitting.value = true;
  try {
    await login(username.value.trim(), password.value);
    if (store.auth.mustChangePassword) {
      await router.replace({ name: 'change-password' });
      return;
    }
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
