<template>
  <div class="code-block">
    <div v-if="filename || label" class="code-head">
      <span class="code-dots" aria-hidden="true"><i /><i /><i /></span>
      <span class="code-filename">{{ filename || label }}</span>
      <div class="code-actions">
        <slot name="actions" />
        <CopyButton :text="code" label="复制" />
      </div>
    </div>
    <pre class="code-pre" :style="{ maxHeight: maxHeight }"><code><span
      v-for="(line, index) in lines"
      :key="index"
      class="code-line"
    ><span class="code-line-number" aria-hidden="true">{{ index + 1 }}</span><span class="code-line-text">{{ line || ' ' }}</span></span></code></pre>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import CopyButton from './CopyButton.vue';

const props = defineProps({
  code: { type: String, default: '' },
  filename: { type: String, default: '' },
  label: { type: String, default: 'TOML' },
  maxHeight: { type: String, default: '58vh' },
});

const lines = computed(() => String(props.code || '').split('\n'));
</script>
