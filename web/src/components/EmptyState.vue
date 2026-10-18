<template>
  <div class="empty-state" :class="{ 'is-compact': compact }">
    <div class="empty-icon">
      <slot name="icon">
        <Inbox :size="24" />
      </slot>
    </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <div v-if="$slots.default" class="empty-actions">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { Inbox } from 'lucide-vue-next';

defineProps({
  title: { type: String, default: '暂无内容' },
  description: { type: String, default: '' },
  compact: { type: Boolean, default: false },
});
</script>
