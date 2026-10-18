<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="segmented-item"
      :class="{ 'is-active': modelValue === option.value }"
      @click="$emit('update:modelValue', option.value)"
    >
      <component v-if="option.icon" :is="option.icon" :size="14" />
      <span>{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  options: { type: Array, default: () => [] },
  label: { type: String, default: '' },
});
defineEmits(['update:modelValue']);
</script>
