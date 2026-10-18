<template>
  <section :id="anchor" class="form-section" :class="{ 'is-flush': flush }">
    <header v-if="title || description || $slots.actions" class="form-section-head">
      <div v-if="$slots.icon" class="form-section-icon">
        <slot name="icon" />
      </div>
      <div class="form-section-headings">
        <h3 v-if="title" class="form-section-title">{{ title }}</h3>
        <p v-if="description" class="form-section-desc">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="form-section-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="form-section-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  anchor: { type: String, default: '' },
  flush: { type: Boolean, default: false },
});
</script>
