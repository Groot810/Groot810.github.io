<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title: string
  text: string
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <div class="toggle-row">
    <div>
      <b>{{ title }}</b>
      <p>{{ text }}</p>
    </div>
    <button
      type="button"
      :class="{ on: modelValue }"
      :aria-label="title"
      :aria-pressed="modelValue"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <i></i>
    </button>
  </div>
</template>
