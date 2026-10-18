<template>
  <div class="kv-editor">
    <div v-if="rows.length" class="kv-rows">
      <div v-for="row in rows" :key="row.id" class="kv-row">
        <input
          v-model="row.key"
          class="input input-mono kv-key"
          type="text"
          :placeholder="keyPlaceholder"
          @input="emitValue"
        />
        <input
          v-model="row.value"
          class="input kv-value"
          type="text"
          :placeholder="valuePlaceholder"
          @input="emitValue"
        />
        <button type="button" class="icon-btn kv-remove" aria-label="删除此项" @click="removeRow(row)">
          <Trash2 :size="15" />
        </button>
      </div>
    </div>
    <button type="button" class="kv-add" @click="addRow">
      <Plus :size="14" />
      <span>{{ addLabel }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  keyPlaceholder: { type: String, default: '键名' },
  valuePlaceholder: { type: String, default: '值' },
  addLabel: { type: String, default: '添加一项' },
});
const emit = defineEmits(['update:modelValue']);

let uid = 0;
let lastEmitted = '';
const rows = ref([]);

function makeRow(key = '', value = '') {
  uid += 1;
  return { id: uid, key, value };
}

function resetFromProps() {
  const entries = Object.entries(props.modelValue || {});
  rows.value = entries.map(([key, value]) => makeRow(key, value));
  lastEmitted = JSON.stringify(props.modelValue || {});
}

resetFromProps();

watch(
  () => props.modelValue,
  () => {
    if (JSON.stringify(props.modelValue || {}) === lastEmitted) return;
    resetFromProps();
  },
  { deep: true },
);

function emitValue() {
  const object = {};
  for (const row of rows.value) {
    const key = String(row.key || '').trim();
    if (key) object[key] = String(row.value ?? '');
  }
  lastEmitted = JSON.stringify(object);
  emit('update:modelValue', object);
}

function addRow() {
  rows.value.push(makeRow());
  emitValue();
}

function removeRow(row) {
  rows.value = rows.value.filter((item) => item.id !== row.id);
  emitValue();
}
</script>
