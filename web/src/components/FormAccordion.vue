<template>
  <div class="form-accordion" :class="{ 'is-open': open }">
    <button type="button" class="accordion-head" :aria-expanded="open" @click="open = !open">
      <span class="accordion-icon"><slot name="icon" /></span>
      <span class="accordion-headings">
        <span class="accordion-title">
          {{ title }}
          <span v-if="badge" class="accordion-badge">{{ badge }}</span>
        </span>
        <span v-if="description" class="accordion-desc">{{ description }}</span>
      </span>
      <ChevronDown :size="17" class="accordion-chevron" />
    </button>
    <div v-if="open" class="accordion-body">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

defineProps({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  badge: { type: [String, Number], default: '' },
});

const open = ref(false);
</script>
