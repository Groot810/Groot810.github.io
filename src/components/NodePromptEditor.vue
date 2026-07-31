<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

type MentionKind = 'text' | 'image' | 'video' | 'audio' | 'config'
type MentionOption = {
  id: string
  kind: MentionKind
  title: string
  url?: string
}

const props = defineProps<{
  modelValue: string
  placeholder?: string
  upstream: MentionOption[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: []
}>()

const editor = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const activeIndex = ref(0)
const REFERENCE_TITLE_MAX_CHARS = 10
let savedRange: Range | null = null

const options = computed(() => props.upstream.filter((node) => node.kind !== 'config'))
const kindNames: Record<Exclude<MentionKind, 'config'>, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
}
const kindIcons: Record<Exclude<MentionKind, 'config'>, string> = {
  text: 'T',
  image: '▣',
  video: '▶',
  audio: '♪',
}

function optionLabel(option: MentionOption) {
  if (option.kind === 'config') return option.title
  const sameKind = options.value.filter((node) => node.kind === option.kind)
  return `${kindNames[option.kind]} ${sameKind.findIndex((node) => node.id === option.id) + 1}`
}
function truncateReferenceTitle(title: string) {
  const characters = Array.from(title)
  return characters.length > REFERENCE_TITLE_MAX_CHARS
    ? `${characters.slice(0, REFERENCE_TITLE_MAX_CHARS).join('')}...`
    : title
}
function createMention(option?: MentionOption, id?: string) {
  const chip = document.createElement('span')
  chip.className = `prompt-mention mention-${option?.kind || 'missing'}`
  chip.contentEditable = 'false'
  chip.dataset.mentionId = option?.id || id || ''
  if (option) chip.title = option.title
  if (option?.kind === 'image' && option.url) {
    const image = document.createElement('img')
    image.src = option.url
    image.alt = option.title
    image.draggable = false
    chip.appendChild(image)
  } else {
    const icon = document.createElement('i')
    icon.textContent =
      option?.kind && option.kind !== 'config' ? kindIcons[option.kind] : '!'
    chip.appendChild(icon)
  }
  const label = document.createElement('span')
  label.textContent = option
    ? `${optionLabel(option)} · ${truncateReferenceTitle(option.title)}`
    : '已断开的资源'
  chip.appendChild(label)
  return chip
}
function appendText(fragment: DocumentFragment, value: string) {
  const lines = value.split('\n')
  lines.forEach((line, index) => {
    if (line) fragment.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) fragment.appendChild(document.createElement('br'))
  })
}
function renderValue() {
  if (!editor.value) return
  const fragment = document.createDocumentFragment()
  const expression = /@\[node:([^\]]+)\]/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = expression.exec(props.modelValue))) {
    appendText(fragment, props.modelValue.slice(cursor, match.index))
    const option = options.value.find((node) => node.id === match![1])
    fragment.appendChild(createMention(option, match[1]))
    cursor = match.index + match[0].length
  }
  appendText(fragment, props.modelValue.slice(cursor))
  editor.value.replaceChildren(fragment)
}
function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (!(node instanceof HTMLElement)) return ''
  if (node.dataset.mentionId) return `@[node:${node.dataset.mentionId}]`
  if (node.tagName === 'BR') return '\n'
  const value = [...node.childNodes].map(serializeNode).join('')
  return node.tagName === 'DIV' || node.tagName === 'P' ? `${value}\n` : value
}
function serializedValue() {
  return editor.value
    ? [...editor.value.childNodes]
        .map(serializeNode)
        .join('')
        .replace(/\u00a0/g, ' ')
        .replace(/\n$/, '')
    : ''
}
function rememberSelection() {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !editor.value) return
  const range = selection.getRangeAt(0)
  if (editor.value.contains(range.startContainer)) savedRange = range.cloneRange()
}
function textBeforeCaret() {
  if (!savedRange || !editor.value) return ''
  const range = savedRange.cloneRange()
  range.selectNodeContents(editor.value)
  range.setEnd(savedRange.endContainer, savedRange.endOffset)
  return range.toString()
}
function publish() {
  rememberSelection()
  const value = serializedValue()
  emit('update:modelValue', value)
  emit('change')
  menuOpen.value = textBeforeCaret().endsWith('@')
  if (menuOpen.value) activeIndex.value = 0
}
function removeTrigger(range: Range) {
  const container = range.startContainer
  const offset = range.startOffset
  if (container.nodeType === Node.TEXT_NODE && offset > 0) {
    const text = container as Text
    if (text.data[offset - 1] === '@') {
      text.deleteData(offset - 1, 1)
      range.setStart(text, offset - 1)
      range.collapse(true)
      return
    }
  }
}
async function insertMention(option: MentionOption) {
  if (!editor.value) return
  editor.value.focus()
  const selection = window.getSelection()
  const range = savedRange?.cloneRange() || document.createRange()
  if (!savedRange) {
    range.selectNodeContents(editor.value)
    range.collapse(false)
  }
  removeTrigger(range)
  const chip = createMention(option)
  range.insertNode(chip)
  range.setStartAfter(chip)
  range.collapse(true)
  const space = document.createTextNode(' ')
  range.insertNode(space)
  range.setStartAfter(space)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  savedRange = range.cloneRange()
  menuOpen.value = false
  const value = serializedValue()
  emit('update:modelValue', value)
  emit('change')
  await nextTick()
  editor.value?.focus()
}
function onKeydown(event: KeyboardEvent) {
  if (!menuOpen.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(options.value.length - 1, activeIndex.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
  } else if (event.key === 'Enter' && options.value[activeIndex.value]) {
    event.preventDefault()
    insertMention(options.value[activeIndex.value]!)
  } else if (event.key === 'Escape') {
    menuOpen.value = false
  }
}
function closeMenu() {
  window.setTimeout(() => (menuOpen.value = false), 100)
}

onMounted(renderValue)
watch(
  () => props.modelValue,
  (value) => {
    if (serializedValue() !== value) renderValue()
  },
)
watch(
  () => props.upstream.map((node) => `${node.id}:${node.title}:${node.url || ''}`).join('|'),
  renderValue,
)
</script>

<template>
  <div class="node-prompt-editor" @pointerdown.stop @wheel.stop>
    <div
      ref="editor"
      class="prompt-editor-content"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :data-placeholder="placeholder"
      @input="publish"
      @click="rememberSelection"
      @keyup="rememberSelection"
      @keydown="onKeydown"
      @blur="closeMenu"
    ></div>
    <div v-if="menuOpen" class="mention-menu">
      <div v-if="!options.length" class="mention-empty">暂无已连接的上游资源</div>
      <button
        v-for="(option, index) in options"
        :key="option.id"
        :class="{ active: activeIndex === index }"
        @mouseenter="activeIndex = index"
        @mousedown.prevent="insertMention(option)"
      >
        <img v-if="option.kind === 'image' && option.url" :src="option.url" alt="" draggable="false" />
        <i v-else>{{ option.kind === 'config' ? '!' : kindIcons[option.kind] }}</i>
        <span>
          <b>{{ optionLabel(option) }}</b>
          <small :title="option.title">{{ truncateReferenceTitle(option.title) }}</small>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.node-prompt-editor {
  position: relative;
  display: block;
  width: 100%;
  height: 105px;
  min-height: 60px;
  background: transparent;
  color: #bac0ca;
  user-select: text;
}
.prompt-editor-content {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 13px 14px;
  outline: none;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
}
.prompt-editor-content:empty::before {
  content: attr(data-placeholder);
  color: #626a78;
  pointer-events: none;
  white-space: pre-wrap;
}
.prompt-editor-content :deep(.prompt-mention) {
  display: inline-flex;
  max-width: 92%;
  height: 26px;
  margin: 1px 3px;
  padding: 2px 7px 2px 3px;
  vertical-align: middle;
  align-items: center;
  gap: 5px;
  border: 1px solid #4d4964;
  border-radius: 7px;
  background: #262333;
  color: #d1caff;
  font-size: 9px;
  line-height: 20px;
  white-space: nowrap;
}
.prompt-editor-content :deep(.prompt-mention img) {
  width: 30px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
}
.prompt-editor-content :deep(.prompt-mention i) {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: inline-grid;
  place-items: center;
  background: #3c3754;
  font-style: normal;
}
.prompt-editor-content :deep(.mention-missing) {
  border-color: #6b4148;
  background: #352226;
  color: #ed9ba5;
}
.mention-menu {
  position: absolute;
  z-index: 40;
  left: 10px;
  right: 10px;
  top: calc(100% - 6px);
  max-height: 210px;
  overflow: auto;
  padding: 6px;
  border: 1px solid #3c4250;
  border-radius: 10px;
  background: #171a20;
  box-shadow: 0 18px 45px #000c;
}
.mention-menu button {
  width: 100%;
  min-height: 42px;
  padding: 5px 7px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #c6cbd4;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  cursor: pointer;
}
.mention-menu button:hover,
.mention-menu button.active {
  background: #2b2742;
}
.mention-menu img,
.mention-menu i {
  width: 38px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 6px;
  object-fit: cover;
}
.mention-menu i {
  display: grid;
  place-items: center;
  background: #343044;
  color: #b9b0ff;
  font-style: normal;
}
.mention-menu span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mention-menu b {
  font-size: 9px;
}
.mention-menu small {
  overflow: hidden;
  color: #777f8d;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mention-empty {
  padding: 11px;
  color: #707887;
  text-align: center;
  font-size: 9px;
}
</style>
