<template>
  <span
    class="type-badge"
    :style="{ '--type-color': meta.color }"
    :title="meta.name"
  >
    <TypeIcon :type="type" :size="13" :stroke-width="2.1" />
    <span>{{ meta.label }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import TypeIcon from './TypeIcon.vue';
import { TYPE_META } from '@/frp';

const props = defineProps({
  type: { type: String, default: 'tcp' },
});

const meta = computed(() => TYPE_META[props.type] || TYPE_META.tcp);
</script>
