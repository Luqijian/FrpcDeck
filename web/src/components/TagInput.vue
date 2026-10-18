<template>
  <div class="tag-input" :class="{ 'is-focused': focused }">
    <span v-for="(tag, index) in modelValue" :key="`${tag}-${index}`" class="tag-chip">
      <span>{{ tag }}</span>
      <button type="button" class="tag-remove" :aria-label="`移除 ${tag}`" @click="remove(index)">
        <X :size="12" :stroke-width="2.4" />
      </button>
    </span>
    <input
      ref="inputRef"
      v-model="draft"
      class="tag-field"
      type="text"
      :placeholder="modelValue.length === 0 ? placeholder : ''"
      @keydown="onKeydown"
      @keydown.backspace="onBackspace"
      @paste="onPaste"
      @focus="focused = true"
      @blur="onBlur"
    />
    <button v-if="draft.trim()" type="button" class="tag-add" aria-label="添加" @click="commit">
      <Plus :size="14" />
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Plus, X } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  placeholder: { type: String, default: '输入后按回车添加' },
});
const emit = defineEmits(['update:modelValue']);

const draft = ref('');
const focused = ref(false);
const inputRef = ref(null);

function values() {
  return Array.isArray(props.modelValue) ? props.modelValue : [];
}

function update(next) {
  emit('update:modelValue', [...new Set(next.map((item) => String(item).trim()).filter(Boolean))]);
}

function commit() {
  const parts = draft.value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean);
  if (parts.length) update([...values(), ...parts]);
  draft.value = '';
}

function onKeydown(event) {
  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
    event.preventDefault();
    commit();
  }
}

function remove(index) {
  const next = [...values()];
  next.splice(index, 1);
  update(next);
}

function onBackspace() {
  if (draft.value || values().length === 0) return;
  update(values().slice(0, -1));
}

function onPaste(event) {
  const text = event.clipboardData?.getData('text') || '';
  if (!/[,，\n]/.test(text)) return;
  event.preventDefault();
  const parts = text.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean);
  update([...values(), ...parts]);
  draft.value = '';
}

function onBlur() {
  focused.value = false;
  if (draft.value.trim()) commit();
}
</script>
