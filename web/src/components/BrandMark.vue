<template>
  <span class="brand-mark" :style="{ '--mark-size': `${size}px` }" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient :id="gradientId" x1="8" y1="8" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stop-color="#4DF0B4" />
          <stop offset=".55" stop-color="#55B8FF" />
          <stop offset="1" stop-color="#9A8CFF" />
        </linearGradient>
      </defs>
      <path d="M15 23.5C15 19.91 17.91 17 21.5 17H27" :stroke="`url(#${gradientId})`" stroke-width="5" stroke-linecap="round" />
      <path d="M15 40.5C15 44.09 17.91 47 21.5 47H27" :stroke="`url(#${gradientId})`" stroke-width="5" stroke-linecap="round" />
      <path d="M49 23.5C49 19.91 46.09 17 42.5 17H37" :stroke="`url(#${gradientId})`" stroke-width="5" stroke-linecap="round" />
      <path d="M49 40.5C49 44.09 46.09 47 42.5 47H37" :stroke="`url(#${gradientId})`" stroke-width="5" stroke-linecap="round" />
      <path d="M25 32H39M39 32L34.5 27.5M39 32L34.5 36.5" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  size: { type: Number, default: 36 },
});

const gradientId = computed(() => `fm-${Math.random().toString(36).slice(2, 9)}`);
</script>
