<template>
  <button type="button" class="copy-btn" :class="{ 'is-done': copied, 'is-icon-only': iconOnly }" @click="copy">
    <Check v-if="copied" :size="14" />
    <Copy v-else :size="14" />
    <span v-if="!iconOnly">{{ copied ? '已复制' : label }}</span>
  </button>
</template>

<script setup>
import { ref } from 'vue';
import { Check, Copy } from 'lucide-vue-next';
import { toast } from '@/store';

const props = defineProps({
  text: { type: String, default: '' },
  label: { type: String, default: '复制' },
  iconOnly: { type: Boolean, default: false },
  toastMessage: { type: String, default: '已复制到剪贴板' },
});

const copied = ref(false);

async function copy() {
  const text = String(props.text ?? '');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    copied.value = true;
    toast(props.toastMessage, 'success', 1800);
    setTimeout(() => {
      copied.value = false;
    }, 1600);
  } catch {
    toast('复制失败，请手动选择文本', 'error');
  }
}
</script>
