<template>
  <span class="status-dot" :class="[`tone-${tone}`, { 'is-pulsing': pulse }]" />
</template>

<script setup>
defineProps({
  tone: { type: String, default: 'muted' },
  pulse: { type: Boolean, default: false },
});
</script>
