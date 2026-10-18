<template>
  <div class="login-page force-change-page">
    <div class="login-grid" aria-hidden="true" />
    <div class="login-glow login-glow-a" aria-hidden="true" />
    <div class="login-glow login-glow-b" aria-hidden="true" />

    <section class="login-panel force-change-panel">
      <div class="login-card force-change-card">
        <div class="login-mobile-brand">
          <BrandMark :size="38" />
          <div>
            <strong>FrpcDeck</strong>
            <small>首次登录安全设置</small>
          </div>
        </div>

        <header class="login-card-head">
          <span class="login-kicker">必须修改密码</span>
          <h2>设置新的管理员凭据</h2>
          <p>初始密码只用于首次登录。修改完成后，旧密码和当前会话都会失效。</p>
        </header>

        <div class="force-change-note">
          <KeyRound :size="16" />
          <span>初始密码可以在容器日志中找到：<code>docker compose logs frpcdeck</code></span>
        </div>

        <form class="login-form" @submit.prevent="submit">
          <div class="field">
            <label class="field-label" for="change-current">当前密码（初始密码）</label>
            <input id="change-current" v-model="form.current" class="input" type="password" autocomplete="current-password" :disabled="submitting" />
          </div>
          <div class="field">
            <label class="field-label" for="change-username">用户名</label>
            <input id="change-username" v-model="form.username" class="input" type="text" autocomplete="username" :disabled="submitting" />
          </div>
          <div class="field">
            <label class="field-label" for="change-password">新密码</label>
            <input id="change-password" v-model="form.password" class="input" type="password" autocomplete="new-password" placeholder="至少 8 个字符" :disabled="submitting" />
          </div>
          <div class="field">
            <label class="field-label" for="change-confirm">确认新密码</label>
            <input id="change-confirm" v-model="form.confirm" class="input" type="password" autocomplete="new-password" :disabled="submitting" />
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
              <span>保存并进入控制台</span>
              <ArrowRight :size="17" />
            </template>
            <span v-if="submitting">保存中…</span>
          </button>
        </form>

        <div class="force-change-foot">
          <button type="button" class="btn btn-ghost btn-sm" @click="logout">
            <LogOut :size="14" />
            退出登录
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { AlertCircle, ArrowRight, KeyRound, Loader2, LogOut } from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';
import { changeCredentials, logout as clearSession, store, toast } from '@/store';

const router = useRouter();
const form = reactive({
  current: '',
  username: store.auth.username || 'admin',
  password: '',
  confirm: '',
});
const submitting = ref(false);
const error = ref('');

async function submit() {
  if (submitting.value) return;
  error.value = '';
  if (!form.current) {
    error.value = '请输入当前密码';
    return;
  }
  if (!form.username.trim()) {
    error.value = '请输入用户名';
    return;
  }
  if (!form.password || form.password.length < 8) {
    error.value = '新密码至少需要 8 个字符';
    return;
  }
  if (form.password !== form.confirm) {
    error.value = '两次输入的新密码不一致';
    return;
  }
  submitting.value = true;
  try {
    await changeCredentials({
      currentPassword: form.current,
      username: form.username.trim(),
      password: form.password,
    });
    toast('管理员凭据已更新', 'success');
    await router.replace({ name: 'dashboard' });
  } catch (submitError) {
    error.value = submitError.message || '修改失败';
  } finally {
    submitting.value = false;
  }
}

async function logout() {
  await clearSession();
  await router.replace({ name: 'login' });
}
</script>
