<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null

onMounted(() => {
  if (!host.value) return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        javascript(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': '模型调用脚本代码',
          'data-placeholder': props.placeholder || '',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
        }),
      ],
    }),
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  },
)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="host" class="code-editor-host"></div>
</template>

<style scoped>
.code-editor-host {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid #303540;
  border-radius: 11px;
  background: #111319;
}
.code-editor-host:focus-within {
  border-color: #7569d4;
  box-shadow: 0 0 0 2px #7569d426;
}
.code-editor-host :deep(.cm-editor) {
  height: 100%;
  background: #111319;
  font: 12px/1.65 Consolas, "Cascadia Code", monospace;
}
.code-editor-host :deep(.cm-scroller) {
  overflow: auto;
  font-family: inherit;
}
.code-editor-host :deep(.cm-gutters) {
  border-right: 1px solid #292e38;
  background: #0d0f13;
  color: #555e6c;
}
.code-editor-host :deep(.cm-activeLineGutter) {
  background: #252333;
  color: #b5adf4;
}
.code-editor-host :deep(.cm-activeLine) {
  background: #7970c10d;
}
.code-editor-host :deep(.cm-content) {
  padding: 13px 0 28px;
  caret-color: #c3bbff;
}
.code-editor-host :deep(.cm-line) {
  padding: 0 12px;
}
.code-editor-host :deep(.cm-content:empty::before) {
  content: attr(data-placeholder);
  color: #596270;
  pointer-events: none;
}
</style>
