<template>
  <Teleport to="body">
    <Transition :name="variant === 'drawer' ? 'drawer' : 'modal'">
      <div
        v-if="open"
        class="modal-root"
        :class="[`modal-${variant}`, `size-${size}`]"
        role="presentation"
        @mousedown="onOverlay"
      >
        <div class="modal-backdrop" aria-hidden="true" />
        <section
          ref="panel"
          class="modal-panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
        >
          <header class="modal-head">
            <div v-if="eyebrow" class="modal-eyebrow">{{ eyebrow }}</div>
            <div class="modal-head-row">
              <div class="modal-headings">
                <h2 :id="titleId" class="modal-title">{{ title }}</h2>
                <p v-if="subtitle" class="modal-subtitle">{{ subtitle }}</p>
              </div>
              <button type="button" class="icon-btn modal-close" aria-label="关闭" @click="requestClose">
                <X :size="19" />
              </button>
            </div>
            <slot name="head" />
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  variant: { type: String, default: 'drawer' },
  size: { type: String, default: 'lg' },
  persistent: { type: Boolean, default: false },
  closeOnOverlay: { type: Boolean, default: true },
});
const emit = defineEmits(['close']);

const panel = ref(null);
const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
let previousFocus = null;

function requestClose() {
  if (props.persistent) return;
  emit('close');
}

function onOverlay(event) {
  if (!props.closeOnOverlay) return;
  if (event.target !== event.currentTarget && !event.target.classList?.contains('modal-backdrop')) return;
  requestClose();
}

function focusables() {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null);
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    requestClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const list = focusables();
  if (list.length === 0) {
    event.preventDefault();
    panel.value?.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function lock() {
  previousFocus = document.activeElement;
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown, true);
  nextTick(() => {
    const list = focusables();
    (list[0] || panel.value)?.focus();
  });
}

function unlock() {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown, true);
  if (previousFocus?.focus) previousFocus.focus();
  previousFocus = null;
}

watch(
  () => props.open,
  (open) => {
    if (open) lock();
    else unlock();
  },
  { immediate: true },
);

onBeforeUnmount(unlock);
</script>
