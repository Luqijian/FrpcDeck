<template>
  <button
    type="button"
    class="toggle-switch"
    :class="{ 'is-on': modelValue, 'is-small': small }"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label || undefined"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="toggle-track"><span class="toggle-thumb" /></span>
    <span v-if="label" class="toggle-text">{{ label }}</span>
  </button>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'change']);

function toggle() {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
  emit('change', !props.modelValue);
}
</script>
