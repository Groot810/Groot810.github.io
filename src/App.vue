<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import NodePromptEditor from './components/NodePromptEditor.vue'
import ToggleRow from './components/ToggleRow.vue'

type NodeKind = 'text' | 'image' | 'video' | 'audio' | 'config'
type ServiceKind = Exclude<NodeKind, 'config'>
type ModelServiceConfig = {
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}
type ModelChannel = ModelServiceConfig & {
  id: string
  name: string
}
type ConnectionState = {
  status: 'idle' | 'testing' | 'success' | 'error'
  message: string
}
type GenerationSnapshot = {
  generatedAt: string
  inputNodeIds: string[]
  inputVersions: Record<string, number>
  prompt: string
  model: string
}
type GeneratedImageResult = {
  imageUrl: string
  prompt: string
}
type ImageEditDraft = {
  nodeId: string
  prompt: string
  imageWidth: number
  imageHeight: number
  imageAutoSize: boolean
  imageCount: number
}
type AudioPlaybackState = {
  currentTime: number
  duration: number
  playing: boolean
  muted: boolean
}
type CanvasNode = {
  id: string
  kind: NodeKind
  title: string
  x: number
  y: number
  width: number
  height?: number
  inputHeight?: number
  content: string
  url?: string
  status?: 'idle' | 'running' | 'success' | 'stale' | 'error'
  version: number
  createdAt: number
  resultText?: string
  autoRun?: boolean
  hiddenInstruction?: string
  imageWidth?: number
  imageHeight?: number
  imageAutoSize?: boolean
  imageCount?: number
  imagePrompt?: string
  modelChannelId?: string
  audioPlaybackRate?: number
  audioVolume?: number
  lastGeneration?: GenerationSnapshot
}
type Edge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  order: number
  enabled: boolean
}
type Snapshot = { nodes: CanvasNode[]; edges: Edge[] }
type CanvasIndexItem = {
  id: string
  name: string
  updatedAt: number
  nodeCount: number
  edgeCount: number
}
type CanvasTemplate = {
  id: string
  name: string
  createdAt: number
  nodes: CanvasNode[]
  edges: Edge[]
}
type TemplatePreview = {
  nodes: Array<{ id: string; kind: NodeKind; x: number; y: number; width: number; height: number }>
  edges: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>
}
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'
const resizeCorners: ResizeCorner[] = ['nw', 'ne', 'sw', 'se']

const uid = () => Math.random().toString(36).slice(2, 9)
const CANVAS_INDEX_KEY = 'infinite:canvas-index'
const CANVAS_TEMPLATES_KEY = 'infinite:canvas-templates'
const MAX_CANVAS_TEMPLATES = 10
const FONT_SCALE_KEY = 'infinite:font-scale-v2'
const MAX_NODE_TEXT_CHARS = 8000
const MAX_FORMATTED_INPUT_CHARS = 20000
const MAX_IMAGE_PROMPT_CHARS = 30000
const TEXT_TO_IMAGE_PROMPT_INSTRUCTION = `请根据用户输入内容反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 尽量写成可直接用于生图模型的完整提示词。`
const IMAGE_TO_PROMPT_INSTRUCTION = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
只输出提示词正文，不要解释。
覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
尽量写成可直接用于生图模型的完整提示词。`
const canvasId = ref(localStorage.getItem('infinite:last-canvas') || `canvas-${uid()}`)
const canvasName = ref('无限画布')
const nodes = ref<CanvasNode[]>([])
const edges = ref<Edge[]>([])
const selected = ref<string[]>([])
const selectedEdge = ref<string | null>(null)
const viewport = reactive({ x: 0, y: 0, zoom: 1 })
const mode = ref<'select' | 'hand'>('select')
const showMinimap = ref(true)
const showSettings = ref(false)
const showProjectMenu = ref(false)
const showCanvasList = ref(false)
const showRenameCanvas = ref(false)
const renameCanvasDraft = ref('')
const canvasIndex = ref<CanvasIndexItem[]>([])
function detectRecommendedFontScale() {
  const viewportWidth = window.innerWidth
  const physicalWidth = window.screen.width * window.devicePixelRatio
  const aspectRatio = window.screen.width / Math.max(1, window.screen.height)
  if (physicalWidth >= 3800) return 1.4
  if (aspectRatio >= 2.2 && physicalWidth >= 3000) return 1.35
  if (physicalWidth >= 2500 || viewportWidth >= 2560) return 1.3
  if (viewportWidth >= 1920) return 1.25
  if (viewportWidth <= 900) return 1.15
  return 1.2
}
const recommendedFontScale = detectRecommendedFontScale()
const savedFontScale = Number(localStorage.getItem(FONT_SCALE_KEY))
const fontScale = ref(
  Number.isFinite(savedFontScale) && savedFontScale >= 0.9 && savedFontScale <= 2
    ? savedFontScale
    : recommendedFontScale,
)
const activeSetting = ref('模型服务')
const toast = ref('')
const linkingFrom = ref<string | null>(null)
const linkingPointer = reactive({ x: 0, y: 0 })
const history = ref<Snapshot[]>([])
const future = ref<Snapshot[]>([])
const canvasEl = ref<HTMLElement | null>(null)
const canvasSize = reactive({ width: 1200, height: 800 })
const replaceImageInput = ref<HTMLInputElement | null>(null)
const zoomedImage = ref<CanvasNode | null>(null)
const imageSettingsNodeId = ref<string | null>(null)
const audioMenuNodeId = ref<string | null>(null)
const audioVolumeNodeId = ref<string | null>(null)
const audioPlaybackStates = reactive<Record<string, AudioPlaybackState>>({})
const showTemplatePanel = ref(false)
const activeTemplateTab = ref<'mine' | 'library'>('mine')
const canvasTemplates = ref<CanvasTemplate[]>([])
const editingTemplateId = ref<string | null>(null)
const templateNameDraft = ref('')
const imageEditNodeId = ref<string | null>(null)
const imageVariationRunningIds = ref<string[]>([])
const imageEditDraft = reactive<ImageEditDraft>({
  nodeId: '',
  prompt: '',
  imageWidth: 1024,
  imageHeight: 1024,
  imageAutoSize: true,
  imageCount: 1,
})
const editingResultId = ref<string | null>(null)
const activeServiceKind = ref<ServiceKind>('text')
let drag:
  | {
      id?: string
      startX: number
      startY: number
      nodeX?: number
      nodeY?: number
      vx: number
      vy: number
      pointerId: number
      captureTarget: HTMLElement
      openImageEditorId?: string
      moved?: boolean
    }
  | null = null
let resize:
  | {
      id: string
      corner: ResizeCorner
      startX: number
      startY: number
      nodeX: number
      nodeY: number
      width: number
      height: number
    }
  | null = null
let resultSplit:
  | {
      id: string
      startY: number
      inputHeight: number
      totalHeight: number
    }
  | null = null
let imageEditorOutsidePointer:
  | {
      pointerId: number
      startX: number
      startY: number
      startedOutside: boolean
      moved: boolean
    }
  | null = null

const settings = reactive({
  theme: 'dark',
  grid: '点阵',
  snap: true,
  autosave: 5,
  compact: false,
  animations: true,
  systemPrompt: '你是一位擅长视觉创意与工作流编排的 AI 助手。请根据画布中的上下文提供清晰、可执行的建议。',
  canvasPrompt: '输出简洁、准确且具有现代科技感的中文内容。',
  confirmPolicy: '仅危险操作',
  saveHistory: true,
  saveGeneration: true,
  allowCanvasContext: true,
  analytics: false,
})
function defaultServiceConfig(kind: ServiceKind): ModelServiceConfig {
  const configs: Record<ServiceKind, ModelServiceConfig> = {
    text: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-5.5', temperature: 1, maxTokens: 4096 },
    image: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-image-2', temperature: 1, maxTokens: 4096 },
    video: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'sora-2', temperature: 1, maxTokens: 4096 },
    audio: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini-tts', temperature: 1, maxTokens: 4096 },
  }
  return { ...configs[kind] }
}
function defaultModelChannel(kind: ServiceKind, index = 0): ModelChannel {
  return { id: `${kind}-model-${index + 1}`, name: `模型${index + 1}`, ...defaultServiceConfig(kind) }
}
const modelServices = reactive<Record<ServiceKind, ModelChannel[]>>({
  text: [defaultModelChannel('text')],
  image: [defaultModelChannel('image')],
  video: [defaultModelChannel('video')],
  audio: [defaultModelChannel('audio')],
})
const activeModelChannelIds = reactive<Record<ServiceKind, string>>({
  text: 'text-model-1',
  image: 'image-model-1',
  video: 'video-model-1',
  audio: 'audio-model-1',
})
const connectionTests = reactive<Record<string, ConnectionState>>({})
const serviceOptions: Array<{ kind: ServiceKind; label: string; icon: string }> = [
  { kind: 'text', label: '文本', icon: 'T' },
  { kind: 'image', label: '图片', icon: '▣' },
  { kind: 'video', label: '视频', icon: '▶' },
  { kind: 'audio', label: '音频', icon: '♪' },
]
function channelsFor(kind: ServiceKind) {
  return modelServices[kind]
}
function selectedChannel(kind: ServiceKind) {
  const channels = channelsFor(kind)
  return channels.find((channel) => channel.id === activeModelChannelIds[kind]) || channels[0]!
}
function connectionState(channelId: string) {
  if (!connectionTests[channelId]) connectionTests[channelId] = { status: 'idle', message: '' }
  return connectionTests[channelId]!
}
const activeService = computed(() => selectedChannel(activeServiceKind.value))
const activeServiceChannels = computed(() => channelsFor(activeServiceKind.value))
const activeConnectionTest = computed(() => connectionState(activeService.value.id))

function addModelChannel(kind: ServiceKind = activeServiceKind.value) {
  const channels = channelsFor(kind)
  if (channels.length >= 5) return flash('每类服务最多添加 5 个模型')
  const channel = { ...defaultModelChannel(kind, channels.length), id: `${kind}-model-${uid()}` }
  channels.push(channel)
  activeModelChannelIds[kind] = channel.id
}
function removeModelChannel(kind: ServiceKind, channelId: string) {
  const channels = channelsFor(kind)
  if (channels.length <= 1) return flash('每类服务至少保留 1 个模型')
  const index = channels.findIndex((channel) => channel.id === channelId)
  if (index < 0) return
  channels.splice(index, 1)
  const fallback = channels[Math.min(index, channels.length - 1)]!
  activeModelChannelIds[kind] = fallback.id
  nodes.value.forEach((node) => {
    const nodeKind = node.kind === 'config' ? 'text' : node.kind
    if (nodeKind === kind && node.modelChannelId === channelId) {
      node.modelChannelId = fallback.id
      markNodeChanged(node)
    }
  })
  delete connectionTests[channelId]
  sessionStorage.removeItem(`infinite:api-key:${kind}:${channelId}`)
}
function resetModelService(
  kind: ServiceKind = activeServiceKind.value,
  channelId = activeModelChannelIds[kind],
) {
  const channel = channelsFor(kind).find((item) => item.id === channelId)
  if (!channel) return
  const name = channel.name
  Object.assign(channel, defaultServiceConfig(kind), { name })
  const state = connectionState(channel.id)
  state.status = 'idle'
  state.message = ''
  sessionStorage.removeItem(`infinite:api-key:${kind}:${channel.id}`)
  const label = serviceOptions.find((service) => service.kind === kind)?.label || ''
  flash(`${label}${name}已恢复默认`)
}
function resetSystemPromptSettings() {
  settings.systemPrompt =
    '你是一位擅长视觉创意与工作流编排的 AI 助手。请根据画布中的上下文提供清晰、可执行的建议。'
  settings.canvasPrompt = '输出简洁、准确且具有现代科技感的中文内容。'
  settings.confirmPolicy = '仅危险操作'
  flash('系统提示词已恢复默认')
}
const toolbarItems: { kind: Exclude<NodeKind, 'config'>; label: string; icon: string }[] = [
  { kind: 'text', label: '文本', icon: 'T' },
  { kind: 'image', label: '图片', icon: '▧' },
  { kind: 'video', label: '视频', icon: '▶' },
  { kind: 'audio', label: '音频', icon: '♫' },
]
const settingGroups = [
  { label: '常规', icon: '⌘' },
  { label: '画布', icon: '⌗' },
  { label: '模型服务', icon: '◈' },
  { label: '系统提示词', icon: '¶' },
  { label: '存储与隐私', icon: '▣' },
]

const nodeMap = computed(() => new Map(nodes.value.map((node) => [node.id, node])))
const selectedNode = computed(() => {
  const id = selected.value[0]
  return id ? nodeMap.value.get(id) : undefined
})
const selectedEdgeData = computed(() => edges.value.find((edge) => edge.id === selectedEdge.value))
const zoomLabel = computed(() => `${Math.round(viewport.zoom * 100)}%`)
const storageKey = computed(() => `infinite:canvas:${canvasId.value}`)
const minimapLayout = computed(() => {
  const stageWidth = 154
  const stageHeight = 90
  const viewLeft = -viewport.x / viewport.zoom
  const viewTop = -viewport.y / viewport.zoom
  const viewWidth = canvasSize.width / viewport.zoom
  const viewHeight = canvasSize.height / viewport.zoom
  const padding = 120
  const minX = Math.min(viewLeft, ...nodes.value.map((node) => node.x)) - padding
  const minY = Math.min(viewTop, ...nodes.value.map((node) => node.y)) - padding
  const maxX =
    Math.max(viewLeft + viewWidth, ...nodes.value.map((node) => node.x + node.width)) + padding
  const maxY =
    Math.max(viewTop + viewHeight, ...nodes.value.map((node) => node.y + (node.height || 210))) +
    padding
  const worldWidth = Math.max(1, maxX - minX)
  const worldHeight = Math.max(1, maxY - minY)
  const scale = Math.min(stageWidth / worldWidth, stageHeight / worldHeight)
  const offsetX = (stageWidth - worldWidth * scale) / 2
  const offsetY = (stageHeight - worldHeight * scale) / 2
  const position = (x: number, y: number) => ({
    left: offsetX + (x - minX) * scale,
    top: offsetY + (y - minY) * scale,
  })
  const viewportPosition = position(viewLeft, viewTop)
  return {
    nodes: Object.fromEntries(
      nodes.value.map((node) => {
        const point = position(node.x, node.y)
        return [
          node.id,
          {
            left: `${point.left}px`,
            top: `${point.top}px`,
            width: `${Math.max(5, node.width * scale)}px`,
            height: `${Math.max(3, (node.height || 120) * scale)}px`,
          },
        ]
      }),
    ),
    viewport: {
      left: `${viewportPosition.left}px`,
      top: `${viewportPosition.top}px`,
      width: `${Math.max(8, viewWidth * scale)}px`,
      height: `${Math.max(6, viewHeight * scale)}px`,
    },
  }
})

function cloneSnapshot(): Snapshot {
  return JSON.parse(JSON.stringify({ nodes: nodes.value, edges: edges.value }))
}
function checkpoint() {
  history.value.push(cloneSnapshot())
  if (history.value.length > 50) history.value.shift()
  future.value = []
}
function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
function persistCanvasTemplates() {
  localStorage.setItem(CANVAS_TEMPLATES_KEY, JSON.stringify(canvasTemplates.value))
}
function templateNodeShell(node: CanvasNode, index: number): CanvasNode {
  const defaults: Record<NodeKind, { title: string; content: string }> = {
    text: { title: '创意提示词', content: '' },
    image: { title: '参考图片', content: '拖入图片或点击上传' },
    video: { title: '视频素材', content: '等待添加视频素材' },
    audio: { title: '音频素材', content: '00:00  ━━━━━━━━━  00:00' },
    config: { title: '图像提示词', content: '' },
  }
  const kind = node.kind === 'config' ? 'text' : node.kind
  return {
    id: node.id,
    kind,
    title: defaults[kind].title,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    content: defaults[kind].content,
    status: 'idle',
    version: 1,
    createdAt: index + 1,
    imageWidth: kind === 'image' ? 1024 : undefined,
    imageHeight: kind === 'image' ? 1024 : undefined,
    imageAutoSize: kind === 'image' ? true : undefined,
    imageCount: kind === 'image' ? 1 : undefined,
  }
}
function templateStructure(nodesToCopy: CanvasNode[]) {
  return nodesToCopy.map(templateNodeShell)
}
function loadCanvasTemplates() {
  try {
    const saved = JSON.parse(localStorage.getItem(CANVAS_TEMPLATES_KEY) || '[]')
    if (!Array.isArray(saved)) return
    canvasTemplates.value = saved
      .filter(
        (item: Partial<CanvasTemplate>) =>
          item.id && item.name && Array.isArray(item.nodes) && Array.isArray(item.edges),
      )
      .slice(0, MAX_CANVAS_TEMPLATES)
      .map((item: CanvasTemplate) => ({
        ...item,
        createdAt: Number(item.createdAt) || Date.now(),
        nodes: templateStructure(item.nodes),
        edges: cloneValue(item.edges),
      }))
    persistCanvasTemplates()
  } catch {
    canvasTemplates.value = []
  }
}
function importCurrentCanvasTemplate() {
  if (!nodes.value.length) {
    flash('当前画布没有可保存的控件')
    return
  }
  if (canvasTemplates.value.length >= MAX_CANVAS_TEMPLATES) {
    flash('最多只能保存 10 个模板')
    return
  }
  const sequence = canvasTemplates.value.length + 1
  const template: CanvasTemplate = {
    id: `template-${Date.now()}-${uid()}`,
    name: `${normalizeCanvasName(canvasName.value)} · 模板 ${sequence}`,
    createdAt: Date.now(),
    nodes: templateStructure(nodes.value),
    edges: cloneValue(edges.value),
  }
  canvasTemplates.value.unshift(template)
  try {
    persistCanvasTemplates()
    flash(`已导入模板“${template.name}”`)
  } catch {
    canvasTemplates.value.shift()
    flash('模板保存失败，浏览器本地存储空间可能不足')
  }
}
function startTemplateRename(template: CanvasTemplate) {
  editingTemplateId.value = template.id
  templateNameDraft.value = template.name
}
function cancelTemplateRename() {
  editingTemplateId.value = null
  templateNameDraft.value = ''
}
function commitTemplateRename(template: CanvasTemplate) {
  if (editingTemplateId.value !== template.id) return
  const nextName = templateNameDraft.value.trim().slice(0, 60)
  if (!nextName || nextName === template.name) {
    cancelTemplateRename()
    return
  }
  const previousName = template.name
  template.name = nextName
  try {
    persistCanvasTemplates()
    flash(`模板已重命名为“${nextName}”`)
  } catch {
    template.name = previousName
    flash('模板名称保存失败')
  }
  cancelTemplateRename()
}
function deleteCanvasTemplate(template: CanvasTemplate) {
  if (!window.confirm(`确定删除模板“${template.name}”吗？`)) return
  const previousTemplates = canvasTemplates.value
  canvasTemplates.value = canvasTemplates.value.filter((item) => item.id !== template.id)
  try {
    persistCanvasTemplates()
    if (editingTemplateId.value === template.id) cancelTemplateRename()
    flash(`已删除模板“${template.name}”`)
  } catch {
    canvasTemplates.value = previousTemplates
    flash('模板删除失败')
  }
}
function templatePreview(template: CanvasTemplate): TemplatePreview {
  if (!template.nodes.length) return { nodes: [], edges: [] }
  const previewWidth = 280
  const previewHeight = 150
  const padding = 12
  const minX = Math.min(...template.nodes.map((node) => node.x))
  const minY = Math.min(...template.nodes.map((node) => node.y))
  const maxX = Math.max(...template.nodes.map((node) => node.x + node.width))
  const maxY = Math.max(
    ...template.nodes.map((node) => node.y + (node.height || 180)),
  )
  const sourceWidth = Math.max(1, maxX - minX)
  const sourceHeight = Math.max(1, maxY - minY)
  const scale = Math.min(
    (previewWidth - padding * 2) / sourceWidth,
    (previewHeight - padding * 2) / sourceHeight,
  )
  const offsetX = (previewWidth - sourceWidth * scale) / 2
  const offsetY = (previewHeight - sourceHeight * scale) / 2
  const previewNodes = template.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    x: offsetX + (node.x - minX) * scale,
    y: offsetY + (node.y - minY) * scale,
    width: Math.max(9, node.width * scale),
    height: Math.max(7, (node.height || 180) * scale),
  }))
  const centers = new Map(
    previewNodes.map((node) => [
      node.id,
      { x: node.x + node.width / 2, y: node.y + node.height / 2 },
    ]),
  )
  return {
    nodes: previewNodes,
    edges: template.edges.flatMap((edge) => {
      const source = centers.get(edge.source)
      const target = centers.get(edge.target)
      return source && target
        ? [{ id: edge.id, x1: source.x, y1: source.y, x2: target.x, y2: target.y }]
        : []
    }),
  }
}
function useCanvasTemplate(template: CanvasTemplate) {
  if (!template.nodes.length) {
    flash('这个模板没有可使用的控件')
    return
  }
  checkpoint()
  const idMap = new Map(
    template.nodes.map((node) => [node.id, `node-${uid()}-${Date.now()}`]),
  )
  const minX = Math.min(...template.nodes.map((node) => node.x))
  const minY = Math.min(...template.nodes.map((node) => node.y))
  const maxX = Math.max(...template.nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...template.nodes.map((node) => node.y + (node.height || 180)))
  const templateCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const canvasRect = canvasEl.value?.getBoundingClientRect()
  const viewportCenter = screenToCanvas(
    (canvasRect?.left || 0) + (canvasRect?.width || canvasSize.width) / 2,
    (canvasRect?.top || 0) + (canvasRect?.height || canvasSize.height) / 2,
  )
  const now = Date.now()
  const copiedNodes = cloneValue(template.nodes).map((node, index) => {
    return {
      ...node,
      id: idMap.get(node.id)!,
      x: node.x - templateCenter.x + viewportCenter.x,
      y: node.y - templateCenter.y + viewportCenter.y,
      createdAt: now + index,
    }
  })
  const copiedEdges = cloneValue(template.edges)
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: `edge-${uid()}-${Date.now()}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
    }))
  nodes.value.push(...copiedNodes)
  edges.value.push(...copiedEdges)
  selected.value = copiedNodes.map((node) => node.id)
  selectedEdge.value = null
  showTemplatePanel.value = false
  flash(`已使用模板“${template.name}”`)
}
function restore(snapshot: Snapshot) {
  nodes.value = JSON.parse(JSON.stringify(snapshot.nodes))
  edges.value = JSON.parse(JSON.stringify(snapshot.edges))
  selected.value = []
}
function undo() {
  const state = history.value.pop()
  if (!state) return
  future.value.push(cloneSnapshot())
  restore(state)
}
function redo() {
  const state = future.value.pop()
  if (!state) return
  history.value.push(cloneSnapshot())
  restore(state)
}
function flash(message: string) {
  toast.value = message
  window.setTimeout(() => (toast.value = ''), 1800)
}
function addNode(kind: NodeKind, offset = 0) {
  checkpoint()
  const defaults: Record<NodeKind, Partial<CanvasNode>> = {
    text: { title: '创意提示词', content: '' },
    image: { title: '参考图片', content: '拖入图片或点击上传' },
    video: { title: '视频素材', content: '等待添加视频素材' },
    audio: { title: '音频素材', content: '00:00  ━━━━━━━━━  00:00' },
    config: { title: '图像生成', content: '电影感产品摄影，柔和侧光', status: 'idle' },
  }
  const center = screenToCanvas(window.innerWidth * 0.47 + offset, window.innerHeight * 0.5 + offset)
  const node: CanvasNode = {
    id: `node-${uid()}`,
    kind,
    title: defaults[kind].title!,
    content: defaults[kind].content!,
    status: defaults[kind].status,
    x: center.x - 140,
    y: center.y - 90,
    width: kind === 'config' ? 310 : 280,
    version: 1,
    createdAt: Date.now(),
    imageWidth: kind === 'image' ? 1024 : undefined,
    imageHeight: kind === 'image' ? 1024 : undefined,
    imageAutoSize: kind === 'image' ? true : undefined,
    imageCount: kind === 'image' ? 1 : undefined,
  }
  nodes.value.push(node)
  selected.value = [node.id]
}
function screenToCanvas(x: number, y: number) {
  const rect = canvasEl.value?.getBoundingClientRect() || { left: 0, top: 0 }
  return {
    x: (x - rect.left - viewport.x) / viewport.zoom,
    y: (y - rect.top - viewport.y) / viewport.zoom,
  }
}
function startNodeDrag(event: PointerEvent, node: CanvasNode) {
  if (event.button !== 0) return
  if (
    (event.target as HTMLElement).closest(
      'button, input, textarea, select, .node-prompt-editor, .generation-result, .resize-handle, .result-splitter',
    )
  )
    return
  event.preventDefault()
  event.stopPropagation()
  if (linkingFrom.value) {
    const source = linkingFrom.value
    linkingFrom.value = null
    createConnection(source, node.id)
    return
  }
  if (!selected.value.includes(node.id)) selected.value = [node.id]
  checkpoint()
  const captureTarget = event.currentTarget as HTMLElement
  captureTarget.setPointerCapture(event.pointerId)
  drag = {
    id: node.id,
    startX: event.clientX,
    startY: event.clientY,
    nodeX: node.x,
    nodeY: node.y,
    vx: viewport.x,
    vy: viewport.y,
    pointerId: event.pointerId,
    captureTarget,
    openImageEditorId: (event.target as HTMLElement).closest('.image-preview.editable')
      ? node.id
      : undefined,
    moved: false,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag, { once: true })
  window.addEventListener('pointercancel', endDrag, { once: true })
}
function startCanvasDrag(event: PointerEvent) {
  const target = event.target as HTMLElement
  if (
    target.closest(
      '.canvas-node,.selection-actions,.edge-inspector,.history-controls,.view-controls,.minimap,button,input,textarea,select',
    )
  )
    return
  selected.value = []
  selectedEdge.value = null
  if (event.button !== 0 && event.button !== 1) return
  event.preventDefault()
  const captureTarget = event.currentTarget as HTMLElement
  captureTarget.setPointerCapture(event.pointerId)
  drag = {
    startX: event.clientX,
    startY: event.clientY,
    vx: viewport.x,
    vy: viewport.y,
    pointerId: event.pointerId,
    captureTarget,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag, { once: true })
  window.addEventListener('pointercancel', endDrag, { once: true })
}
function onPointerMove(event: PointerEvent) {
  if (!drag) return
  if (drag.id) {
    if (
      Math.abs(event.clientX - drag.startX) > 4 ||
      Math.abs(event.clientY - drag.startY) > 4
    )
      drag.moved = true
    const node = nodeMap.value.get(drag.id)
    if (node) {
      node.x = drag.nodeX! + (event.clientX - drag.startX) / viewport.zoom
      node.y = drag.nodeY! + (event.clientY - drag.startY) / viewport.zoom
    }
  } else {
    viewport.x = drag.vx + event.clientX - drag.startX
    viewport.y = drag.vy + event.clientY - drag.startY
  }
}
function endDrag() {
  const imageEditorNodeId =
    drag?.openImageEditorId && !drag.moved ? drag.openImageEditorId : undefined
  if (drag?.captureTarget.hasPointerCapture(drag.pointerId))
    drag.captureTarget.releasePointerCapture(drag.pointerId)
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (imageEditorNodeId) {
    const node = nodeMap.value.get(imageEditorNodeId)
    if (node) openImageEditor(node)
  }
}
function startNodeResize(event: PointerEvent, node: CanvasNode, corner: ResizeCorner) {
  event.preventDefault()
  event.stopPropagation()
  const element = (event.currentTarget as HTMLElement).closest<HTMLElement>('.canvas-node')
  if (!element) return
  if (!selected.value.includes(node.id)) selected.value = [node.id]
  checkpoint()
  const renderedHeight = element.getBoundingClientRect().height / viewport.zoom
  resize = {
    id: node.id,
    corner,
    startX: event.clientX,
    startY: event.clientY,
    nodeX: node.x,
    nodeY: node.y,
    width: node.width,
    height: node.height || renderedHeight,
  }
  node.height = resize.height
  window.addEventListener('pointermove', onNodeResize)
  window.addEventListener('pointerup', endNodeResize, { once: true })
}
function onNodeResize(event: PointerEvent) {
  if (!resize) return
  const node = nodeMap.value.get(resize.id)
  if (!node) return
  const deltaX = (event.clientX - resize.startX) / viewport.zoom
  const deltaY = (event.clientY - resize.startY) / viewport.zoom
  const fromWest = resize.corner.includes('w')
  const fromNorth = resize.corner.includes('n')
  const requestedWidth = resize.width + (fromWest ? -deltaX : deltaX)
  const requestedHeight = resize.height + (fromNorth ? -deltaY : deltaY)
  const nextWidth = Math.max(220, requestedWidth)
  const nextHeight = Math.max(160, requestedHeight)
  node.width = nextWidth
  node.height = nextHeight
  node.x = fromWest ? resize.nodeX + resize.width - nextWidth : resize.nodeX
  node.y = fromNorth ? resize.nodeY + resize.height - nextHeight : resize.nodeY
}
function endNodeResize() {
  resize = null
  window.removeEventListener('pointermove', onNodeResize)
}
function startResultEditing(node: CanvasNode) {
  checkpoint()
  editingResultId.value = node.id
}
function finishResultEditing(node: CanvasNode) {
  if (editingResultId.value !== node.id) return
  editingResultId.value = null
  markNodeChanged(node)
}
function nodePlaceholder(node: CanvasNode) {
  if (node.kind !== 'text') return undefined
  return node.hiddenInstruction === IMAGE_TO_PROMPT_INSTRUCTION
    ? IMAGE_TO_PROMPT_INSTRUCTION
    : '描述你的创意想法，或粘贴一段需要处理的文本…'
}
function startResultSplit(event: PointerEvent, node: CanvasNode) {
  event.preventDefault()
  event.stopPropagation()
  const nodeElement = (event.currentTarget as HTMLElement).closest<HTMLElement>('.canvas-node')
  const inputElement = nodeElement?.querySelector<HTMLElement>('.node-prompt-editor')
  if (!nodeElement || !inputElement) return
  checkpoint()
  const totalHeight = nodeElement.getBoundingClientRect().height / viewport.zoom
  const currentInputHeight = inputElement.getBoundingClientRect().height / viewport.zoom
  node.height = node.height || totalHeight
  node.inputHeight = node.inputHeight || currentInputHeight
  resultSplit = {
    id: node.id,
    startY: event.clientY,
    inputHeight: node.inputHeight,
    totalHeight,
  }
  window.addEventListener('pointermove', onResultSplit)
  window.addEventListener('pointerup', endResultSplit, { once: true })
}
function onResultSplit(event: PointerEvent) {
  if (!resultSplit) return
  const node = nodeMap.value.get(resultSplit.id)
  if (!node) return
  const deltaY = (event.clientY - resultSplit.startY) / viewport.zoom
  const maximum = Math.max(60, resultSplit.totalHeight - 150)
  node.inputHeight = Math.min(maximum, Math.max(60, resultSplit.inputHeight + deltaY))
}
function endResultSplit() {
  resultSplit = null
  window.removeEventListener('pointermove', onResultSplit)
}
function onWheel(event: WheelEvent) {
  if (
    (event.target as HTMLElement).closest(
      'input, textarea, select, .node-prompt-editor, .generation-result, .result-editor, .image-node-settings',
    )
  )
    return
  event.preventDefault()
  const rect = canvasEl.value!.getBoundingClientRect()
  const px = event.clientX - rect.left
  const py = event.clientY - rect.top
  const old = viewport.zoom
  const next = Math.min(2, Math.max(0.35, old * (event.deltaY > 0 ? 0.9 : 1.1)))
  viewport.x = px - ((px - viewport.x) / old) * next
  viewport.y = py - ((py - viewport.y) / old) * next
  viewport.zoom = next
}
function resetView() {
  viewport.x = 50
  viewport.y = 40
  viewport.zoom = 1
}
function updateCanvasSize() {
  if (!canvasEl.value) return
  canvasSize.width = canvasEl.value.clientWidth
  canvasSize.height = canvasEl.value.clientHeight
}
function deleteSelected() {
  if (selectedEdge.value) {
    checkpoint()
    edges.value = edges.value.filter((edge) => edge.id !== selectedEdge.value)
    selectedEdge.value = null
    flash('连线已删除，上游输入已停止参与生成')
    return
  }
  if (!selected.value.length) return
  checkpoint()
  const ids = new Set(selected.value)
  nodes.value = nodes.value.filter((node) => !ids.has(node.id))
  edges.value = edges.value.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target))
  if (imageEditNodeId.value && ids.has(imageEditNodeId.value)) imageEditNodeId.value = null
  selected.value = []
}
function hasPath(from: string, to: string, visited = new Set<string>()): boolean {
  if (from === to) return true
  if (visited.has(from)) return false
  visited.add(from)
  return edges.value
    .filter((edge) => edge.enabled && edge.source === from)
    .some((edge) => hasPath(edge.target, to, visited))
}
function createConnection(source: string, target: string) {
  if (!nodeMap.value.has(source) || !nodeMap.value.has(target)) return flash('节点不存在，无法连接')
  if (source === target) return flash('不允许节点连接自身')
  if (edges.value.some((edge) => edge.source === source && edge.target === target)) return flash('这两个节点已经连接')
  if (hasPath(target, source)) return flash('连接会形成循环依赖，已阻止')
  checkpoint()
  const order = edges.value.filter((edge) => edge.target === target).length + 1
  edges.value.push({
    id: `edge-${uid()}`,
    source,
    target,
    sourceHandle: 'output',
    targetHandle: 'input',
    order,
    enabled: true,
  })
  flash('已建立有向数据连接')
}
function connectTo(nodeId: string) {
  if (!linkingFrom.value) {
    linkingFrom.value = nodeId
    return flash('请点击下游节点，或拖动连线到目标节点任意位置')
  }
  createConnection(linkingFrom.value, nodeId)
  linkingFrom.value = null
}
function startConnection(event: PointerEvent, nodeId: string) {
  event.stopPropagation()
  const point = screenToCanvas(event.clientX, event.clientY)
  linkingFrom.value = nodeId
  linkingPointer.x = point.x
  linkingPointer.y = point.y
  window.addEventListener('pointermove', moveConnection)
  window.addEventListener('pointerup', finishConnection, { once: true })
}
function moveConnection(event: PointerEvent) {
  const point = screenToCanvas(event.clientX, event.clientY)
  linkingPointer.x = point.x
  linkingPointer.y = point.y
}
function finishConnection(event: PointerEvent) {
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.canvas-node')
  if (target?.dataset.nodeId && linkingFrom.value) createConnection(linkingFrom.value, target.dataset.nodeId)
  else flash('将连线拖到目标节点任意位置，或点击目标节点')
  linkingFrom.value = null
  window.removeEventListener('pointermove', moveConnection)
}
function edgePath(edge: Edge) {
  const source = nodeMap.value.get(edge.source)
  const target = nodeMap.value.get(edge.target)
  if (!source || !target) return ''
  const x1 = source.x + source.width
  const y1 = source.y + 82
  const x2 = target.x
  const y2 = target.y + 82
  const bend = Math.max(60, Math.abs(x2 - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}
function draftPath() {
  const source = linkingFrom.value ? nodeMap.value.get(linkingFrom.value) : undefined
  if (!source) return ''
  const x1 = source.x + source.width
  const y1 = source.y + 82
  const bend = Math.max(60, Math.abs(linkingPointer.x - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${linkingPointer.x - bend} ${linkingPointer.y}, ${linkingPointer.x} ${linkingPointer.y}`
}
function resolveMentionTokens(content: string, targetNodeId: string) {
  const upstream = upstreamFor(targetNodeId)
  const counts: Record<ServiceKind, number> = { text: 0, image: 0, video: 0, audio: 0 }
  const labels = new Map<string, string>()
  const kindNames: Record<ServiceKind, string> = {
    text: '文本',
    image: '图片',
    video: '视频',
    audio: '音频',
  }
  upstream.forEach((node) => {
    if (node.kind === 'config') return
    counts[node.kind] += 1
    labels.set(node.id, `${kindNames[node.kind]} ${counts[node.kind]}（${node.title}）`)
  })
  return content.replace(/@\[node:([^\]]+)\]/g, (_token, id: string) => {
    return labels.get(id) || '已断开的资源引用'
  })
}
function extractNodeContent(node: CanvasNode) {
  const base = { id: node.id, type: node.kind, title: node.title, version: node.version }
  if (node.kind === 'image')
    return {
      ...base,
      imageUrl: node.url || '',
      description: node.content,
      dimensions: `${node.imageWidth || 1024}x${node.imageHeight || 1024}`,
    }
  if (node.kind === 'video') return { ...base, videoUrl: node.url || '', description: node.content }
  if (node.kind === 'audio') return { ...base, audioUrl: node.url || '', transcript: node.content }
  if (node.kind === 'config')
    return {
      ...base,
      prompt: node.content,
      model: serviceForNode(node).model,
      result: node.resultText,
    }
  return { ...base, content: resolveMentionTokens(node.content, node.id) }
}
function upstreamFor(nodeId: string) {
  return edges.value
    .filter((edge) => edge.enabled && edge.target === nodeId)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return (nodeMap.value.get(a.source)?.y || 0) - (nodeMap.value.get(b.source)?.y || 0)
    })
    .map((edge) => nodeMap.value.get(edge.source))
    .filter((node): node is CanvasNode => Boolean(node))
}
function formatUpstreamInputs(upstream: CanvasNode[]) {
  const formatted = upstream
    .map((node, index) => {
      const data = extractNodeContent(node)
      let content = ''
      if (node.kind === 'image') {
        content = [
          `图片说明：${node.content || '无'}`,
          `图片尺寸：${node.imageWidth || 1024} × ${node.imageHeight || 1024}`,
          node.url ? '图片数据：已作为独立视觉输入传递，不在文本提示词中重复编码' : '图片数据：无',
        ].join('\n')
      } else if (node.kind === 'video') {
        content = `视频说明：${node.content || '无'}\n视频数据：${node.url ? '已附加，不在文本提示词中重复编码' : '无'}`
      } else if (node.kind === 'audio') {
        content = `音频转写：${node.content || '无'}\n音频数据：${node.url ? '已附加，不在文本提示词中重复编码' : '无'}`
      } else if (node.kind === 'config') {
        content = `配置提示词：${node.content}\n模型：${serviceForNode(node).model}`
      } else {
        content = resolveMentionTokens(node.content, node.id)
      }
      if (content.length > MAX_NODE_TEXT_CHARS)
        content = `${content.slice(0, MAX_NODE_TEXT_CHARS)}\n[该节点内容过长，已截断]`
      return [
        `上游输入 ${index + 1}：`,
        `节点名称：${node.title}`,
        `节点类型：${data.type}`,
        `内容：${content}`,
      ].join('\n')
    })
    .join('\n\n')
  return formatted.length > MAX_FORMATTED_INPUT_CHARS
    ? `${formatted.slice(0, MAX_FORMATTED_INPUT_CHARS)}\n[上游输入总长度过长，已截断]`
    : formatted
}
function buildGenerationContext(node: CanvasNode) {
  const upstream = upstreamFor(node.id)
  const formattedInputs = formatUpstreamInputs(upstream)
  const resolvedNodeContent = resolveMentionTokens(node.content, node.id)
  const messages: Array<{ role: 'system' | 'user'; content: string | unknown[] }> = [
    { role: 'system', content: settings.systemPrompt },
    { role: 'system', content: `当前画布要求：\n${settings.canvasPrompt}` },
  ]
  const multimodal: unknown[] = [{ type: 'text', text: `以下是当前节点的直接上游输入：\n\n${formattedInputs || '（无上游输入）'}` }]
  upstream
    .filter((item) => item.kind === 'image' && item.url)
    .forEach((item) => multimodal.push({ type: 'image_url', image_url: { url: item.url } }))
  const hiddenInstruction =
    node.hiddenInstruction || (node.kind === 'text' ? TEXT_TO_IMAGE_PROMPT_INSTRUCTION : '')
  multimodal.push({
    type: 'text',
    text: hiddenInstruction
      ? `当前节点隐藏任务：\n${hiddenInstruction}\n\n用户输入内容：\n${resolvedNodeContent}`
      : `当前节点任务：\n${resolvedNodeContent}`,
  })
  messages.push({ role: 'user', content: multimodal })
  return { upstream, formattedInputs, messages }
}
function isNodeStale(node: CanvasNode) {
  const snapshot = node.lastGeneration
  if (!snapshot) return false
  return snapshot.inputNodeIds.some((id) => nodeMap.value.get(id)?.version !== snapshot.inputVersions[id])
}
function markNodeChanged(node: CanvasNode) {
  node.version = (node.version || 0) + 1
  node.status = node.lastGeneration ? 'stale' : node.status
}
function incomingEdges(nodeId: string) {
  return edges.value.filter((edge) => edge.target === nodeId).sort((a, b) => a.order - b.order)
}
function moveEdge(edge: Edge, direction: -1 | 1) {
  const list = incomingEdges(edge.target)
  const index = list.findIndex((item) => item.id === edge.id)
  const swap = list[index + direction]
  if (!swap) return
  const old = edge.order
  edge.order = swap.order
  swap.order = old
}
function clearCanvas() {
  if (!nodes.value.length || !window.confirm('确定清空当前画布中的所有节点和连线吗？')) return
  checkpoint()
  nodes.value = []
  edges.value = []
  flash('画布已清空')
}
function serviceForNode(node: CanvasNode) {
  const kind = node.kind === 'config' ? 'text' : node.kind
  const channels = channelsFor(kind)
  return channels.find((channel) => channel.id === node.modelChannelId) || channels[0]!
}
function nodeServiceKind(node: CanvasNode): ServiceKind {
  return node.kind === 'config' ? 'text' : node.kind
}
function setNodeModelChannel(node: CanvasNode, channelId: string) {
  if (node.modelChannelId === channelId) return
  node.modelChannelId = channelId
  markNodeChanged(node)
}
function modelChannelLabel(channel: ModelChannel) {
  return channel.model.trim() ? `${channel.name} · ${channel.model}` : channel.name
}
function configuredApiBase(service: ModelServiceConfig) {
  return service.baseUrl.trim().replace(/\/+$/, '')
}
function imageAspect(node: CanvasNode) {
  return `${Math.max(1, node.imageWidth || 1024)} / ${Math.max(1, node.imageHeight || 1024)}`
}
function aspectLabel(node: CanvasNode) {
  if (node.imageAutoSize) return '自动'
  const width = Math.max(1, node.imageWidth || 1024)
  const height = Math.max(1, node.imageHeight || 1024)
  const divisor = (a: number, b: number): number => (b ? divisor(b, a % b) : a)
  const gcd = divisor(width, height)
  return `${Math.round(width / gcd)}:${Math.round(height / gcd)}`
}
function editAspectLabel() {
  if (imageEditDraft.imageAutoSize) return '自动'
  const width = Math.max(1, imageEditDraft.imageWidth)
  const height = Math.max(1, imageEditDraft.imageHeight)
  const divisor = (a: number, b: number): number => (b ? divisor(b, a % b) : a)
  const gcd = divisor(width, height)
  return `${Math.round(width / gcd)}:${Math.round(height / gcd)}`
}
function setImageAuto(node: CanvasNode) {
  node.imageAutoSize = true
  markNodeChanged(node)
}
function setImageRatio(node: CanvasNode, width: number, height: number) {
  node.imageAutoSize = false
  node.imageWidth = width
  node.imageHeight = height
  markNodeChanged(node)
}
function normalizeImageDimensions(node: CanvasNode) {
  node.imageAutoSize = false
  node.imageWidth = Math.min(4096, Math.max(64, Math.round(node.imageWidth || 1024)))
  node.imageHeight = Math.min(4096, Math.max(64, Math.round(node.imageHeight || 1024)))
  markNodeChanged(node)
}
function normalizedImageCount(node: CanvasNode) {
  return Math.min(8, Math.max(1, Math.round(node.imageCount || 1)))
}
function normalizeImageCount(node: CanvasNode) {
  node.imageCount = normalizedImageCount(node)
  markNodeChanged(node)
}
function setImageEditAuto() {
  imageEditDraft.imageAutoSize = true
}
function setImageEditRatio(width: number, height: number) {
  imageEditDraft.imageAutoSize = false
  imageEditDraft.imageWidth = width
  imageEditDraft.imageHeight = height
}
function normalizeImageEditDimensions() {
  imageEditDraft.imageAutoSize = false
  imageEditDraft.imageWidth = Math.min(
    4096,
    Math.max(64, Math.round(imageEditDraft.imageWidth || 1024)),
  )
  imageEditDraft.imageHeight = Math.min(
    4096,
    Math.max(64, Math.round(imageEditDraft.imageHeight || 1024)),
  )
}
function normalizeImageEditCount() {
  imageEditDraft.imageCount = Math.min(
    8,
    Math.max(1, Math.round(imageEditDraft.imageCount || 1)),
  )
}
function supportedImageSize(node: CanvasNode) {
  if (node.imageAutoSize) return 'auto'
  const ratio = (node.imageWidth || 1024) / (node.imageHeight || 1024)
  if (ratio > 1.2) return '1536x1024'
  if (ratio < 0.83) return '1024x1536'
  return '1024x1024'
}
function onImageLoaded(event: Event, node: CanvasNode) {
  if (!node.imageAutoSize) return
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth || !image.naturalHeight) return
  node.imageWidth = image.naturalWidth
  node.imageHeight = image.naturalHeight
}
async function testProviderConnection(
  kind: ServiceKind = activeServiceKind.value,
  channelId = activeModelChannelIds[kind],
) {
  const service = channelsFor(kind).find((channel) => channel.id === channelId) || channelsFor(kind)[0]!
  const connectionTest = connectionState(service.id)
  if (!service.apiKey.trim()) {
    connectionTest.status = 'error'
    connectionTest.message = '请先填写该服务的 API Key'
    return
  }
  connectionTest.status = 'testing'
  connectionTest.message = '正在连接模型服务…'
  try {
    const response = await fetch(`${configuredApiBase(service)}/models`, {
      headers: { Authorization: `Bearer ${service.apiKey.trim()}` },
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error?.message || `连接失败（HTTP ${response.status}）`)
    const models = Array.isArray(payload?.data) ? payload.data : []
    const available = models.some((item: { id?: string }) => item.id === service.model)
    connectionTest.status = 'success'
    connectionTest.message = `连接成功，读取到 ${models.length} 个模型；当前模型${available ? '可用' : '未在列表中找到'}`
  } catch (error) {
    connectionTest.status = 'error'
    connectionTest.message = error instanceof Error ? error.message : '连接失败，请检查地址和密钥'
  }
}
function writeImageResult(node: CanvasNode, imageUrl: string, prompt = '') {
  node.url = imageUrl
  if (prompt) node.imagePrompt = prompt
  node.content = `由 ${serviceForNode(node).model} 生成 · ${new Date().toLocaleTimeString()}`
  node.version = (node.version || 0) + 1
}
function buildConfiguredImagePrompt(
  node: CanvasNode,
  context: ReturnType<typeof buildGenerationContext>,
) {
  const requestedWidth = node.imageWidth || 1024
  const requestedHeight = node.imageHeight || 1024
  const fixedSections = [
    `系统提示词：\n${settings.systemPrompt.slice(0, 6000)}`,
    `当前画布要求：\n${settings.canvasPrompt.slice(0, 4000)}`,
    '当前节点任务：\n根据所有直接上游输入生成一张图片。文本节点内容是生图提示词，图片节点内容是视觉参考。',
    node.imageAutoSize
      ? '目标画面规格：自动。请根据提示词内容选择最合适的横向、竖向或方形构图，保留完整主体，不要裁切关键内容。'
      : `目标画面规格：${requestedWidth} × ${requestedHeight}，宽高比 ${aspectLabel(node)}。请严格按照该构图比例组织画面，保留完整主体，不要裁切关键内容。`,
  ]
  const fixedLength = fixedSections.join('\n\n').length
  const upstreamBudget = Math.max(0, MAX_IMAGE_PROMPT_CHARS - fixedLength - 30)
  const upstreamText = context.formattedInputs
    ? context.formattedInputs.slice(0, upstreamBudget)
    : '（无）'
  return [
    fixedSections[0],
    fixedSections[1],
    `直接上游输入：\n${upstreamText}`,
    fixedSections[2],
    fixedSections[3],
  ].join('\n\n')
}
async function callConfiguredImage(
  node: CanvasNode,
  context: ReturnType<typeof buildGenerationContext>,
  ownReferenceUrl = '',
  promptOverride = '',
  includeUpstreamReferences = true,
) {
  const service = serviceForNode(node)
  const apiBase = configuredApiBase(service)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${service.apiKey}` }
  const upstreamReferences = includeUpstreamReferences
    ? context.upstream
        .filter((item) => item.kind === 'image' && item.url)
        .map((item) => ({ title: item.title, url: item.url! }))
    : []
  const referenceImages = [
    ...(ownReferenceUrl ? [{ title: `${node.title}（当前图片）`, url: ownReferenceUrl }] : []),
    ...upstreamReferences,
  ].filter(
    (reference, index, list) =>
      list.findIndex((candidate) => candidate.url === reference.url) === index,
  )
  const prompt = (promptOverride || buildConfiguredImagePrompt(node, context)).slice(
    0,
    MAX_IMAGE_PROMPT_CHARS,
  )
  let response: Response
  if (referenceImages.length) {
    const formData = new FormData()
    formData.append('model', service.model)
    formData.append('prompt', prompt)
    formData.append('size', supportedImageSize(node))
    for (const [index, reference] of referenceImages.entries()) {
      let imageResponse: Response
      try {
        imageResponse = await fetch(reference.url)
      } catch {
        throw new Error(`无法读取参考图片“${reference.title}”，请重新从本地上传后再试`)
      }
      if (!imageResponse.ok) throw new Error(`无法读取参考图片“${reference.title}”`)
      const blob = await imageResponse.blob()
      const extension =
        blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
      formData.append('image[]', blob, `reference-${index + 1}.${extension}`)
    }
    response = await fetch(`${apiBase}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${service.apiKey}` },
      body: formData,
    })
  } else {
    response = await fetch(`${apiBase}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: service.model, prompt, size: supportedImageSize(node) }),
    })
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.error?.message || `图像服务返回 ${response.status}`)
  }
  const payload = await response.json()
  const item = payload.data?.[0]
  const imageUrl = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : '')
  if (!imageUrl) throw new Error('图像服务未返回可用结果')
  return { imageUrl, prompt } satisfies GeneratedImageResult
}
async function callConfiguredModel(node: CanvasNode, context: ReturnType<typeof buildGenerationContext>) {
  const service = serviceForNode(node)
  const apiBase = configuredApiBase(service)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${service.apiKey}` }
  const body: Record<string, unknown> = {
    model: service.model,
    messages: context.messages,
    max_completion_tokens: service.maxTokens,
  }
  if (!/^gpt-5|^o\d/i.test(service.model)) body.temperature = service.temperature
  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.error?.message || `模型服务返回 ${response.status}`)
  }
  const payload = await response.json()
  return payload.choices?.[0]?.message?.content || '模型已完成请求，但未返回文本内容'
}
function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取音频服务返回的文件'))
    reader.readAsDataURL(blob)
  })
}
function buildAudioSpeechInput(
  node: CanvasNode,
  context: ReturnType<typeof buildGenerationContext>,
) {
  const upstreamText = context.upstream
    .map((item) => {
      if (item.kind === 'text') {
        return (item.resultText || resolveMentionTokens(item.content, item.id)).trim()
      }
      if (item.kind === 'audio') return item.content.trim()
      if (item.kind === 'image' || item.kind === 'video') return item.content.trim()
      return item.content.trim()
    })
    .filter(Boolean)
  const ownText = node.content.trim()
  const ownIsPlaceholder =
    !ownText ||
    ownText.startsWith('00:00') ||
    /(?:MB|KB)\s*·\s*本地资产/.test(ownText)
  const input = [...upstreamText, ...(ownIsPlaceholder ? [] : [ownText])].join('\n\n').trim()
  if (!input) throw new Error('请先连接包含朗读内容的文本节点')
  if (input.length > 4096)
    throw new Error(`音频朗读内容过长（${input.length} 字），当前接口最多支持 4096 字`)
  return input
}
async function callConfiguredAudio(
  node: CanvasNode,
  context: ReturnType<typeof buildGenerationContext>,
) {
  const service = serviceForNode(node)
  const input = buildAudioSpeechInput(node, context)
  const response = await fetch(`${configuredApiBase(service)}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${service.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: service.model,
      input,
      voice: 'alloy',
      response_format: 'mp3',
    }),
  })
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    const error = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null
    const message =
      error?.error?.message ||
      error?.message ||
      (await response.text().catch(() => '')) ||
      `音频服务返回 ${response.status}`
    throw new Error(message)
  }
  const contentType = response.headers.get('content-type') || 'audio/mpeg'
  if (contentType.includes('application/json')) {
    const payload = await response.json()
    const audioUrl =
      payload?.url ||
      payload?.data?.[0]?.url ||
      (payload?.audio ? `data:audio/mpeg;base64,${payload.audio}` : '')
    if (!audioUrl) throw new Error('音频服务未返回可播放的音频')
    return { audioUrl, input }
  }
  const blob = await response.blob()
  if (!blob.size) throw new Error('音频服务返回了空文件')
  const audioUrl = await blobToDataUrl(
    blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' }),
  )
  return { audioUrl, input }
}
function createImageBatchResultNodes(
  source: CanvasNode,
  imageResults: GeneratedImageResult[],
  snapshot: GenerationSnapshot,
) {
  const verticalGap = 28
  const previewHeight =
    source.width * ((source.imageHeight || 1024) / Math.max(1, source.imageWidth || 1024))
  const nodeHeight = source.height || Math.max(250, previewHeight + 115)
  imageResults.forEach((result, index) => {
    const child: CanvasNode = {
      id: `node-${uid()}`,
      kind: 'image',
      title: `${source.title} · 结果 ${index + 2}`,
      x: source.x + source.width + 110,
      y: source.y + index * (nodeHeight + verticalGap),
      width: source.width,
      height: source.height,
      content: '',
      status: 'success',
      version: 1,
      createdAt: Date.now() + index,
      imageWidth: source.imageWidth || 1024,
      imageHeight: source.imageHeight || 1024,
      imageAutoSize: source.imageAutoSize ?? true,
      imageCount: 1,
      modelChannelId: source.modelChannelId,
      lastGeneration: JSON.parse(JSON.stringify(snapshot)),
      resultText: `已通过 ${serviceForNode(source).model} 生成图像`,
    }
    writeImageResult(child, result.imageUrl, result.prompt)
    nodes.value.push(child)
  })
}
function isGeneratedImage(node: CanvasNode) {
  return Boolean(
    node.kind === 'image' &&
      node.url &&
      (node.imagePrompt || node.lastGeneration || node.resultText?.startsWith('已通过')),
  )
}
function openImageEditor(node: CanvasNode) {
  if (!isGeneratedImage(node)) return
  if (node.status === 'running') {
    flash('当前图片正在生成，请完成后再修改')
    return
  }
  if (imageVariationRunningIds.value.includes(node.id)) {
    flash('这张图片正在生成修改结果')
    return
  }
  const fallbackPrompt = buildConfiguredImagePrompt(node, buildGenerationContext(node))
  Object.assign(imageEditDraft, {
    nodeId: node.id,
    prompt: node.imagePrompt || fallbackPrompt,
    imageWidth: node.imageWidth || 1024,
    imageHeight: node.imageHeight || 1024,
    imageAutoSize: node.imageAutoSize ?? true,
    imageCount: 1,
  })
  imageSettingsNodeId.value = null
  imageEditNodeId.value = node.id
  selected.value = [node.id]
}
function closeImageEditor() {
  imageEditNodeId.value = null
}
function isOutsideImageEditor(target: HTMLElement) {
  if (target.closest('.image-edit-panel')) return false
  const preview = target.closest('.image-preview.editable')
  const previewNodeId = preview?.closest<HTMLElement>('.canvas-node')?.dataset.nodeId
  return previewNodeId !== imageEditNodeId.value
}
function startImageEditorOutsidePointer(event: PointerEvent) {
  if (!imageEditNodeId.value || event.button !== 0) return
  const target = event.target as HTMLElement
  imageEditorOutsidePointer = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startedOutside: isOutsideImageEditor(target),
    moved: false,
  }
}
function moveImageEditorOutsidePointer(event: PointerEvent) {
  if (!imageEditorOutsidePointer || event.pointerId !== imageEditorOutsidePointer.pointerId)
    return
  if (
    Math.abs(event.clientX - imageEditorOutsidePointer.startX) > 4 ||
    Math.abs(event.clientY - imageEditorOutsidePointer.startY) > 4
  )
    imageEditorOutsidePointer.moved = true
}
function finishImageEditorOutsidePointer(event: PointerEvent) {
  const pointer = imageEditorOutsidePointer
  imageEditorOutsidePointer = null
  if (
    !pointer ||
    event.pointerId !== pointer.pointerId ||
    pointer.moved ||
    !pointer.startedOutside ||
    !isOutsideImageEditor(event.target as HTMLElement)
  )
    return
  closeImageEditor()
}
function cancelImageEditorOutsidePointer() {
  imageEditorOutsidePointer = null
}
function closeProjectMenuOutside(event: MouseEvent) {
  if (!showProjectMenu.value) return
  const target = event.target
  if (target instanceof Element && target.closest('.project-wrap')) return
  showProjectMenu.value = false
  showCanvasList.value = false
  showRenameCanvas.value = false
}
function closeAudioMenuOutside(event: MouseEvent) {
  if (!audioMenuNodeId.value) return
  const target = event.target
  if (target instanceof Element && target.closest('.audio-menu-wrap')) return
  audioMenuNodeId.value = null
}
function closeAudioVolumeOutside(event: PointerEvent) {
  if (!audioVolumeNodeId.value) return
  const target = event.target
  if (target instanceof Element && target.closest('.audio-volume')) return
  audioVolumeNodeId.value = null
}
function audioState(node: CanvasNode) {
  if (!audioPlaybackStates[node.id]) {
    audioPlaybackStates[node.id] = { currentTime: 0, duration: 0, playing: false, muted: false }
  }
  return audioPlaybackStates[node.id]!
}
function audioElementFromEvent(event: Event) {
  return (event.currentTarget as HTMLElement)
    .closest<HTMLElement>('.canvas-node')
    ?.querySelector<HTMLAudioElement>('audio')
}
function formatAudioTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
function audioProgressPercent(node: CanvasNode) {
  const state = audioState(node)
  if (!state.duration) return 0
  return Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100))
}
function syncAudioMetadata(event: Event, node: CanvasNode) {
  const audio = event.currentTarget as HTMLAudioElement
  const state = audioState(node)
  state.duration = Number.isFinite(audio.duration) ? audio.duration : 0
  audio.playbackRate = node.audioPlaybackRate || 1
  audio.volume = node.audioVolume ?? 1
}
function syncAudioProgress(event: Event, node: CanvasNode) {
  const audio = event.currentTarget as HTMLAudioElement
  const state = audioState(node)
  state.currentTime = audio.currentTime
  state.duration = Number.isFinite(audio.duration) ? audio.duration : state.duration
}
async function toggleAudioPlayback(event: Event, node: CanvasNode) {
  const audio = audioElementFromEvent(event)
  if (!audio || !node.url) return
  if (audio.paused) {
    try {
      await audio.play()
    } catch {
      flash('浏览器未能播放该音频文件')
    }
  } else {
    audio.pause()
  }
}
function seekAudio(event: Event, node: CanvasNode) {
  const audio = audioElementFromEvent(event)
  if (!audio) return
  const value = Number((event.currentTarget as HTMLInputElement).value)
  audio.currentTime = Number.isFinite(value) ? value : 0
  audioState(node).currentTime = audio.currentTime
}
function restartAudio(event: Event, node: CanvasNode) {
  const audio = audioElementFromEvent(event)
  if (!audio || !node.url) return
  audio.currentTime = 0
  void audio.play().catch(() => flash('浏览器未能播放该音频文件'))
  audioMenuNodeId.value = null
}
function setAudioPlaybackRate(event: Event, node: CanvasNode, rate: number) {
  const audio = audioElementFromEvent(event)
  node.audioPlaybackRate = rate
  if (audio) audio.playbackRate = rate
}
function setAudioVolume(event: Event, node: CanvasNode) {
  const audio = audioElementFromEvent(event)
  const volume = Math.min(1, Math.max(0, Number((event.currentTarget as HTMLInputElement).value)))
  node.audioVolume = volume
  if (audio) {
    audio.volume = volume
    audio.muted = false
    audioState(node).muted = false
  }
}
function toggleAudioMute(event: Event, node: CanvasNode) {
  const audio = audioElementFromEvent(event)
  if (!audio) return
  audioVolumeNodeId.value = node.id
  if (audio.muted || audio.volume === 0) {
    const restoredVolume = node.audioVolume && node.audioVolume > 0 ? node.audioVolume : 1
    node.audioVolume = restoredVolume
    audio.volume = restoredVolume
    audio.muted = false
    audioState(node).muted = false
  } else {
    node.audioVolume = audio.volume
    audio.muted = true
    audioState(node).muted = true
  }
}
function downloadAudio(node: CanvasNode) {
  if (!node.url) return flash('当前音频还没有可下载的文件')
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const link = document.createElement('a')
  link.href = node.url
  link.download = `${timestamp}.mp3`
  link.target = '_blank'
  link.click()
  audioMenuNodeId.value = null
  flash('音频下载已开始')
}
function applyFontScaleRules(rules: CSSRuleList) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const value = rule.style.fontSize
      if (/^\d+(?:\.\d+)?px$/.test(value)) {
        const originalSize = Number.parseFloat(value)
        const readableSize =
          originalSize <= 8
            ? 11
            : originalSize <= 10
              ? 12
              : originalSize <= 12
                ? 13
                : originalSize
        rule.style.fontSize = `calc(${readableSize}px * var(--font-scale))`
      }
    } else if ('cssRules' in rule) {
      applyFontScaleRules((rule as CSSGroupingRule).cssRules)
    }
  }
}
function enableFontScaling() {
  for (const styleSheet of Array.from(document.styleSheets)) {
    try {
      applyFontScaleRules(styleSheet.cssRules)
    } catch {
      // Cross-origin style sheets cannot be inspected; local application styles remain scalable.
    }
  }
}
function changeFontScale(direction: -1 | 1) {
  const next = Math.round((fontScale.value + direction * 0.1) * 10) / 10
  fontScale.value = Math.min(2, Math.max(0.9, next))
}
function resetFontScale() {
  fontScale.value = recommendedFontScale
}
function toggleImageSettings(node: CanvasNode) {
  imageEditNodeId.value = null
  imageSettingsNodeId.value = imageSettingsNodeId.value === node.id ? null : node.id
}
function createImageVariationResultNodes(
  source: CanvasNode,
  imageResults: GeneratedImageResult[],
  draft: ImageEditDraft,
) {
  const verticalGap = 28
  const previewHeight =
    source.width * (draft.imageHeight / Math.max(1, draft.imageWidth))
  const nodeHeight = Math.max(250, previewHeight + 115)
  const snapshotBase = {
    generatedAt: new Date().toISOString(),
    inputNodeIds: [source.id],
    inputVersions: { [source.id]: source.version },
    model: serviceForNode(source).model,
  }
  return imageResults.map((result, index) => {
    const child: CanvasNode = {
      id: `node-${uid()}`,
      kind: 'image',
      title: `${source.title} · 修改结果 ${index + 1}`,
      x: source.x + source.width + 110,
      y: source.y + index * (nodeHeight + verticalGap),
      width: source.width,
      content: '',
      status: 'success',
      version: 1,
      createdAt: Date.now() + index,
      imageWidth: draft.imageWidth,
      imageHeight: draft.imageHeight,
      imageAutoSize: draft.imageAutoSize,
      imageCount: 1,
      modelChannelId: source.modelChannelId,
      imagePrompt: result.prompt,
      lastGeneration: {
        ...snapshotBase,
        prompt: result.prompt,
      },
      resultText: `已通过 ${serviceForNode(source).model} 修改图像`,
    }
    writeImageResult(child, result.imageUrl, result.prompt)
    nodes.value.push(child)
    edges.value.push({
      id: `edge-${uid()}`,
      source: source.id,
      target: child.id,
      sourceHandle: 'output',
      targetHandle: 'input',
      order: 1,
      enabled: true,
    })
    return child
  })
}
async function runImageVariation(source: CanvasNode) {
  if (imageEditDraft.nodeId !== source.id || !source.url) return
  if (!imageEditDraft.imageAutoSize) normalizeImageEditDimensions()
  normalizeImageEditCount()
  const prompt = imageEditDraft.prompt.trim()
  if (!prompt) return flash('请先填写图片修改提示词')
  if (!serviceForNode(source).apiKey.trim()) return flash('请先配置所选图片模型的 API Key')
  const draft = { ...imageEditDraft, prompt }
  const requestNode: CanvasNode = {
    ...source,
    content: prompt,
    imageWidth: draft.imageWidth,
    imageHeight: draft.imageHeight,
    imageAutoSize: draft.imageAutoSize,
    imageCount: draft.imageCount,
  }
  const context = buildGenerationContext(source)
  imageEditNodeId.value = null
  imageVariationRunningIds.value = [...imageVariationRunningIds.value, source.id]
  flash(`正在生成 ${draft.imageCount} 张修改结果`)
  try {
    const imageResults: GeneratedImageResult[] = []
    for (let index = 0; index < draft.imageCount; index += 1) {
      imageResults.push(
        await callConfiguredImage(requestNode, context, source.url, prompt, false),
      )
    }
    checkpoint()
    const children = createImageVariationResultNodes(source, imageResults, draft)
    selected.value = children[0] ? [children[0].id] : [source.id]
    flash(`图片修改完成 · 新增 ${children.length} 张结果`)
  } catch (error) {
    Object.assign(imageEditDraft, draft)
    imageEditNodeId.value = source.id
    flash(error instanceof Error ? error.message : '图片修改失败，请检查图片服务配置')
  } finally {
    imageVariationRunningIds.value = imageVariationRunningIds.value.filter(
      (id) => id !== source.id,
    )
  }
}
async function runNode(node: CanvasNode) {
  if (node.kind === 'image' && imageVariationRunningIds.value.includes(node.id)) {
    flash('当前图片正在生成修改结果')
    return
  }
  const context = buildGenerationContext(node)
  const service = serviceForNode(node)
  const requestedPrompt = node.content
  node.status = 'running'
  try {
    if (service.apiKey && node.kind === 'image') {
      const imageCount = normalizedImageCount(node)
      node.imageCount = imageCount
      const ownReferenceUrl = node.url || ''
      const imageResults: GeneratedImageResult[] = []
      for (let index = 0; index < imageCount; index += 1) {
        imageResults.push(await callConfiguredImage(node, context, ownReferenceUrl))
      }
      const inputVersions = Object.fromEntries(
        context.upstream.map((item) => [item.id, item.version]),
      )
      const snapshot: GenerationSnapshot = {
        generatedAt: new Date().toISOString(),
        inputNodeIds: context.upstream.map((item) => item.id),
        inputVersions,
        prompt: imageResults[0]!.prompt,
        model: service.model,
      }
      writeImageResult(node, imageResults[0]!.imageUrl, imageResults[0]!.prompt)
      node.status = 'success'
      node.lastGeneration = snapshot
      node.resultText = `已通过 ${service.model} 生成 ${imageCount} 张图像`
      createImageBatchResultNodes(node, imageResults.slice(1), snapshot)
      flash(
        `生成完成 · ${imageCount} 张图像 · 使用 ${context.upstream.length} 个上游输入`,
      )
      return
    }
    if (service.apiKey && node.kind === 'audio') {
      const { audioUrl, input } = await callConfiguredAudio(node, context)
      const inputVersions = Object.fromEntries(
        context.upstream.map((item) => [item.id, item.version]),
      )
      node.url = audioUrl
      node.status = 'success'
      node.lastGeneration = {
        generatedAt: new Date().toISOString(),
        inputNodeIds: context.upstream.map((item) => item.id),
        inputVersions,
        prompt: input,
        model: service.model,
      }
      node.resultText = `已通过 ${service.model} 生成音频`
      node.version = (node.version || 0) + 1
      Object.assign(audioState(node), { currentTime: 0, duration: 0, playing: false, muted: false })
      flash(`音频生成完成 · 使用 ${context.upstream.length} 个上游输入`)
      return
    }
    const result = service.apiKey
      ? await callConfiguredModel(node, context)
      : await new Promise<string>((resolve) =>
          window.setTimeout(
            () =>
              resolve(
                context.upstream.length
                  ? `本地演示：已结合 ${context.upstream.length} 个直接上游输入（${context.upstream.map((item) => item.title).join('、')}）`
                  : '本地演示：已根据当前节点提示词生成结果（未使用其他画布节点）',
              ),
            900,
          ),
        )
    node.status = 'success'
    const inputVersions = Object.fromEntries(context.upstream.map((item) => [item.id, item.version]))
    node.lastGeneration = {
      generatedAt: new Date().toISOString(),
      inputNodeIds: context.upstream.map((item) => item.id),
      inputVersions,
      prompt: requestedPrompt,
      model: service.model,
    }
    node.resultText = result
    node.version = (node.version || 0) + 1
    flash(`生成完成 · 使用 ${context.upstream.length} 个上游输入`)
  } catch (error) {
    node.status = 'error'
    node.resultText = error instanceof Error ? error.message : '生成失败，请检查模型配置'
    flash('生成失败，请检查模型服务配置')
  }
}
function replaceSelectedImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  const node = selectedNode.value
  if (!file || !node || node.kind !== 'image') return
  const reader = new FileReader()
  reader.onload = () => {
    checkpoint()
    node.title = file.name
    node.url = String(reader.result)
    node.content = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · 本地资产`
    node.imagePrompt = undefined
    node.lastGeneration = undefined
    node.resultText = undefined
    node.status = 'idle'
    imageEditNodeId.value = null
    node.version = (node.version || 0) + 1
    flash('图片已替换，下游结果可能已过期')
  }
  reader.readAsDataURL(file)
  ;(event.target as HTMLInputElement).value = ''
}
function downloadImage(node: CanvasNode) {
  if (!node.url) return flash('当前图片是演示占位图，暂无原始文件')
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const timestamp = [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`,
  ].join('_')
  const link = document.createElement('a')
  link.href = node.url
  link.download = `${timestamp}.png`
  link.target = '_blank'
  link.click()
  flash('图片下载已开始')
}
function reversePrompt(imageNode: CanvasNode) {
  checkpoint()
  const target: CanvasNode = {
    id: `node-${uid()}`,
    kind: 'text',
    title: `${imageNode.title} · 反推提示词`,
    x: imageNode.x + imageNode.width + 150,
    y: imageNode.y,
    width: 330,
    content: IMAGE_TO_PROMPT_INSTRUCTION,
    hiddenInstruction: IMAGE_TO_PROMPT_INSTRUCTION,
    status: 'idle',
    version: 1,
    createdAt: Date.now(),
  }
  nodes.value.push(target)
  const order = edges.value.filter((edge) => edge.target === target.id).length + 1
  edges.value.push({
    id: `edge-${uid()}`,
    source: imageNode.id,
    target: target.id,
    sourceHandle: 'output',
    targetHandle: 'input',
    order,
    enabled: true,
  })
  selected.value = [target.id]
  flash('已创建反推提示词节点并连接图片，请点击“生成”开始')
}
function createImageFromText(textNode: CanvasNode) {
  checkpoint()
  const imageNode: CanvasNode = {
    id: `node-${uid()}`,
    kind: 'image',
    title: `${textNode.title} · 生图结果`,
    x: textNode.x + textNode.width + 150,
    y: textNode.y,
    width: 310,
    content: '自动比例 · 等待生成',
    status: 'idle',
    version: 1,
    createdAt: Date.now(),
    imageWidth: 1024,
    imageHeight: 1024,
    imageAutoSize: true,
    imageCount: 1,
  }
  nodes.value.push(imageNode)
  edges.value.push({
    id: `edge-${uid()}`,
    source: textNode.id,
    target: imageNode.id,
    sourceHandle: 'output',
    targetHandle: 'input',
    order: 1,
    enabled: true,
  })
  selected.value = [imageNode.id]
  flash('已创建图片节点并连接文本，请点击“生成”开始')
}
function replaceZoomedImage() {
  const node = zoomedImage.value
  if (!node) return
  selected.value = [node.id]
  zoomedImage.value = null
  replaceImageInput.value?.click()
}
function reversePromptZoomedImage() {
  const node = zoomedImage.value
  if (!node) return
  zoomedImage.value = null
  reversePrompt(node)
}
function normalizeCanvasName(value: string) {
  return value.trim().slice(0, 60) || '未命名画布'
}
function persistCanvasIndex() {
  localStorage.setItem(CANVAS_INDEX_KEY, JSON.stringify(canvasIndex.value))
}
function upsertCanvasIndex(
  id: string,
  name: string,
  updatedAt = Date.now(),
  nodeCount = 0,
  edgeCount = 0,
) {
  const normalizedName = normalizeCanvasName(
    name === '灵感工作流' ? '无限画布' : name,
  )
  const existing = canvasIndex.value.find((item) => item.id === id)
  if (existing) {
    existing.name = normalizedName
    existing.updatedAt = updatedAt
    existing.nodeCount = nodeCount
    existing.edgeCount = edgeCount
  } else {
    canvasIndex.value.push({ id, name: normalizedName, updatedAt, nodeCount, edgeCount })
  }
  canvasIndex.value.sort((a, b) => b.updatedAt - a.updatedAt)
  persistCanvasIndex()
}
function loadCanvasIndex() {
  const indexed = new Map<string, CanvasIndexItem>()
  try {
    const saved = JSON.parse(localStorage.getItem(CANVAS_INDEX_KEY) || '[]')
    if (Array.isArray(saved)) {
      saved.forEach((item: Partial<CanvasIndexItem>) => {
        if (!item.id) return
        indexed.set(item.id, {
          id: item.id,
          name: normalizeCanvasName(item.name || '未命名画布'),
          updatedAt: Number(item.updatedAt) || 0,
          nodeCount: Number(item.nodeCount) || 0,
          edgeCount: Number(item.edgeCount) || 0,
        })
      })
    }
  } catch {
    // Invalid legacy index is rebuilt from the individual canvas records below.
  }
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith('infinite:canvas:')) continue
    const id = key.slice('infinite:canvas:'.length)
    try {
      const payload = JSON.parse(localStorage.getItem(key) || '{}')
      const existing = indexed.get(id)
      indexed.set(id, {
        id,
        name: normalizeCanvasName(
          payload.name === '灵感工作流'
            ? '无限画布'
            : payload.name || existing?.name || '未命名画布',
        ),
        updatedAt: Number(payload.updatedAt) || existing?.updatedAt || 0,
        nodeCount: Array.isArray(payload.nodes) ? payload.nodes.length : existing?.nodeCount || 0,
        edgeCount: Array.isArray(payload.edges) ? payload.edges.length : existing?.edgeCount || 0,
      })
    } catch {
      // Corrupted canvas records remain untouched but are omitted from the picker.
    }
  }
  canvasIndex.value = [...indexed.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  persistCanvasIndex()
}
function formatCanvasUpdatedAt(value: number) {
  if (!value) return '较早保存'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
function saveNow(silent = false) {
  const updatedAt = Date.now()
  const payload = {
    name: canvasName.value,
    nodes: nodes.value,
    edges: edges.value,
    viewport,
    updatedAt,
  }
  localStorage.setItem(storageKey.value, JSON.stringify(payload))
  localStorage.setItem('infinite:last-canvas', canvasId.value)
  upsertCanvasIndex(
    canvasId.value,
    canvasName.value,
    updatedAt,
    nodes.value.length,
    edges.value.length,
  )
  const publicModelServices = Object.fromEntries(
    serviceOptions.map(({ kind }) => [
      kind,
      modelServices[kind].map((channel) => ({ ...channel, apiKey: '' })),
    ]),
  )
  const publicSettings = {
    ...settings,
    modelServices: publicModelServices,
    activeModelChannelIds: { ...activeModelChannelIds },
  }
  localStorage.setItem('infinite:settings', JSON.stringify(publicSettings))
  serviceOptions.forEach(({ kind }) => {
    modelServices[kind].forEach((channel) => {
      const key = `infinite:api-key:${kind}:${channel.id}`
      if (channel.apiKey) sessionStorage.setItem(key, channel.apiKey)
      else sessionStorage.removeItem(key)
    })
    sessionStorage.removeItem(`infinite:api-key:${kind}`)
  })
  sessionStorage.removeItem('infinite:api-key')
  if (!silent) flash('已保存到本地')
}
type ZipEntry = { name: string; data: Uint8Array }
type ExportedAsset = {
  nodeId: string
  nodeTitle: string
  path: string
  mimeType: string
  size: number
}
type SkippedExportAsset = {
  nodeId: string
  nodeTitle: string
  url: string
  reason: string
}
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})
function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function zipHeader(size: number) {
  return new Uint8Array(size)
}
function writeZipNumber(target: Uint8Array, offset: number, value: number, bytes: 2 | 4) {
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength)
  if (bytes === 2) view.setUint16(offset, value, true)
  else view.setUint32(offset, value, true)
}
function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}
function concatBytes(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
function createZip(entries: ZipEntry[]) {
  const encoder = new TextEncoder()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  const { time, date } = dosDateTime()
  let localOffset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const checksum = crc32(entry.data)
    const local = zipHeader(30)
    writeZipNumber(local, 0, 0x04034b50, 4)
    writeZipNumber(local, 4, 20, 2)
    writeZipNumber(local, 6, 0x0800, 2)
    writeZipNumber(local, 10, time, 2)
    writeZipNumber(local, 12, date, 2)
    writeZipNumber(local, 14, checksum, 4)
    writeZipNumber(local, 18, entry.data.length, 4)
    writeZipNumber(local, 22, entry.data.length, 4)
    writeZipNumber(local, 26, name.length, 2)
    localChunks.push(local, name, entry.data)

    const central = zipHeader(46)
    writeZipNumber(central, 0, 0x02014b50, 4)
    writeZipNumber(central, 4, 20, 2)
    writeZipNumber(central, 6, 20, 2)
    writeZipNumber(central, 8, 0x0800, 2)
    writeZipNumber(central, 12, time, 2)
    writeZipNumber(central, 14, date, 2)
    writeZipNumber(central, 16, checksum, 4)
    writeZipNumber(central, 20, entry.data.length, 4)
    writeZipNumber(central, 24, entry.data.length, 4)
    writeZipNumber(central, 28, name.length, 2)
    writeZipNumber(central, 42, localOffset, 4)
    centralChunks.push(central, name)
    localOffset += local.length + name.length + entry.data.length
  }
  const centralDirectory = concatBytes(centralChunks)
  const end = zipHeader(22)
  writeZipNumber(end, 0, 0x06054b50, 4)
  writeZipNumber(end, 8, entries.length, 2)
  writeZipNumber(end, 10, entries.length, 2)
  writeZipNumber(end, 12, centralDirectory.length, 4)
  writeZipNumber(end, 16, localOffset, 4)
  const archive = concatBytes([...localChunks, centralDirectory, end])
  const archiveBuffer = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength,
  ) as ArrayBuffer
  return new Blob([archiveBuffer], { type: 'application/zip' })
}
function safeFileBaseName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'asset'
}
function extensionForMime(mimeType: string) {
  const known: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
  }
  return known[mimeType.toLowerCase()] || mimeType.split('/')[1]?.split(/[;+]/)[0] || 'bin'
}
function uniqueAssetName(title: string, mimeType: string, usedNames: Set<string>) {
  const cleanTitle = safeFileBaseName(title)
  const titleExtension = cleanTitle.match(/\.([a-z0-9]{2,8})$/i)?.[1]
  const base = titleExtension ? cleanTitle.slice(0, -(titleExtension.length + 1)) : cleanTitle
  const extension = titleExtension || extensionForMime(mimeType)
  let candidate = `${base}.${extension}`
  let suffix = 2
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}.${extension}`
    suffix += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}
async function readExportAsset(url: string) {
  if (url.startsWith('data:')) {
    const separator = url.indexOf(',')
    if (separator < 0) throw new Error('无效的 data URL')
    const metadata = url.slice(5, separator)
    const mimeType = metadata.split(';')[0] || 'application/octet-stream'
    const body = url.slice(separator + 1)
    if (metadata.includes(';base64')) {
      const decoded = atob(body)
      const data = new Uint8Array(decoded.length)
      for (let index = 0; index < decoded.length; index += 1) data[index] = decoded.charCodeAt(index)
      return { data, mimeType }
    }
    return { data: new TextEncoder().encode(decodeURIComponent(body)), mimeType }
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const blob = await response.blob()
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    mimeType: blob.type || response.headers.get('content-type') || 'application/octet-stream',
  }
}
async function exportCanvas() {
  try {
    saveNow(true)
    flash('正在整理画布文件…')
    const exportedNodes = JSON.parse(JSON.stringify(nodes.value)) as CanvasNode[]
    const exportedEdges = JSON.parse(JSON.stringify(edges.value)) as Edge[]
    const zipEntries: ZipEntry[] = []
    const exportedAssets: ExportedAsset[] = []
    const skippedAssets: SkippedExportAsset[] = []
    const usedNames = new Set<string>()
    const assetByUrl = new Map<string, { path: string; mimeType: string; size: number }>()

    for (const node of exportedNodes) {
      if (!node.url) continue
      const existing = assetByUrl.get(node.url)
      if (existing) {
        node.url = existing.path
        exportedAssets.push({
          nodeId: node.id,
          nodeTitle: node.title,
          path: existing.path,
          mimeType: existing.mimeType,
          size: existing.size,
        })
        continue
      }
      const originalUrl = node.url
      try {
        const asset = await readExportAsset(originalUrl)
        const filename = uniqueAssetName(node.title, asset.mimeType, usedNames)
        const path = `file/${filename}`
        zipEntries.push({ name: path, data: asset.data })
        assetByUrl.set(originalUrl, { path, mimeType: asset.mimeType, size: asset.data.length })
        node.url = path
        exportedAssets.push({
          nodeId: node.id,
          nodeTitle: node.title,
          path,
          mimeType: asset.mimeType,
          size: asset.data.length,
        })
      } catch (error) {
        skippedAssets.push({
          nodeId: node.id,
          nodeTitle: node.title,
          url: originalUrl,
          reason: error instanceof Error ? error.message : '资源读取失败',
        })
      }
    }

    const payload = {
      format: 'infinite-canvas-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      id: canvasId.value,
      name: canvasName.value,
      nodes: exportedNodes,
      edges: exportedEdges,
      viewport: { ...viewport },
      files: exportedAssets,
      skippedFiles: skippedAssets,
    }
    zipEntries.unshift({
      name: 'canvas.json',
      data: new TextEncoder().encode(JSON.stringify(payload, null, 2)),
    })
    if (!zipEntries.some((entry) => entry.name.startsWith('file/'))) {
      zipEntries.push({ name: 'file/.gitkeep', data: new Uint8Array() })
    }
    const blob = createZip(zipEntries)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${safeFileBaseName(canvasName.value)}.zip`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    flash(
      skippedAssets.length
        ? `导出完成：已打包 ${exportedAssets.length} 个资源，${skippedAssets.length} 个远程资源保留原链接`
        : `导出完成：已打包 ${exportedAssets.length} 个资源`,
    )
  } catch (error) {
    flash(`导出失败：${error instanceof Error ? error.message : '无法创建压缩包'}`)
  }
}
function startCanvasRename() {
  renameCanvasDraft.value = canvasName.value
  showRenameCanvas.value = true
  showCanvasList.value = false
}
function commitCanvasRename() {
  const nextName = normalizeCanvasName(renameCanvasDraft.value)
  canvasName.value = nextName
  renameCanvasDraft.value = nextName
  showRenameCanvas.value = false
  saveNow(true)
  flash(`画布已重命名为“${nextName}”`)
}
function cancelCanvasRename() {
  showRenameCanvas.value = false
  renameCanvasDraft.value = ''
}
function switchCanvas(targetId: string) {
  if (targetId === canvasId.value) {
    showCanvasList.value = false
    showProjectMenu.value = false
    return
  }
  saveNow(true)
  const raw = localStorage.getItem(`infinite:canvas:${targetId}`)
  if (!raw) {
    canvasIndex.value = canvasIndex.value.filter((item) => item.id !== targetId)
    persistCanvasIndex()
    flash('该画布的本地数据已不存在')
    return
  }
  try {
    const payload = JSON.parse(raw)
    canvasId.value = targetId
    applyCanvasPayload(payload)
    localStorage.setItem('infinite:last-canvas', targetId)
    selected.value = []
    selectedEdge.value = null
    history.value = []
    future.value = []
    imageEditNodeId.value = null
    imageSettingsNodeId.value = null
    showCanvasList.value = false
    showProjectMenu.value = false
    flash(`已切换到“${canvasName.value}”`)
  } catch {
    flash('该画布数据损坏，无法打开')
  }
}
function newCanvas() {
  saveNow(true)
  const baseName = '未命名画布'
  const usedNames = new Set(canvasIndex.value.map((item) => item.name))
  let nextName = baseName
  let suffix = 2
  while (usedNames.has(nextName)) {
    nextName = `${baseName} ${suffix}`
    suffix += 1
  }
  canvasId.value = `canvas-${uid()}`
  canvasName.value = nextName
  nodes.value = []
  edges.value = []
  selected.value = []
  selectedEdge.value = null
  history.value = []
  future.value = []
  resetView()
  showProjectMenu.value = false
  showCanvasList.value = false
  saveNow(true)
  flash(`已新建“${nextName}”`)
}
function deleteCurrentCanvas() {
  if (!window.confirm(`确定删除当前画布“${canvasName.value}”吗？此操作无法撤销。`)) return
  const deletedId = canvasId.value
  const deletedName = canvasName.value
  window.clearTimeout((saveNow as typeof saveNow & { timer?: number }).timer)
  localStorage.removeItem(`infinite:canvas:${deletedId}`)
  canvasIndex.value = canvasIndex.value.filter((item) => item.id !== deletedId)
  persistCanvasIndex()

  let nextCanvas:
    | { id: string; payload: Parameters<typeof applyCanvasPayload>[0] }
    | undefined
  for (const item of canvasIndex.value) {
    const raw = localStorage.getItem(`infinite:canvas:${item.id}`)
    if (!raw) continue
    try {
      nextCanvas = { id: item.id, payload: JSON.parse(raw) }
      break
    } catch {
      // Invalid records are removed from the picker below.
    }
  }

  if (nextCanvas) {
    canvasId.value = nextCanvas.id
    applyCanvasPayload(nextCanvas.payload)
    localStorage.setItem('infinite:last-canvas', nextCanvas.id)
  } else {
    canvasIndex.value = []
    persistCanvasIndex()
    canvasId.value = `canvas-${uid()}`
    canvasName.value = '无限画布'
    nodes.value = []
    edges.value = []
    resetView()
    saveNow(true)
  }
  selected.value = []
  selectedEdge.value = null
  history.value = []
  future.value = []
  imageEditNodeId.value = null
  imageSettingsNodeId.value = null
  showRenameCanvas.value = false
  showCanvasList.value = false
  showProjectMenu.value = false
  flash(`已删除画布“${deletedName}”`)
}
function clearLocalData() {
  localStorage.clear()
  canvasIndex.value = []
  canvasTemplates.value = []
  Object.keys(sessionStorage)
    .filter((key) => key === 'infinite:api-key' || key.startsWith('infinite:api-key:'))
    .forEach((key) => sessionStorage.removeItem(key))
  flash('本地数据已清理')
}
function seedCanvas() {
  nodes.value = [
    { id: 'brief', kind: 'text', title: '品牌创意简报', x: 80, y: 110, width: 290, content: '为新一代智能随身设备创作一组未来感视觉。强调轻盈、克制与人性化科技。', version: 1, createdAt: 1 },
    { id: 'generate', kind: 'text', title: '图像提示词', x: 500, y: 95, width: 320, content: '极简产品摄影，悬浮的银色设备，柔和蓝紫光晕，深色背景，电影级质感', status: 'idle', version: 1, createdAt: 2 },
    { id: 'result', kind: 'image', title: '图像生成 / 参考图片', x: 960, y: 80, width: 310, content: '连接文本节点提供提示词，然后点击生成', url: '', version: 1, createdAt: 3, imageWidth: 1024, imageHeight: 1024, imageAutoSize: true, imageCount: 1 },
    { id: 'copy', kind: 'text', title: '核心文案', x: 520, y: 390, width: 300, content: '轻若无物，智在无形。\n让科技回到生活本身。', version: 1, createdAt: 4 },
    { id: 'video', kind: 'video', title: '动态演绎', x: 960, y: 390, width: 310, content: '6 秒 · 1080p · 等待生成', status: 'idle', version: 1, createdAt: 5 },
  ]
  edges.value = [
    { id: 'e1', source: 'brief', target: 'generate', enabled: true, order: 1 },
    { id: 'e2', source: 'generate', target: 'result', enabled: true, order: 1 },
    { id: 'e3', source: 'brief', target: 'copy', enabled: true, order: 1 },
    { id: 'e4', source: 'result', target: 'video', enabled: true, order: 1 },
    { id: 'e5', source: 'copy', target: 'video', enabled: true, order: 2 },
  ]
  viewport.x = 80
  viewport.y = 35
}
function applyCanvasPayload(parsed: {
  name?: string
  nodes?: CanvasNode[]
  edges?: Edge[]
  viewport?: Partial<typeof viewport>
}) {
  canvasName.value =
    parsed.name === '灵感工作流'
      ? '无限画布'
      : normalizeCanvasName(parsed.name || canvasName.value)
  nodes.value = (parsed.nodes || []).map((node: CanvasNode, index: number) => ({
    ...node,
    kind: node.kind === 'config' ? 'text' : node.kind,
    title: node.kind === 'config' ? '图像提示词' : node.title,
    hiddenInstruction:
      node.kind === 'text' && node.title.includes('反推提示词')
        ? IMAGE_TO_PROMPT_INSTRUCTION
        : node.hiddenInstruction,
    content:
      node.kind === 'text' && node.title.includes('反推提示词') && !node.content.trim()
        ? IMAGE_TO_PROMPT_INSTRUCTION
        : node.kind === 'text' &&
            node.content === '描述你的创意想法，或粘贴一段需要处理的文本…'
          ? ''
          : node.content,
    status:
      node.kind === 'config' || node.status === 'running' ? 'idle' : node.status,
    version: node.version || 1,
    createdAt: node.createdAt || index + 1,
    imageWidth: node.kind === 'image' ? node.imageWidth || 1024 : node.imageWidth,
    imageHeight: node.kind === 'image' ? node.imageHeight || 1024 : node.imageHeight,
    imageAutoSize: node.kind === 'image' ? node.imageAutoSize ?? true : node.imageAutoSize,
    imageCount:
      node.kind === 'image'
        ? Math.min(8, Math.max(1, Math.round(node.imageCount || 1)))
        : node.imageCount,
  }))
  edges.value = (parsed.edges || []).map((edge: Edge, index: number) => ({
    ...edge,
    enabled: edge.enabled ?? true,
    order: edge.order || index + 1,
  }))
  if (parsed.viewport) Object.assign(viewport, parsed.viewport)
  else resetView()
}
function loadLocal() {
  loadCanvasTemplates()
  const savedSettings = localStorage.getItem('infinite:settings')
  const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null
  if (parsedSettings) {
    const savedModelServices = parsedSettings.modelServices
    const legacyTemperature =
      parsedSettings.temperature === 0.7 ? 1 : parsedSettings.temperature
    const legacyMaxTokens = parsedSettings.maxTokens
    const baseSettings = { ...parsedSettings }
    delete baseSettings.modelServices
    delete baseSettings.activeModelChannelIds
    delete baseSettings.providerName
    delete baseSettings.baseUrl
    delete baseSettings.apiKey
    delete baseSettings.model
    delete baseSettings.imageModel
    delete baseSettings.temperature
    delete baseSettings.maxTokens
    Object.assign(settings, baseSettings)
    if (savedModelServices) {
      serviceOptions.forEach(({ kind }) => {
        const savedForKind = savedModelServices[kind]
        if (!savedForKind) return
        const savedChannels = Array.isArray(savedForKind) ? savedForKind : [savedForKind]
        modelServices[kind].splice(
          0,
          modelServices[kind].length,
          ...savedChannels.slice(0, 5).map((saved: Partial<ModelChannel>, index: number) => ({
            ...defaultModelChannel(kind, index),
            ...saved,
            id: saved.id || `${kind}-model-${index + 1}`,
            name: saved.name || `模型${index + 1}`,
            apiKey: '',
          })),
        )
        if (!modelServices[kind].length) modelServices[kind].push(defaultModelChannel(kind))
        const requestedActiveId = parsedSettings.activeModelChannelIds?.[kind]
        activeModelChannelIds[kind] = modelServices[kind].some(
          (channel) => channel.id === requestedActiveId,
        )
          ? requestedActiveId
          : modelServices[kind][0]!.id
      })
    } else {
      const legacyBaseUrl =
        parsedSettings.baseUrl === 'https://api.openai.com'
          ? 'https://api.openai.com/v1'
          : parsedSettings.baseUrl
      const legacyProvider = parsedSettings.providerName || 'OpenAI'
      Object.assign(modelServices.text[0]!, {
        providerName: legacyProvider,
        baseUrl: legacyBaseUrl || modelServices.text[0]!.baseUrl,
        model:
          parsedSettings.model === 'gpt-5.2' || parsedSettings.model === 'gpt-5.6'
            ? 'gpt-5.5'
            : parsedSettings.model || modelServices.text[0]!.model,
      })
      Object.assign(modelServices.image[0]!, {
        providerName: legacyProvider,
        baseUrl: legacyBaseUrl || modelServices.image[0]!.baseUrl,
        model:
          !parsedSettings.imageModel || parsedSettings.imageModel === 'gpt-image-1.5'
            ? 'gpt-image-2'
            : parsedSettings.imageModel,
      })
    }
    serviceOptions.forEach(({ kind }) => {
      const firstChannel = modelServices[kind][0]!
      const savedFirst = Array.isArray(savedModelServices?.[kind])
        ? savedModelServices[kind][0]
        : savedModelServices?.[kind]
      if (
        savedFirst?.temperature == null &&
        typeof legacyTemperature === 'number'
      )
        firstChannel.temperature = legacyTemperature
      if (savedFirst?.maxTokens == null && typeof legacyMaxTokens === 'number')
        firstChannel.maxTokens = legacyMaxTokens
    })
  }
  settings.theme = 'dark'
  const legacyApiKey = sessionStorage.getItem('infinite:api-key') || ''
  serviceOptions.forEach(({ kind }) => {
    const oldKindKey = sessionStorage.getItem(`infinite:api-key:${kind}`) || ''
    modelServices[kind].forEach((channel, index) => {
      channel.apiKey =
        sessionStorage.getItem(`infinite:api-key:${kind}:${channel.id}`) ||
        (index === 0 ? oldKindKey || (kind === 'text' || kind === 'image' ? legacyApiKey : '') : '')
    })
  })
  loadCanvasIndex()
  const saved = localStorage.getItem(storageKey.value)
  if (saved) {
    applyCanvasPayload(JSON.parse(saved))
  } else {
    seedCanvas()
    saveNow(true)
  }
  upsertCanvasIndex(
    canvasId.value,
    canvasName.value,
    Date.now(),
    nodes.value.length,
    edges.value.length,
  )
}
function onKeydown(event: KeyboardEvent) {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
  if (typing) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveNow()
  } else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected()
  else if (event.key === 'Escape') {
    linkingFrom.value = null
    imageEditNodeId.value = null
  }
  else if (event.key === 'v') mode.value = 'select'
  else if (event.key === 'h') mode.value = 'hand'
}
watch([nodes, edges, () => viewport.x, () => viewport.y, () => viewport.zoom], () => {
  window.clearTimeout((saveNow as typeof saveNow & { timer?: number }).timer)
  ;(saveNow as typeof saveNow & { timer?: number }).timer = window.setTimeout(
    () => saveNow(true),
    900,
  )
}, { deep: true })
watch(fontScale, (value) => localStorage.setItem(FONT_SCALE_KEY, String(value)))
onMounted(() => {
  loadLocal()
  enableFontScaling()
  updateCanvasSize()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateCanvasSize)
  window.addEventListener('pointerdown', startImageEditorOutsidePointer, true)
  window.addEventListener('pointermove', moveImageEditorOutsidePointer, true)
  window.addEventListener('pointerup', finishImageEditorOutsidePointer, true)
  window.addEventListener('pointercancel', cancelImageEditorOutsidePointer, true)
  window.addEventListener('pointerdown', closeAudioVolumeOutside, true)
  window.addEventListener('click', closeProjectMenuOutside)
  window.addEventListener('click', closeAudioMenuOutside)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateCanvasSize)
  window.removeEventListener('pointerdown', startImageEditorOutsidePointer, true)
  window.removeEventListener('pointermove', moveImageEditorOutsidePointer, true)
  window.removeEventListener('pointerup', finishImageEditorOutsidePointer, true)
  window.removeEventListener('pointercancel', cancelImageEditorOutsidePointer, true)
  window.removeEventListener('pointerdown', closeAudioVolumeOutside, true)
  window.removeEventListener('click', closeProjectMenuOutside)
  window.removeEventListener('click', closeAudioMenuOutside)
})
</script>

<template>
  <div class="app-shell" :style="{ '--font-scale': fontScale }">
    <header class="topbar">
      <div class="brand-mark">∞</div>
      <div class="project-wrap">
        <button class="project-button" @click="showProjectMenu = !showProjectMenu">
          <span class="project-dot"></span>
          <span>{{ canvasName }}</span>
          <small>⌄</small>
        </button>
        <div v-if="showProjectMenu" class="dropdown project-menu">
          <button @click="startCanvasRename">✎ 重命名画布</button>
          <div v-if="showRenameCanvas" class="rename-canvas-form" @click.stop>
            <input
              v-model="renameCanvasDraft"
              autofocus
              maxlength="60"
              aria-label="新的画布名称"
              @keydown.enter.prevent="commitCanvasRename"
              @keydown.esc.prevent="cancelCanvasRename"
            />
            <button title="确认重命名" @click="commitCanvasRename">✓</button>
            <button title="取消" @click="cancelCanvasRename">×</button>
          </div>
          <button
            class="canvas-list-trigger"
            @click="showCanvasList = !showCanvasList; showRenameCanvas = false"
          >
            <span>▦ 我的画布</span>
            <small>{{ canvasIndex.length }} ›</small>
          </button>
          <div v-if="showCanvasList" class="canvas-picker">
            <button
              v-for="item in canvasIndex"
              :key="item.id"
              class="canvas-picker-item"
              :class="{ current: item.id === canvasId }"
              @click="switchCanvas(item.id)"
            >
              <span>
                <b>{{ item.name }}</b>
                <small>{{ formatCanvasUpdatedAt(item.updatedAt) }}</small>
                <small>{{ item.nodeCount }} 个节点 · {{ item.edgeCount }} 条连线</small>
              </span>
              <i v-if="item.id === canvasId">当前</i>
            </button>
            <div v-if="!canvasIndex.length" class="canvas-picker-empty">
              暂无已保存画布
            </div>
          </div>
          <div class="project-menu-divider"></div>
          <button @click="newCanvas">＋ 新建画布</button>
          <button @click="exportCanvas">⇩ 导出画布</button>
          <button @click="saveNow()">✓ 保存到本地</button>
          <button class="danger-menu-item" @click="deleteCurrentCanvas">⌫ 删除当前画布</button>
          <div class="menu-meta">ID · {{ canvasId }}</div>
        </div>
      </div>
      <div class="save-state"><span></span> 已保存</div>
      <div class="top-spacer"></div>
      <div class="font-size-control" aria-label="字体大小">
        <button
          title="缩小字体"
          :disabled="fontScale <= 0.9"
          @click="changeFontScale(-1)"
        >A−</button>
        <button
          class="font-scale-value"
          title="恢复设备推荐字号"
          @click="resetFontScale"
        >{{ Math.round(fontScale * 100) }}%</button>
        <button
          title="放大字体"
          :disabled="fontScale >= 2"
          @click="changeFontScale(1)"
        >A＋</button>
      </div>
      <button class="top-action" @click="showSettings = true">⚙ <span>配置</span></button>
    </header>

    <main class="workspace">
      <aside class="left-rail">
        <button :class="{ active: mode === 'select' && !showTemplatePanel }" title="选择 (V)" @click="showTemplatePanel = false; mode = 'select'">↖</button>
        <button :class="{ active: mode === 'hand' && !showTemplatePanel }" title="移动画布 (H)" @click="showTemplatePanel = false; mode = 'hand'">✋</button>
        <div class="rail-divider"></div>
        <button v-for="item in toolbarItems" :key="item.kind" :title="item.label" @click="showTemplatePanel = false; addNode(item.kind)">
          <b>{{ item.icon }}</b><span>{{ item.label }}</span>
        </button>
        <button
          class="template-rail-button"
          :class="{ active: showTemplatePanel }"
          title="模板"
          aria-label="打开模板"
          @click="showTemplatePanel = !showTemplatePanel"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3 7 4-7 4-7-4 7-4Z"></path>
            <path d="m5 11 7 4 7-4"></path>
            <path d="m5 15 7 4 7-4"></path>
          </svg>
          <span>模板</span>
        </button>
        <input ref="replaceImageInput" hidden type="file" accept="image/*" @change="replaceSelectedImage" />
      </aside>

      <aside
        v-if="showTemplatePanel"
        class="template-panel"
        aria-label="模板库"
        @pointerdown.stop
        @wheel.stop
      >
        <header class="template-panel-header">
          <h2>模板库</h2>
          <button title="关闭模板库" aria-label="关闭模板库" @click="showTemplatePanel = false">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18"></path>
            </svg>
          </button>
        </header>
        <div class="template-tabs" role="tablist" aria-label="模板分类">
          <button
            role="tab"
            :aria-selected="activeTemplateTab === 'mine'"
            :class="{ active: activeTemplateTab === 'mine' }"
            @click="activeTemplateTab = 'mine'"
          >我的模板</button>
          <button
            role="tab"
            :aria-selected="activeTemplateTab === 'library'"
            :class="{ active: activeTemplateTab === 'library' }"
            @click="activeTemplateTab = 'library'"
          >模板库</button>
        </div>
        <div class="template-panel-body">
          <div v-if="activeTemplateTab === 'mine'" class="template-mine">
            <div class="template-mine-toolbar">
              <span>已保存 {{ canvasTemplates.length }}/{{ MAX_CANVAS_TEMPLATES }}</span>
              <button
                class="template-import-button"
                :disabled="canvasTemplates.length >= MAX_CANVAS_TEMPLATES"
                @click="importCurrentCanvasTemplate"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v11M7.5 9.5 12 15l4.5-5.5"></path>
                  <path d="M5 19h14"></path>
                </svg>
                导入模板
              </button>
            </div>
            <div v-if="canvasTemplates.length" class="template-list">
              <article
                v-for="item in canvasTemplates"
                :key="item.id"
                class="template-card"
                tabindex="0"
              >
                <div class="template-card-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 6.5h14v11H5z"></path>
                    <path d="M8 10h3v3H8zM13 10h3M13 13h3"></path>
                  </svg>
                </div>
                <div class="template-card-info">
                  <input
                    v-if="editingTemplateId === item.id"
                    v-model="templateNameDraft"
                    class="template-name-input"
                    maxlength="60"
                    aria-label="模板名称"
                    autofocus
                    @pointerdown.stop
                    @dblclick.stop
                    @blur="commitTemplateRename(item)"
                    @keydown.enter.prevent="commitTemplateRename(item)"
                    @keydown.esc.prevent="cancelTemplateRename"
                  />
                  <b
                    v-else
                    :title="`${item.name}（双击重命名）`"
                    @dblclick.stop="startTemplateRename(item)"
                  >{{ item.name }}</b>
                  <small>{{ item.nodes.length }} 个节点 · {{ item.edges.length }} 条连线</small>
                </div>
                <button class="template-use-button" @click="useCanvasTemplate(item)">使用模板</button>
                <button
                  class="template-delete-button"
                  title="删除模板"
                  :aria-label="`删除模板 ${item.name}`"
                  @click.stop="deleteCanvasTemplate(item)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V4.5h6V7M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path>
                  </svg>
                </button>
                <div class="template-preview-popover" aria-hidden="true">
                  <strong>{{ item.name }}</strong>
                  <svg viewBox="0 0 280 150" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <marker
                        :id="`template-arrow-${item.id}`"
                        markerWidth="5"
                        markerHeight="5"
                        refX="4"
                        refY="2.5"
                        orient="auto"
                      >
                        <path d="M0,0 L5,2.5 L0,5 z"></path>
                      </marker>
                    </defs>
                    <line
                      v-for="edge in templatePreview(item).edges"
                      :key="edge.id"
                      class="template-preview-edge"
                      :x1="edge.x1"
                      :y1="edge.y1"
                      :x2="edge.x2"
                      :y2="edge.y2"
                      :marker-end="`url(#template-arrow-${item.id})`"
                    />
                    <rect
                      v-for="node in templatePreview(item).nodes"
                      :key="node.id"
                      class="template-preview-node"
                      :class="`kind-${node.kind}`"
                      :x="node.x"
                      :y="node.y"
                      :width="node.width"
                      :height="node.height"
                      rx="2.5"
                    />
                  </svg>
                  <span>悬浮预览 · {{ item.nodes.length }} 个节点</span>
                </div>
              </article>
            </div>
            <div v-else class="template-empty">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M13 13h22v22H13z"></path>
                <path d="M8 18v22h22M18 8h22v22"></path>
              </svg>
              <b>暂无我的模板</b>
              <p>点击“导入模板”，保存当前画布的节点、位置和连线</p>
            </div>
          </div>
          <div v-else class="template-empty template-library-placeholder">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path d="m24 7 14 8-14 8-14-8 14-8Z"></path>
              <path d="m10 23 14 8 14-8M10 31l14 8 14-8"></path>
            </svg>
            <b>模板库即将上线</b>
            <p>这里已预留分类、搜索和模板卡片区域</p>
          </div>
        </div>
      </aside>

      <section
        ref="canvasEl"
        class="canvas"
        :class="[`mode-${mode}`, `grid-${settings.grid === '点阵' ? 'dots' : 'lines'}`]"
        @pointerdown="startCanvasDrag"
        @wheel="onWheel"
      >
        <div class="canvas-transform" :style="{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }">
          <svg class="edges-layer">
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#667085" />
              </marker>
            </defs>
            <g
              v-for="edge in edges"
              :key="edge.id"
              class="edge"
              :class="{ selected: selectedEdge === edge.id, disabled: !edge.enabled }"
              @pointerdown.stop="selectedEdge = edge.id; selected = []"
            >
              <path class="edge-hit" :d="edgePath(edge)" />
              <path class="edge-line" :d="edgePath(edge)" marker-end="url(#arrow)" />
            </g>
            <path v-if="linkingFrom" class="draft-edge" :d="draftPath()" />
          </svg>

          <article
            v-for="node in nodes"
            :key="node.id"
            :data-node-id="node.id"
            class="canvas-node"
            :class="[`node-${node.kind}`, { selected: selected.includes(node.id), linking: linkingFrom === node.id, stale: isNodeStale(node), resized: Boolean(node.height), 'has-result': Boolean(node.resultText) && node.kind === 'text', 'image-editing': imageEditNodeId === node.id }]"
            :style="{
              transform: `translate(${node.x}px, ${node.y}px)`,
              width: `${node.width}px`,
              height: node.height ? `${node.height}px` : undefined,
            }"
            @pointerdown="startNodeDrag($event, node)"
          >
            <button class="port input-port" aria-label="连接到此节点" @click.stop="connectTo(node.id)"></button>
            <div class="node-head">
              <span class="node-drag-handle" title="拖动节点" aria-label="拖动节点">⠿</span>
              <span class="kind-icon">{{ toolbarItems.find((x) => x.kind === node.kind)?.icon }}</span>
              <input v-model="node.title" aria-label="节点标题" @input="markNodeChanged(node)" />
              <span v-if="node.status" class="status" :class="node.status">
                {{ node.status === 'running' ? '运行中' : node.status === 'success' ? '完成' : node.status === 'stale' ? '已过期' : node.status === 'error' ? '失败' : '就绪' }}
              </span>
              <button
                v-if="node.kind === 'image'"
                class="more image-settings-button"
                :class="{ active: imageSettingsNodeId === node.id }"
                title="图片尺寸设置"
                @click.stop="toggleImageSettings(node)"
              >
                ⚙
              </button>
              <button
                v-else-if="node.kind === 'text'"
                class="text-to-image-button"
                title="创建并连接图片节点"
                @click.stop="createImageFromText(node)"
              >
                生图
              </button>
              <div v-else-if="node.kind === 'audio'" class="audio-menu-wrap">
                <button
                  class="more"
                  :class="{ active: audioMenuNodeId === node.id }"
                  title="音频选项"
                  @click.stop="audioMenuNodeId = audioMenuNodeId === node.id ? null : node.id"
                >
                  •••
                </button>
                <div
                  v-if="audioMenuNodeId === node.id"
                  class="audio-options-menu"
                  @pointerdown.stop
                  @click.stop
                >
                  <small>播放速度</small>
                  <div class="audio-rate-options">
                    <button
                      v-for="rate in [0.5, 1, 1.5, 2]"
                      :key="rate"
                      :class="{ selected: (node.audioPlaybackRate || 1) === rate }"
                      @click="setAudioPlaybackRate($event, node, rate)"
                    >
                      {{ rate }}×
                    </button>
                  </div>
                  <button :disabled="!node.url" @click="restartAudio($event, node)">↺ 从头播放</button>
                  <button :disabled="!node.url" @click="downloadAudio(node)">⇩ 下载音频</button>
                </div>
              </div>
              <button v-else class="more">•••</button>
            </div>

            <div
              v-if="node.kind === 'image' && imageSettingsNodeId === node.id"
              class="image-node-settings"
              @pointerdown.stop
            >
              <div class="ratio-title"><b>画面比例</b><span>{{ aspectLabel(node) }}</span></div>
              <div class="ratio-presets">
                <button :class="{ selected: node.imageAutoSize }" @click="setImageAuto(node)">自动</button>
                <button :class="{ selected: !node.imageAutoSize && node.imageWidth === 1024 && node.imageHeight === 1024 }" @click="setImageRatio(node, 1024, 1024)">1:1</button>
                <button :class="{ selected: !node.imageAutoSize && node.imageWidth === 1536 && node.imageHeight === 1024 }" @click="setImageRatio(node, 1536, 1024)">3:2</button>
                <button :class="{ selected: !node.imageAutoSize && node.imageWidth === 1024 && node.imageHeight === 1536 }" @click="setImageRatio(node, 1024, 1536)">2:3</button>
                <button :class="{ selected: !node.imageAutoSize && node.imageWidth === 1920 && node.imageHeight === 1080 }" @click="setImageRatio(node, 1920, 1080)">16:9</button>
                <button :class="{ selected: !node.imageAutoSize && node.imageWidth === 1080 && node.imageHeight === 1920 }" @click="setImageRatio(node, 1080, 1920)">9:16</button>
              </div>
              <div class="dimension-inputs">
                <label>W <input v-model.number="node.imageWidth" type="number" min="64" max="4096" @change="normalizeImageDimensions(node)" /></label>
                <span>×</span>
                <label>H <input v-model.number="node.imageHeight" type="number" min="64" max="4096" @change="normalizeImageDimensions(node)" /></label>
              </div>
              <label class="generation-count">
                <span>生成张数</span>
                <input
                  v-model.number="node.imageCount"
                  type="number"
                  min="1"
                  max="8"
                  step="1"
                  @change="normalizeImageCount(node)"
                />
              </label>
              <small>支持 1–8 张。第一张写回当前节点，其余结果排列在右侧。</small>
              <small>生成时会将比例写入提示词，并使用最接近的模型输出尺寸。</small>
            </div>

            <div
              v-if="node.kind === 'image'"
              class="media-preview image-preview"
              :class="{ editable: isGeneratedImage(node) }"
              :style="{ aspectRatio: imageAspect(node) }"
              :title="isGeneratedImage(node) ? '单击修改这张生成图片' : undefined"
              @click.stop="openImageEditor(node)"
            >
              <img
                v-if="node.url"
                :src="node.url"
                alt=""
                draggable="false"
                @dragstart.prevent
                @load="onImageLoaded($event, node)"
              />
              <div v-else class="generated-art">
                <i></i><i></i><i></i><span>INFINITE</span>
              </div>
            </div>
            <div v-else-if="node.kind === 'video'" class="media-preview video-preview">
              <video v-if="node.url" :src="node.url" controls></video>
              <div v-else class="video-placeholder"><button>▶</button><span>准备生成动态画面</span></div>
            </div>
            <div v-else-if="node.kind === 'audio'" class="audio-preview">
              <audio
                v-if="node.url"
                :src="node.url"
                preload="metadata"
                @loadedmetadata="syncAudioMetadata($event, node)"
                @durationchange="syncAudioMetadata($event, node)"
                @timeupdate="syncAudioProgress($event, node)"
                @play="audioState(node).playing = true"
                @pause="audioState(node).playing = false"
                @ended="audioState(node).playing = false"
              ></audio>
              <button
                class="audio-play-button"
                :disabled="!node.url"
                :aria-label="audioState(node).playing ? '暂停音频' : '播放音频'"
                @click.stop="toggleAudioPlayback($event, node)"
              >
                <svg v-if="audioState(node).playing" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="5" width="3.5" height="14" rx="1"></rect>
                  <rect x="13.5" y="5" width="3.5" height="14" rx="1"></rect>
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.25 5.9a1.2 1.2 0 0 1 1.82-1.02l10.05 6.1a1.2 1.2 0 0 1 0 2.04l-10.05 6.1a1.2 1.2 0 0 1-1.82-1.02V5.9Z"></path>
                </svg>
              </button>
              <span class="audio-time">{{ formatAudioTime(audioState(node).currentTime) }}</span>
              <input
                class="audio-range audio-progress"
                type="range"
                min="0"
                :max="Math.max(audioState(node).duration, 0.01)"
                step="0.01"
                :value="audioState(node).currentTime"
                :style="{ '--audio-range-value': `${audioProgressPercent(node)}%` }"
                :disabled="!node.url"
                aria-label="音频进度"
                @pointerdown.stop
                @input.stop="seekAudio($event, node)"
              />
              <span class="audio-time audio-duration">{{ formatAudioTime(audioState(node).duration) }}</span>
              <div
                class="audio-volume"
                :class="{ open: audioVolumeNodeId === node.id }"
                @pointerenter="audioVolumeNodeId = node.id"
                @pointerdown.stop
              >
                <button
                  class="audio-volume-button"
                  :disabled="!node.url"
                  :aria-label="audioState(node).muted || (node.audioVolume ?? 1) === 0 ? '恢复声音' : '静音'"
                  @click.stop="toggleAudioMute($event, node)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path class="speaker-body" d="M4.5 9.2h3.4l4.45-3.55a1 1 0 0 1 1.62.78v11.14a1 1 0 0 1-1.62.78L7.9 14.8H4.5A1.5 1.5 0 0 1 3 13.3v-2.6a1.5 1.5 0 0 1 1.5-1.5Z"></path>
                    <path
                      v-if="!audioState(node).muted && (node.audioVolume ?? 1) > 0"
                      class="speaker-wave"
                      d="M17 9a4.25 4.25 0 0 1 0 6"
                    ></path>
                    <path
                      v-if="!audioState(node).muted && (node.audioVolume ?? 1) >= 0.5"
                      class="speaker-wave"
                      d="M19.25 6.75a7.4 7.4 0 0 1 0 10.5"
                    ></path>
                    <path
                      v-if="audioState(node).muted || (node.audioVolume ?? 1) === 0"
                      class="speaker-wave"
                      d="m17.25 9 4.5 6m0-6-4.5 6"
                    ></path>
                  </svg>
                </button>
                <input
                  class="audio-range audio-volume-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="audioState(node).muted ? 0 : (node.audioVolume ?? 1)"
                  :style="{ '--audio-range-value': `${audioState(node).muted ? 0 : (node.audioVolume ?? 1) * 100}%` }"
                  :disabled="!node.url"
                  aria-label="音量"
                  @pointerdown.stop
                  @input.stop="setAudioVolume($event, node)"
                />
              </div>
            </div>
            <NodePromptEditor
              v-else
              v-model="node.content"
              :placeholder="nodePlaceholder(node)"
              :upstream="upstreamFor(node.id)"
              :style="{ height: node.inputHeight ? `${node.inputHeight}px` : undefined }"
              @change="markNodeChanged(node)"
            />

            <div
              v-if="node.kind === 'image' && imageEditNodeId === node.id"
              class="image-edit-panel"
              @pointerdown.stop
              @wheel.stop
              @dblclick.stop
            >
              <header>
                <div>
                  <b>修改图片</b>
                  <small>原图会保留，新结果生成在右侧</small>
                </div>
                <button title="关闭" @click="closeImageEditor">×</button>
              </header>
              <label class="image-edit-prompt">
                <span>生成提示词</span>
                <textarea
                  v-model="imageEditDraft.prompt"
                  placeholder="描述希望如何修改这张图片"
                  @wheel.stop
                ></textarea>
              </label>
              <div class="ratio-title">
                <b>画面比例</b>
                <span>{{ editAspectLabel() }}</span>
              </div>
              <div class="ratio-presets">
                <button :class="{ selected: imageEditDraft.imageAutoSize }" @click="setImageEditAuto">自动</button>
                <button :class="{ selected: !imageEditDraft.imageAutoSize && imageEditDraft.imageWidth === 1024 && imageEditDraft.imageHeight === 1024 }" @click="setImageEditRatio(1024, 1024)">1:1</button>
                <button :class="{ selected: !imageEditDraft.imageAutoSize && imageEditDraft.imageWidth === 1536 && imageEditDraft.imageHeight === 1024 }" @click="setImageEditRatio(1536, 1024)">3:2</button>
                <button :class="{ selected: !imageEditDraft.imageAutoSize && imageEditDraft.imageWidth === 1024 && imageEditDraft.imageHeight === 1536 }" @click="setImageEditRatio(1024, 1536)">2:3</button>
                <button :class="{ selected: !imageEditDraft.imageAutoSize && imageEditDraft.imageWidth === 1920 && imageEditDraft.imageHeight === 1080 }" @click="setImageEditRatio(1920, 1080)">16:9</button>
                <button :class="{ selected: !imageEditDraft.imageAutoSize && imageEditDraft.imageWidth === 1080 && imageEditDraft.imageHeight === 1920 }" @click="setImageEditRatio(1080, 1920)">9:16</button>
              </div>
              <div class="dimension-inputs">
                <label>W <input v-model.number="imageEditDraft.imageWidth" type="number" min="64" max="4096" @change="normalizeImageEditDimensions" /></label>
                <span>×</span>
                <label>H <input v-model.number="imageEditDraft.imageHeight" type="number" min="64" max="4096" @change="normalizeImageEditDimensions" /></label>
              </div>
              <label class="generation-count">
                <span>生成张数</span>
                <input
                  v-model.number="imageEditDraft.imageCount"
                  type="number"
                  min="1"
                  max="8"
                  step="1"
                  @change="normalizeImageEditCount"
                />
              </label>
              <footer>
                <button @click="closeImageEditor">取消</button>
                <div class="generation-controls">
                  <select
                    :value="serviceForNode(node).id"
                    aria-label="选择图片模型"
                    @change="setNodeModelChannel(node, ($event.target as HTMLSelectElement).value)"
                  >
                    <option
                      v-for="channel in channelsFor('image')"
                      :key="channel.id"
                      :value="channel.id"
                    >
                      {{ modelChannelLabel(channel) }}
                    </option>
                  </select>
                  <button class="primary generation-action" @click="runImageVariation(node)">生成修改结果</button>
                </div>
              </footer>
            </div>

            <div
              v-if="node.resultText && node.kind === 'text'"
              class="result-splitter"
              title="上下拖动调整输入与 AI 生成文本的高度"
              @pointerdown="startResultSplit($event, node)"
            >
              <span></span>
            </div>
            <textarea
              v-if="node.resultText && editingResultId === node.id"
              v-model="node.resultText"
              class="result-editor"
              autofocus
              aria-label="编辑 AI 生成文本"
              @pointerdown.stop
              @wheel.stop
              @blur="finishResultEditing(node)"
              @keydown.ctrl.enter.prevent="finishResultEditing(node)"
              @keydown.meta.enter.prevent="finishResultEditing(node)"
            ></textarea>
            <div
              v-else-if="node.resultText"
              class="generation-result"
              title="双击编辑 AI 生成文本"
              @pointerdown.stop
              @wheel.stop
              @dblclick.stop="startResultEditing(node)"
            >
              {{ node.resultText }}
            </div>
            <div v-if="isNodeStale(node)" class="stale-notice">上游输入已更新，建议重新生成</div>

            <div class="node-foot">
              <span>
                {{ incomingEdges(node.id).filter((edge) => edge.enabled).length }} 个输入 ·
                {{
                  node.kind === 'text'
                    ? `${node.content.length} 字`
                    : node.kind === 'image'
                      ? `${node.imageAutoSize ? '自动' : `${node.imageWidth || 1024} × ${node.imageHeight || 1024}`} · ${node.imageCount || 1} 张 · ${node.content}`
                      : node.content
                }}
              </span>
              <div v-if="node.kind !== 'config'" class="generation-controls">
                <select
                  class="node-model-select"
                  :value="serviceForNode(node).id"
                  :aria-label="`选择${serviceOptions.find((item) => item.kind === nodeServiceKind(node))?.label}模型`"
                  @pointerdown.stop
                  @click.stop
                  @change.stop="setNodeModelChannel(node, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="channel in channelsFor(nodeServiceKind(node))"
                    :key="channel.id"
                    :value="channel.id"
                  >
                    {{ modelChannelLabel(channel) }}
                  </option>
                </select>
                <button
                  class="run-button generation-action"
                  :class="{ running: node.status === 'running' }"
                  @click.stop="runNode(node)"
                >
                  {{ node.status === 'running' ? '生成中…' : '生成' }} ✦
                </button>
              </div>
            </div>
            <button class="port output-port" aria-label="从此节点开始连接" @pointerdown="startConnection($event, node.id)"></button>
            <span
              v-for="corner in resizeCorners"
              :key="corner"
              class="resize-handle"
              :class="`resize-${corner}`"
              :title="`拖动${corner}角调整节点大小`"
              @pointerdown="startNodeResize($event, node, corner)"
            ></span>
          </article>
        </div>

        <div class="history-controls">
          <button :disabled="!history.length" title="撤销" @click="undo">↶</button>
          <button :disabled="!future.length" title="重做" @click="redo">↷</button>
        </div>

        <div v-if="selectedNode" class="selection-actions" @pointerdown.stop>
          <span>{{ selectedNode.title }}</span>
          <template v-if="selectedNode.kind === 'image'">
            <button @click.stop="zoomedImage = selectedNode">放大</button>
            <button @click.stop="downloadImage(selectedNode)">下载</button>
            <button @click.stop="replaceImageInput?.click()">替换图片</button>
            <button class="accent" @click.stop="reversePrompt(selectedNode)">反推提示词</button>
          </template>
          <button v-else @click.stop="connectTo(selectedNode.id)">连接</button>
          <button class="danger" @click="deleteSelected">删除</button>
        </div>
        <div v-else-if="selectedEdgeData" class="edge-inspector" @pointerdown.stop>
          <div>
            <b>{{ nodeMap.get(selectedEdgeData.source)?.title }} → {{ nodeMap.get(selectedEdgeData.target)?.title }}</b>
            <small>输入顺序 {{ selectedEdgeData.order }} · 有向数据依赖</small>
          </div>
          <button @click="moveEdge(selectedEdgeData, -1)">↑</button>
          <button @click="moveEdge(selectedEdgeData, 1)">↓</button>
          <button @click="selectedEdgeData.enabled = !selectedEdgeData.enabled">{{ selectedEdgeData.enabled ? '停用' : '启用' }}</button>
          <button class="danger" @click="deleteSelected">删除</button>
        </div>

        <div v-if="showMinimap" class="minimap">
          <div class="minimap-label">导航</div>
          <div class="mini-stage">
            <span
              v-for="node in nodes"
              :key="node.id"
              :class="`mini-${node.kind}`"
              :style="minimapLayout.nodes[node.id]"
            ></span>
            <i :style="minimapLayout.viewport"></i>
          </div>
        </div>

        <div class="view-controls">
          <button @click="showMinimap = !showMinimap">⌗</button>
          <button @click="viewport.zoom = Math.max(.35, viewport.zoom - .1)">−</button>
          <button class="zoom-value" @click="resetView">{{ zoomLabel }}</button>
          <button @click="viewport.zoom = Math.min(2, viewport.zoom + .1)">＋</button>
          <button title="重置视图" @click="resetView">⌂</button>
          <button class="danger" title="清空画布" @click="clearCanvas">⌫</button>
        </div>
      </section>
    </main>

    <Transition name="fade">
      <div v-if="zoomedImage" class="image-lightbox" @pointerdown.self="zoomedImage = null">
        <header>
          <div><b>{{ zoomedImage.title }}</b><small>{{ zoomedImage.content }}</small></div>
          <button @click="zoomedImage = null">×</button>
        </header>
        <img v-if="zoomedImage.url" :src="zoomedImage.url" :alt="zoomedImage.title" />
        <div v-else class="lightbox-placeholder">
          <div class="generated-art"><i></i><i></i><i></i><span>INFINITE</span></div>
        </div>
        <footer>
          <button @click="downloadImage(zoomedImage)">下载原图</button>
          <button @click="replaceZoomedImage">替换图片</button>
          <button class="primary" @click="reversePromptZoomedImage">反推提示词</button>
        </footer>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="showSettings" class="modal-backdrop" @mousedown.self="showSettings = false">
        <section class="settings-modal">
          <header>
            <div><h2>配置中心</h2><p>管理你的工作台、模型与本地数据</p></div>
            <button class="close" @click="showSettings = false">×</button>
          </header>
          <div class="settings-body">
            <nav class="settings-nav">
              <button v-for="item in settingGroups" :key="item.label" :class="{ active: activeSetting === item.label }" @click="activeSetting = item.label">
                <span>{{ item.icon }}</span>{{ item.label }}
              </button>
              <div class="local-note"><b>● 本地优先</b><small>配置与画布默认保存在此设备</small></div>
            </nav>
            <div class="settings-content">
              <template v-if="activeSetting === '模型服务'">
                <div class="section-title"><div><h3>模型服务</h3><p>为文本、图片、视频和音频分别配置独立服务</p></div><span class="provider-status">● 独立配置</span></div>
                <div class="service-tabs">
                  <button
                    v-for="service in serviceOptions"
                    :key="service.kind"
                    :class="{ active: activeServiceKind === service.kind }"
                    @click="activeServiceKind = service.kind"
                  >
                    <b>{{ service.icon }}</b>
                    <span>{{ service.label }}</span>
                  </button>
                </div>
                <div class="model-channel-bar">
                  <div class="model-channel-tabs">
                    <button
                      v-for="channel in activeServiceChannels"
                      :key="channel.id"
                      :class="{ active: activeModelChannelIds[activeServiceKind] === channel.id }"
                      @click="activeModelChannelIds[activeServiceKind] = channel.id"
                    >
                      {{ channel.name }}
                    </button>
                  </div>
                  <button
                    class="add-model-channel"
                    :disabled="activeServiceChannels.length >= 5"
                    @click="addModelChannel(activeServiceKind)"
                  >
                    ＋ 添加模型
                  </button>
                </div>
                <div class="channel-heading">
                  <label>渠道名称<input v-model="activeService.name" maxlength="20" /></label>
                  <button
                    v-if="activeServiceChannels.length > 1"
                    class="danger-link"
                    @click="removeModelChannel(activeServiceKind, activeService.id)"
                  >
                    删除当前模型
                  </button>
                </div>
                <label>服务名称<input v-model="activeService.providerName" /></label>
                <label>API Base URL<input v-model="activeService.baseUrl" spellcheck="false" /></label>
                <label>API Key
                  <div class="password-field"><input v-model="activeService.apiKey" type="password" placeholder="sk-••••••••••••••••" /><span>仅保存当前模型</span></div>
                </label>
                <label>模型名称<input v-model="activeService.model" /></label>
                <div class="form-grid">
                  <label>温度<input v-model.number="activeService.temperature" type="number" min="0" max="2" step=".1" /></label>
                  <label>最大输出长度<input v-model.number="activeService.maxTokens" type="number" min="1" /></label>
                </div>
                <div class="security-note">🔒 每个模型的 API Key 相互独立，仅保存在当前浏览器会话中。节点运行时会使用节点下拉框所选模型的地址、密钥和参数。</div>
                <button class="secondary" :disabled="activeConnectionTest.status === 'testing'" @click="testProviderConnection(activeServiceKind, activeService.id)">
                  {{ activeConnectionTest.status === 'testing' ? '测试中…' : `测试 ${activeService.name}` }}
                </button>
                <div
                  v-if="activeConnectionTest.message"
                  class="connection-result"
                  :class="activeConnectionTest.status"
                >
                  {{ activeConnectionTest.message }}
                </div>
                <div class="section-reset">
                  <button @click="resetModelService(activeServiceKind, activeService.id)">
                    恢复当前模型默认配置
                  </button>
                </div>
              </template>

              <template v-else-if="activeSetting === '系统提示词'">
                <div class="section-title"><div><h3>系统提示词</h3><p>定义 AI 在所有工作流中的身份与行为边界</p></div></div>
                <label>全局系统提示词<textarea v-model="settings.systemPrompt" class="large-textarea"></textarea></label>
                <label>当前画布提示词<textarea v-model="settings.canvasPrompt" class="canvas-prompt"></textarea></label>
                <div class="prompt-card"><b>提示词层级</b><p>全局系统提示词 → 当前画布上下文 → 节点级指令 → 用户输入</p></div>
                <label>工具确认策略
                  <select v-model="settings.confirmPolicy"><option>始终确认</option><option>仅危险操作</option><option>从不确认</option></select>
                </label>
                <div class="section-reset">
                  <button @click="resetSystemPromptSettings">恢复默认</button>
                </div>
              </template>

              <template v-else-if="activeSetting === '画布'">
                <div class="section-title"><div><h3>画布偏好</h3><p>调整网格、缩放与自动保存</p></div></div>
                <label>背景样式<select v-model="settings.grid"><option>点阵</option><option>网格</option></select></label>
                <ToggleRow v-model="settings.snap" title="吸附到网格" text="移动节点时自动对齐到最近的网格点" />
                <label>自动保存间隔 <div class="range-row"><input v-model.number="settings.autosave" type="range" min="1" max="15" /><b>{{ settings.autosave }} 分钟</b></div></label>
              </template>

              <template v-else-if="activeSetting === '存储与隐私'">
                <div class="section-title"><div><h3>存储与隐私</h3><p>决定哪些内容保留在当前设备</p></div></div>
                <ToggleRow v-model="settings.saveHistory" title="保存操作记录" text="在本地保留画布操作历史" />
                <ToggleRow v-model="settings.saveGeneration" title="保存生成记录" text="保留任务参数与生成结果" />
                <ToggleRow v-model="settings.allowCanvasContext" title="允许发送画布上下文" text="调用模型时携带相关节点内容" />
                <ToggleRow v-model="settings.analytics" title="匿名使用统计" text="帮助改进产品体验，默认关闭" />
                <div class="danger-zone"><b>本地数据</b><p>清理本设备上的画布、素材与偏好设置。</p><button @click="clearLocalData">清理全部本地数据</button></div>
              </template>

              <template v-else>
                <div class="section-title"><div><h3>常规</h3><p>基础工作区行为</p></div></div>
                <ToggleRow v-model="settings.saveHistory" title="启动时恢复上次画布" text="自动打开上次使用的本地画布" />
                <ToggleRow v-model="settings.animations" title="自动保存" text="编辑后自动保存到本地设备" />
              </template>
            </div>
          </div>
          <footer>
            <button class="ghost" @click="showSettings = false">取消</button>
            <button class="primary" @click="saveNow(); showSettings = false">保存配置</button>
          </footer>
        </section>
      </div>
    </Transition>
    <Transition name="toast"><div v-if="toast" class="toast">✓ {{ toast }}</div></Transition>
  </div>
</template>
