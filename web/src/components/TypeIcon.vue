<template>
  <component
    :is="iconComponent"
    :size="size"
    :stroke-width="strokeWidth"
    class="type-icon"
    aria-hidden="true"
  />
</template>

<script setup>
import { computed } from 'vue';
import { Globe, Lock, Network, Radio, ShieldCheck, Shuffle, Waves, Zap } from 'lucide-vue-next';
import { TYPE_META } from '@/frp';

const props = defineProps({
  type: { type: String, default: 'tcp' },
  size: { type: Number, default: 16 },
  strokeWidth: { type: Number, default: 1.9 },
});

const ICONS = {
  network: Network,
  radio: Radio,
  globe: Globe,
  shield: ShieldCheck,
  split: Shuffle,
  lock: Lock,
  waves: Waves,
  zap: Zap,
};

const iconComponent = computed(() => ICONS[TYPE_META[props.type]?.icon] || Network);
</script>
