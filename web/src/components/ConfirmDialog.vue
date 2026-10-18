<template>
  <ModalShell
    :open="open"
    :title="title"
    :subtitle="message"
    variant="modal"
    size="sm"
    :persistent="loading"
    :close-on-overlay="!loading"
    @close="$emit('cancel')"
  >
    <div class="confirm-body">
      <div class="confirm-icon" :class="`tone-${tone}`">
        <AlertTriangle :size="22" />
      </div>
      <p v-if="detail" class="confirm-detail">{{ detail }}</p>
      <label v-if="requireText" class="confirm-require">
        <span>请输入 <code>{{ requireText }}</code> 以确认</span>
        <input v-model="typed" class="input" type="text" autocomplete="off" @keyup.enter="confirm" />
      </label>
    </div>
    <template #footer>
      <button type="button" class="btn btn-ghost" :disabled="loading" @click="$emit('cancel')">取消</button>
      <button
        type="button"
        class="btn"
        :class="tone === 'danger' ? 'btn-danger' : 'btn-primary'"
        :disabled="!canConfirm"
        @click="confirm"
      >
        <Loader2 v-if="loading" :size="15" class="spin" />
        <span>{{ confirmLabel }}</span>
      </button>
    </template>
  </ModalShell>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { AlertTriangle, Loader2 } from 'lucide-vue-next';
import ModalShell from './ModalShell.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '此操作无法撤销。' },
  detail: { type: String, default: '' },
  confirmLabel: { type: String, default: '确认' },
  tone: { type: String, default: 'danger' },
  loading: { type: Boolean, default: false },
  requireText: { type: String, default: '' },
});
const emit = defineEmits(['confirm', 'cancel']);
const typed = ref('');

const canConfirm = computed(
  () => !props.loading && (!props.requireText || typed.value === props.requireText),
);

watch(
  () => props.open,
  (open) => {
    if (open) typed.value = '';
  },
);

function confirm() {
  if (!canConfirm.value) return;
  emit('confirm');
}
</script>
