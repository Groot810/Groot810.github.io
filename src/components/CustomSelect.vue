<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

export type CustomSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue?: string
  options: CustomSelectOption[]
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
}>(), {
  ariaLabel: '请选择',
  placeholder: '请选择',
  disabled: false,
  modelValue: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)
const panelStyle = ref<Record<string, string>>({})

const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue))

function enabledIndex(from: number, step: 1 | -1) {
  if (!props.options.length) return -1
  let index = from
  for (let count = 0; count < props.options.length; count += 1) {
    index = (index + step + props.options.length) % props.options.length
    if (!props.options[index]?.disabled) return index
  }
  return -1
}

function updatePosition() {
  const element = trigger.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const desiredHeight = Math.min(286, props.options.length * 39 + 12)
  const spaceBelow = window.innerHeight - rect.bottom
  const openAbove = spaceBelow < desiredHeight + 12 && rect.top > spaceBelow
  panelStyle.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 8))}px`,
    width: `${Math.max(rect.width, 180)}px`,
    ...(openAbove
      ? { bottom: `${window.innerHeight - rect.top + 7}px` }
      : { top: `${rect.bottom + 7}px` }),
  }
}

function addPositionListeners() {
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
}

function removePositionListeners() {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
}

async function show() {
  if (props.disabled || !props.options.length) return
  activeIndex.value = Math.max(0, props.options.findIndex((option) => option.value === props.modelValue))
  open.value = true
  await nextTick()
  updatePosition()
  addPositionListeners()
}

function hide(focusTrigger = false) {
  if (!open.value) return
  open.value = false
  removePositionListeners()
  if (focusTrigger) nextTick(() => trigger.value?.focus())
}

function toggle() {
  if (open.value) hide()
  else show()
}

function choose(option: CustomSelectOption) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  hide(true)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    hide(true)
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) show()
    activeIndex.value = enabledIndex(activeIndex.value, event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    activeIndex.value = event.key === 'Home'
      ? enabledIndex(-1, 1)
      : enabledIndex(0, -1)
    return
  }
  if ((event.key === 'Enter' || event.key === ' ') && open.value) {
    event.preventDefault()
    const option = props.options[activeIndex.value]
    if (option) choose(option)
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!root.value?.contains(target) && !panel.value?.contains(target)) hide()
}

document.addEventListener('pointerdown', onDocumentPointerDown)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  removePositionListeners()
})

watch(() => props.disabled, (disabled) => disabled && hide())
</script>

<template>
  <div ref="root" class="custom-select" :class="{ open, disabled }">
    <button
      ref="trigger"
      type="button"
      class="custom-select-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :disabled="disabled"
      @click.stop="toggle"
      @keydown="onKeydown"
    >
      <span :class="{ placeholder: !selectedOption }">{{ selectedOption?.label || placeholder }}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4 4.5-4" /></svg>
    </button>

    <Teleport to="body">
      <Transition name="custom-select-pop">
        <div
          v-if="open"
          ref="panel"
          class="custom-select-panel"
          :style="panelStyle"
          role="listbox"
          :aria-label="ariaLabel"
          @keydown="onKeydown"
        >
          <button
            v-for="(option, index) in options"
            :key="option.value"
            type="button"
            class="custom-select-option"
            :class="{ selected: option.value === modelValue, active: index === activeIndex }"
            :disabled="option.disabled"
            role="option"
            :aria-selected="option.value === modelValue"
            @pointerenter="activeIndex = index"
            @click.stop="choose(option)"
          >
            <span>{{ option.label }}</span>
            <svg v-if="option.value === modelValue" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
.custom-select { position: relative; min-width: 0; }
.custom-select-trigger {
  width: 100%; min-height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 7px 10px 7px 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px;
  color: #e8e6f0; background: linear-gradient(180deg, rgba(48,46,57,.98), rgba(35,34,42,.98));
  font: inherit; text-align: left; cursor: pointer; transition: border-color .16s, background .16s, box-shadow .16s;
}
.custom-select-trigger:hover { border-color: rgba(178,151,255,.38); background: linear-gradient(180deg, #35323f, #282630); }
.custom-select.open .custom-select-trigger { border-color: #8e72dc; box-shadow: 0 0 0 3px rgba(142,114,220,.14); }
.custom-select-trigger span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.custom-select-trigger .placeholder { color: #8e8999; }
.custom-select-trigger > svg { width: 18px; height: 18px; flex: 0 0 auto; fill: none; stroke: #aaa4b7; stroke-width: 1.8; transition: transform .18s; }
.custom-select.open .custom-select-trigger > svg { transform: rotate(180deg); color: #c8b7ff; }
.custom-select.disabled { opacity: .5; }
.custom-select-panel {
  position: fixed; z-index: 10020; max-height: 286px; overflow: auto; padding: 6px;
  border: 1px solid rgba(190,168,255,.2); border-radius: 13px;
  background: linear-gradient(145deg, rgba(43,41,51,.99), rgba(29,28,35,.99));
  box-shadow: 0 18px 48px rgba(0,0,0,.48), 0 4px 14px rgba(0,0,0,.28), inset 0 1px rgba(255,255,255,.05);
  backdrop-filter: blur(18px); scrollbar-width: thin; scrollbar-color: #5e586b transparent;
}
.custom-select-option {
  width: 100%; min-height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 10px; border: 0; border-radius: 8px; color: #d9d5e2; background: transparent;
  font: inherit; text-align: left; cursor: pointer; transition: color .12s, background .12s;
}
.custom-select-option:hover, .custom-select-option.active { color: #fff; background: rgba(255,255,255,.07); }
.custom-select-option.selected { color: #e9e0ff; background: linear-gradient(90deg, rgba(125,91,214,.32), rgba(125,91,214,.15)); }
.custom-select-option > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.custom-select-option > svg { width: 17px; height: 17px; flex: 0 0 auto; fill: none; stroke: #bda6ff; stroke-width: 2.2; }
.custom-select-option:disabled { opacity: .38; cursor: not-allowed; }
.custom-select-pop-enter-active, .custom-select-pop-leave-active { transition: opacity .13s ease, transform .13s ease; transform-origin: top center; }
.custom-select-pop-enter-from, .custom-select-pop-leave-to { opacity: 0; transform: translateY(-4px) scale(.98); }
.node-model-select .custom-select-trigger { min-height: 30px; padding: 4px 8px 4px 10px; border-radius: 9px; font-size: .82em; }
.audio-generation-setting .custom-select-trigger, .settings-content .custom-select-trigger { margin-top: 6px; }
</style>
