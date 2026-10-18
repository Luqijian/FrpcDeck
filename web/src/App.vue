<template>
  <RouterView />
  <ToastHost />
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import ToastHost from '@/components/ToastHost.vue';
import { handleUnauthorized, store } from '@/store';

const router = useRouter();

function onExpired() {
  handleUnauthorized();
  const current = router.currentRoute.value;
  if (current.name !== 'login') {
    router.replace({ name: 'login', query: { redirect: current.fullPath } });
  }
}

onMounted(() => {
  window.addEventListener('frpcdeck:unauthorized', onExpired);
  document.documentElement.dataset.theme = store.theme;
});

onBeforeUnmount(() => {
  window.removeEventListener('frpcdeck:unauthorized', onExpired);
});
</script>
