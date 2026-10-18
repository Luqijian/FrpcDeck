<template>
  <div class="field" :class="{ 'field-wide': wide, 'has-error': Boolean(error) }">
    <div v-if="label || $slots.label" class="field-head">
      <label ref="labelEl" class="field-label" :for="inputId">
        <slot name="label">{{ label }}</slot>
        <span v-if="required" class="field-required" aria-hidden="true">*</span>
      </label>
      <slot name="aside" />
    </div>
    <div ref="controlEl" class="field-control">
      <slot :id="inputId" />
    </div>
    <p v-if="error" class="field-message field-error">{{ error }}</p>
    <p v-else-if="hint" class="field-message">{{ hint }}</p>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUpdated, ref, useId } from 'vue';

const props = defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
});

const inputId = useId();
const controlEl = ref(null);
const labelEl = ref(null);

async function syncControl() {
  await nextTick();
  const control = controlEl.value?.querySelector(
    'input:not([type="hidden"]), select, textarea, button',
  );
  if (!control) return;
  if (control.tagName !== 'BUTTON') {
    if (!control.id) control.id = inputId;
  }
  if (!control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')) {
    const text = (labelEl.value?.textContent || props.label || '').replace(/\*/g, '').trim();
    if (text) control.setAttribute('aria-label', text);
  }
}

onMounted(syncControl);
onUpdated(syncControl);
</script>
