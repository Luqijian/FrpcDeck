<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <div
          v-for="toastItem in store.toasts"
          :key="toastItem.id"
          class="toast"
          :class="`toast-${toastItem.type}`"
          role="status"
          @click="dismissToast(toastItem.id)"
        >
          <span class="toast-icon">
            <CheckCircle2 v-if="toastItem.type === 'success'" :size="17" />
            <AlertCircle v-else-if="toastItem.type === 'error'" :size="17" />
            <Info v-else :size="17" />
          </span>
          <span class="toast-message">{{ toastItem.message }}</span>
          <button type="button" class="toast-close" aria-label="关闭提示" @click.stop="dismissToast(toastItem.id)">
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-vue-next';
import { dismissToast, store } from '@/store';
</script>
