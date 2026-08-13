<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import NodePromptEditor from './components/NodePromptEditor.vue'
import ToggleRow from './components/ToggleRow.vue'
import CustomSelect from './components/CustomSelect.vue'
import builtInCanvasTemplateData from './data/built-in-canvas-templates.json'

const CodeEditor = defineAsyncComponent(() => import('./components/CodeEditor.vue'))

type NodeKind = 'text' | 'image' | 'video' | 'audio' | 'config'
type ServiceKind = Exclude<NodeKind, 'config'>
type AudioSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2
type ReasoningEffort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh'
type ModelServiceConfig = {
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  reasoningEffort: ReasoningEffort
  script: string
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
type ImageUpscaleAlgorithm = 'high' | 'bilinear' | 'nearest'
type ImageUpscaleTarget = 1024 | 2048 | 4096
type AudioPlaybackState = {
  currentTime: number
  duration: number
  playing: boolean
  muted: boolean
}
type CanvasRole = {
  id: string
  name: string
  systemPrompt: string
  createdAt: number
}
type SavedPrompt = {
  id: string
  name?: string
  text: string
  kind: ServiceKind
  createdAt: number
  updatedAt: number
}
type PublicPromptSource = {
  id: string
  name: string
  url: string
  homepage: string
  enabled: boolean
  builtIn: boolean
  autoMap: boolean
}
type PromptSourceTestState = { status: 'idle' | 'testing' | 'success' | 'error'; message: string }
type PublicPrompt = {
  id: string
  sourceId: string
  title: string
  prompt: string
  description: string
  coverUrl: string
  referenceImageUrls: string[]
  tags: string[]
  author: string
  authorUrl: string
  sourceUrl: string
  createdAt: string
  updatedAt: string
  promptHint: string
  community: string
  usageCount: number | null
  viewCount: number | null
  voteCount: number | null
  imageMode: 'generate' | 'edit' | string
  imageModel: string
}
type LibraryAsset = {
  id: string
  kind: 'image' | 'video' | 'audio'
  title: string
  url: string
  description: string
  size: number
  createdAt: number
}
type CanvasMediaRecord = {
  id: string
  blob: Blob
  name: string
  mimeType: string
  size: number
  createdAt: number
}
type FileSourceAction = 'standalone' | 'upstream' | 'replace'
type CanvasNode = {
  id: string
  groupId?: string
  kind: NodeKind
  title: string
  x: number
  y: number
  width: number
  height?: number
  inputHeight?: number
  content: string
  url?: string
  assetId?: string
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
  videoAspectWidth?: number
  videoAspectHeight?: number
  videoAutoSize?: boolean
  videoDuration?: number
  videoResolution?: 480 | 720 | 1080 | 2160
  modelChannelId?: string
  roleId?: string
  audioPlaybackRate?: number
  audioVolume?: number
  audioVoice?: string
  audioFormat?: 'mp3' | 'wav' | 'aac' | 'flac' | 'opus'
  audioGenerationSpeed?: AudioSpeed
  audioInstructions?: string
  audioDuration?: number
  audioRecorded?: boolean
  lastGeneration?: GenerationSnapshot
}
type Edge = {
  id: string
  source: string
  target: string
  sourceGroupId?: string
  targetGroupId?: string
  sourceHandle?: string
  targetHandle?: string
  order: number
  enabled: boolean
}
type Snapshot = { nodes: CanvasNode[]; edges: Edge[] }
type NodeClipboard = { nodes: CanvasNode[]; edges: Edge[] }
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
const AUDIO_SPEED_OPTIONS: AudioSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 2]
const IMAGE_UPSCALE_TARGETS: ImageUpscaleTarget[] = [1024, 2048, 4096]

const uid = () => Math.random().toString(36).slice(2, 9)
const CANVAS_INDEX_KEY = 'infinite:canvas-index'
const CANVAS_TEMPLATES_KEY = 'infinite:canvas-templates'
const CANVAS_ROLES_KEY = 'infinite:canvas-roles'
const SAVED_PROMPTS_KEY = 'infinite:saved-prompts'
const PROMPT_SOURCES_KEY = 'infinite:prompt-sources'
const SNAP_DEFAULT_MIGRATION_KEY = 'infinite:snap-default-off-v1'
const ASSET_DB_NAME = 'infinite-assets'
const ASSET_STORE_NAME = 'assets'
const CANVAS_MEDIA_STORE_NAME = 'canvas-media'
const MAX_CANVAS_TEMPLATES = 10
const MAX_CANVAS_ROLES = 30
const MAX_SAVED_PROMPTS = 100
const PUBLIC_PROMPT_SOURCE_BASE =
  'https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources'
const DEFAULT_PUBLIC_PROMPT_SOURCES: PublicPromptSource[] = [
  { id: 'banana-prompt-quicker', name: 'Banana Prompt Quicker', url: `${PUBLIC_PROMPT_SOURCE_BASE}/banana-prompt-quicker.json`, homepage: 'https://glidea.github.io/banana-prompt-quicker/', enabled: true, builtIn: true, autoMap: true },
  { id: 'davidwu-gpt-image2-prompts', name: 'DavidWu GPT Image 2', url: `${PUBLIC_PROMPT_SOURCE_BASE}/davidwu-gpt-image2-prompts.json`, homepage: 'https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts', enabled: true, builtIn: true, autoMap: true },
  { id: 'awesome-gpt-image', name: 'Awesome GPT Image', url: `${PUBLIC_PROMPT_SOURCE_BASE}/awesome-gpt-image.json`, homepage: 'https://github.com/ZeroLu/awesome-gpt-image', enabled: true, builtIn: true, autoMap: true },
  { id: 'awesome-gpt4o-image-prompts', name: 'Awesome GPT-4o', url: `${PUBLIC_PROMPT_SOURCE_BASE}/awesome-gpt4o-image-prompts.json`, homepage: 'https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts', enabled: true, builtIn: true, autoMap: true },
  { id: 'youmind-gpt-image-2', name: 'YouMind GPT Image 2', url: `${PUBLIC_PROMPT_SOURCE_BASE}/youmind-gpt-image-2.json`, homepage: 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2', enabled: true, builtIn: true, autoMap: true },
  { id: 'youmind-nano-banana-pro', name: 'YouMind Nano Banana Pro', url: `${PUBLIC_PROMPT_SOURCE_BASE}/youmind-nano-banana-pro.json`, homepage: 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts', enabled: true, builtIn: true, autoMap: true },
]
const publicPromptSources = reactive<PublicPromptSource[]>(cloneValue(DEFAULT_PUBLIC_PROMPT_SOURCES))
const inputModeOptions = [
  { value: 'mouse', label: '鼠标模式' },
  { value: 'trackpad', label: '触控板模式' },
]
const shortcutGroups = [
  {
    title: '编辑',
    items: [
      { keys: ['Ctrl / ⌘', 'C'], label: '复制选中的控件' },
      { keys: ['Ctrl / ⌘', 'V'], label: '粘贴控件' },
      { keys: ['Ctrl / ⌘', 'Z'], label: '撤销' },
      { keys: ['Ctrl / ⌘', 'Shift', 'Z'], label: '重做' },
      { keys: ['Delete / Backspace'], label: '删除选中的控件或连线' },
      { keys: ['Ctrl / ⌘', 'Enter'], label: '完成 AI 结果文本编辑' },
    ],
  },
  {
    title: '画布',
    items: [
      { keys: ['Ctrl / ⌘', '拖动'], label: '框选多个控件' },
      { keys: ['V'], label: '切换到选择模式' },
      { keys: ['H'], label: '切换到画布拖动模式' },
      { keys: ['Esc'], label: '取消连线或关闭当前媒体输入面板' },
    ],
  },
  {
    title: '文件',
    items: [{ keys: ['Ctrl / ⌘', 'S'], label: '立即保存当前画布到本地' }],
  },
]
const promptKindOptions = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
]
const audioVoiceOptions = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']
  .map((value) => ({ value, label: value }))
const audioFormatOptions = ['mp3', 'wav', 'aac', 'flac', 'opus']
  .map((value) => ({ value, label: value.toUpperCase() }))
const publicPromptSourceOptions = computed(() => [
  { value: 'all', label: '全部来源' },
  ...publicPromptSources.filter((source) => source.enabled).map((source) => ({ value: source.id, label: source.name })),
])
const confirmPolicyOptions = ['始终确认', '仅危险操作', '从不确认'].map((value) => ({ value, label: value }))
const gridOptions = ['点阵', '网格'].map((value) => ({ value, label: value }))
const builtInCanvasTemplates = builtInCanvasTemplateData as unknown as CanvasTemplate[]
const FONT_SCALE_KEY = 'infinite:font-scale-v2'
const INPUT_MODE_KEY = 'infinite:input-mode'
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
const movingGroupNodeIds = ref<string[]>([])
const selectedEdge = ref<string | null>(null)
const viewport = reactive({ x: 0, y: 0, zoom: 1 })
const mode = ref<'select' | 'hand'>('select')
const showMinimap = ref(true)
const showSettings = ref(false)
const showShortcutHelp = ref(false)
const showProjectMenu = ref(false)
const showCanvasList = ref(false)
const showRenameCanvas = ref(false)
const renameCanvasDraft = ref('')
const importCanvasInput = ref<HTMLInputElement | null>(null)
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
const inputMode = ref<'mouse' | 'trackpad'>(
  localStorage.getItem(INPUT_MODE_KEY) === 'trackpad' ? 'trackpad' : 'mouse',
)
const activeSetting = ref('模型服务')
const toast = ref('')
const originStorageUsage = ref(0)
const originStorageQuota = ref(0)
let storageUsageTimer = 0
const linkingFrom = ref<string | null>(null)
const linkingFromGroupId = ref<string | null>(null)
const linkingPointer = reactive({ x: 0, y: 0 })
const linkingGroupSources = ref<string[]>([])
const linkingGroupOrigin = reactive({ x: 0, y: 0 })
const marquee = reactive({
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  baseSelection: [] as string[],
})
const history = ref<Snapshot[]>([])
const future = ref<Snapshot[]>([])
let nodeClipboard: NodeClipboard | null = null
let clipboardPasteCount = 0
const canvasEl = ref<HTMLElement | null>(null)
const canvasSize = reactive({ width: 1200, height: 800 })
const renderedNodeSizes = reactive<Record<string, { width: number; height: number }>>({})
const replaceImageInput = ref<HTMLInputElement | null>(null)
const replaceMediaInput = ref<HTMLInputElement | null>(null)
const addFileInput = ref<HTMLInputElement | null>(null)
const standaloneFileInput = ref<HTMLInputElement | null>(null)
const addFileTargetNodeId = ref<string | null>(null)
const zoomedImage = ref<CanvasNode | null>(null)
const expandedTextEditorNodeId = ref<string | null>(null)
const imageUpscaleNodeId = ref<string | null>(null)
const imageUpscaleDraft = reactive({
  sourceWidth: 0,
  sourceHeight: 0,
  targetLongEdge: 2048 as ImageUpscaleTarget,
  algorithm: 'high' as ImageUpscaleAlgorithm,
  loading: false,
  running: false,
})
const imageSettingsNodeId = ref<string | null>(null)
const videoSettingsNodeId = ref<string | null>(null)
const audioSettingsNodeId = ref<string | null>(null)
const audioMenuNodeId = ref<string | null>(null)
const audioVolumeNodeId = ref<string | null>(null)
const audioPlaybackStates = reactive<Record<string, AudioPlaybackState>>({})
const recordingAudioNodeId = ref<string | null>(null)
const uploadingAudioNodeIds = ref<string[]>([])
let activeAudioRecorder: MediaRecorder | null = null
let activeAudioStream: MediaStream | null = null
let activeAudioChunks: Blob[] = []
let activeAudioStartedAt = 0
const canvasMediaObjectUrls = new Map<string, string>()
const showTemplatePanel = ref(false)
const showAssetPanel = ref(false)
const railLocked = ref(true)
const railHovered = ref(false)
const activeAssetKind = ref<'image' | 'video' | 'audio'>('image')
const assetKinds = ['image', 'video', 'audio'] as const
const assetQuery = ref('')
const assetDragActive = ref(false)
const assetUploadBusy = ref(false)
const assetLibraryItems = ref<LibraryAsset[]>([])
const showFileSourceChoice = ref(false)
const pendingFileSource = reactive<{
  action: FileSourceAction
  targetNodeId: string | null
  preferredKind: 'image' | 'video' | 'audio'
}>({ action: 'standalone', targetNodeId: null, preferredKind: 'image' })
const activeTemplateTab = ref<'mine' | 'library'>('mine')
const activeTemplateKind = ref<'canvas' | 'prompt'>('canvas')
const canvasTemplates = ref<CanvasTemplate[]>([])
const editingTemplateId = ref<string | null>(null)
const templateNameDraft = ref('')
const canvasRoles = ref<CanvasRole[]>([])
const roleManagerNodeId = ref<string | null>(null)
const showCreateRole = ref(false)
const roleDraft = reactive({ name: '', systemPrompt: '' })
const savedPrompts = ref<SavedPrompt[]>([])
const promptLibraryNodeId = ref<string | null>(null)
const textPromptSaveNodeId = ref<string | null>(null)
const editingPromptId = ref<string | null>(null)
const promptEditDraft = reactive<{ text: string; kind: ServiceKind }>({ text: '', kind: 'text' })
const showCreatePrompt = ref(false)
const promptCreateDraft = reactive<{ text: string; kind: ServiceKind }>({ text: '', kind: 'text' })
const promptManagerView = ref<'mine' | 'library'>('mine')
const publicPrompts = ref<PublicPrompt[]>([])
const publicPromptLoading = ref(false)
const publicPromptError = ref('')
const promptSourceTests = reactive<Record<string, PromptSourceTestState>>({})
const expandedPromptSourceIds = ref<string[]>([])
const publicPromptQuery = ref('')
const publicPromptSourceId = ref('all')
const publicPromptCategory = ref('all')
const publicPromptCategoriesExpanded = ref(false)
const publicPromptVisibleLimit = ref(36)
const publicPromptDetail = ref<PublicPrompt | null>(null)
const mediaPromptNodeId = ref<string | null>(null)
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
const generationControllers = new Map<string, AbortController>()
let autoPanFrame = 0
let wheelZoomFrame = 0
let pendingWheelZoomDelta = 0
let pendingWheelZoomAnchor = { x: 0, y: 0 }
let dragPointer = { x: 0, y: 0 }
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
      openMediaPromptId?: string
      moved?: boolean
      marquee?: boolean
      selectedOrigins?: Array<{ id: string; x: number; y: number }>
      clearSelectionOnClick?: boolean
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
let nodeSizeObserver: ResizeObserver | null = null

const settings = reactive({
  theme: 'dark',
  grid: '点阵',
  snap: false,
  autosave: 5,
  compact: false,
  animations: true,
  systemPrompt: '你是一位擅长视觉创意与工作流编排的 AI 助手。请根据画布中的上下文提供清晰、可执行的建议。',
  confirmPolicy: '仅危险操作',
  saveHistory: true,
  saveGeneration: true,
  allowCanvasContext: true,
  analytics: false,
})
function defaultServiceConfig(kind: ServiceKind): ModelServiceConfig {
  const configs: Record<ServiceKind, ModelServiceConfig> = {
    text: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-5.5', temperature: 1, maxTokens: 4096, reasoningEffort: 'auto', script: '' },
    image: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-image-2', temperature: 1, maxTokens: 4096, reasoningEffort: 'auto', script: '' },
    video: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'sora-2', temperature: 1, maxTokens: 4096, reasoningEffort: 'auto', script: '' },
    audio: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini-tts', temperature: 1, maxTokens: 4096, reasoningEffort: 'auto', script: '' },
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
const scriptEditorKind = ref<ServiceKind | null>(null)
const scriptEditorChannelId = ref<string | null>(null)
const scriptDraft = ref('')
const serviceOptions: Array<{ kind: ServiceKind; label: string; icon: string }> = [
  { kind: 'text', label: '文本', icon: 'T' },
  { kind: 'image', label: '图片', icon: '▣' },
  { kind: 'video', label: '视频', icon: '▶' },
  { kind: 'audio', label: '音频', icon: '♪' },
]
const reasoningEffortOptions = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
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
const scriptEditorChannel = computed(() => {
  if (!scriptEditorKind.value || !scriptEditorChannelId.value) return undefined
  return channelsFor(scriptEditorKind.value).find((channel) => channel.id === scriptEditorChannelId.value)
})
const scriptVariables = [
  ['prompt', 'string', '图片、视频、音频的最终提示词'],
  ['images', 'string[]', '参考图片 Data URL 数组'],
  ['messages', '{ role, content }[]', '文本模型消息数组'],
  ['params', 'object', '尺寸、数量、时长、音色等生成参数'],
  ['model', 'string', '当前模型名称'],
  ['baseUrl', 'string', '配置的 API Base URL'],
  ['apiKey', 'string', '当前模型 API Key'],
  ['systemPrompt', 'string', '全局系统提示词'],
  ['reasoningEffort', "'auto' | 'low' | 'medium' | 'high' | 'xhigh'", '文本模型推理强度；自动时不发送 reasoning'],
  ['http', 'object', '自动携带 Bearer Key 的 get/post 工具'],
  ['request', 'function', '完全自定义 method、URL、header 与 body'],
  ['poll', 'function', '轮询异步任务直到返回有效结果'],
  ['sleep', 'function', '等待指定毫秒数'],
  ['signal', 'AbortSignal', '生成中断信号'],
  ['onDelta', 'function', '文本模型推送流式片段'],
] as const

function openModelScriptEditor(kind: ServiceKind, channel: ModelChannel) {
  scriptEditorKind.value = kind
  scriptEditorChannelId.value = channel.id
  scriptDraft.value = channel.script || ''
}
function closeModelScriptEditor() {
  scriptEditorKind.value = null
  scriptEditorChannelId.value = null
  scriptDraft.value = ''
}
function saveModelScript() {
  const channel = scriptEditorChannel.value
  if (!channel) return
  channel.script = scriptDraft.value.trim()
  saveNow(true)
  flash(channel.script ? `已保存“${channel.name}”的调用脚本` : `已恢复“${channel.name}”的默认调用方式`)
  closeModelScriptEditor()
}
function scriptReturnRequirement(kind: ServiceKind) {
  return {
    image: '返回图片 URL、Data URL、数组，或包含 url / dataUrl / b64_json 的对象。',
    video: '脚本内部完成轮询，返回视频 URL、Blob，或 { url } / { blob }。',
    audio: '返回音频 URL、Data URL、Base64、Blob，或包含 url / data / b64_json 的对象。',
    text: '最终返回完整文本字符串；流式内容可使用 onDelta(text) 推送。',
  }[kind]
}
function defaultScriptTemplate(kind: ServiceKind) {
  if (kind === 'text') return `// 文本对话（OpenAI Responses 接口）
// 可用：messages、systemPrompt、model、reasoningEffort、baseUrl、apiKey、onDelta
const data = await request({
  method: 'POST',
  url: baseUrl + '/responses',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + apiKey,
  },
  data: {
    model,
    input: messages,
    ...(reasoningEffort === 'auto' ? {} : { reasoning: { effort: reasoningEffort } }),
    max_output_tokens: params.maxTokens,
  },
});
const text = data.output_text
  || (data.output || [])
    .flatMap(item => item.content || [])
    .map(content => content.text || '')
    .join('')
  || '';
onDelta(text);
return text;`
  if (kind === 'audio') return `const blob = await http.post('/audio/speech', {
  model,
  input: prompt,
  voice: params.voice,
  response_format: params.format,
  speed: params.speed,
  instructions: params.instructions,
}, { responseType: 'blob' });
return blob;`
  if (kind === 'video') return `const task = await http.post('/videos', {
  model,
  prompt,
  size: params.size,
  seconds: String(params.seconds),
});
const completed = await poll(
  () => http.get('/videos/' + encodeURIComponent(task.id)),
  value => value.status === 'completed' ? value : null,
  { intervalMs: 10000, timeoutMs: 1200000 },
);
return await http.get('/videos/' + encodeURIComponent(completed.id) + '/content', { responseType: 'blob' });`
  return `if (images.length === 0) {
  const data = await http.post('/images/generations', {
    model, prompt, n: params.count, size: params.size, response_format: 'b64_json',
  });
  return (data.data || []).map(item => item.b64_json ? 'data:image/png;base64,' + item.b64_json : item.url);
}
const form = new FormData();
form.set('model', model);
form.set('prompt', prompt);
form.set('n', String(params.count));
for (const [index, dataUrl] of images.entries()) {
  form.append('image[]', await (await fetch(dataUrl)).blob(), 'reference-' + (index + 1) + '.png');
}
const edited = await http.post('/images/edits', form);
return (edited.data || []).map(item => item.b64_json ? 'data:image/png;base64,' + item.b64_json : item.url);`
}

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
  { label: '提示词来源', icon: '⌁' },
  { label: '系统提示词', icon: '¶' },
  { label: '存储与隐私', icon: '▣' },
]

const nodeMap = computed(() => new Map(nodes.value.map((node) => [node.id, node])))
const roleManagerNode = computed(() =>
  roleManagerNodeId.value ? nodeMap.value.get(roleManagerNodeId.value) : undefined,
)
const promptLibraryNode = computed(() =>
  promptLibraryNodeId.value ? nodeMap.value.get(promptLibraryNodeId.value) : undefined,
)
const publicPromptCategories = computed(() => {
  const counts = new Map<string, number>()
  publicPrompts.value
    .filter(
      (prompt) => publicPromptSourceId.value === 'all' || prompt.sourceId === publicPromptSourceId.value,
    )
    .forEach((prompt) =>
      prompt.tags.forEach((tag) => {
        const value = tag.trim()
        if (!value || value === 'Official' || value.startsWith('@') || value.includes('@')) return
        counts.set(value, (counts.get(value) || 0) + 1)
      }),
    )
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 40)
    .map(([name, count]) => ({ name, count }))
})
const filteredPublicPrompts = computed(() => {
  const query = publicPromptQuery.value.trim().toLocaleLowerCase()
  return publicPrompts.value.filter((prompt) => {
    if (publicPromptSourceId.value !== 'all' && prompt.sourceId !== publicPromptSourceId.value)
      return false
    if (publicPromptCategory.value !== 'all' && !prompt.tags.includes(publicPromptCategory.value))
      return false
    if (!query) return true
    return [prompt.title, prompt.prompt, prompt.description, prompt.promptHint, prompt.author, prompt.community, prompt.imageModel, prompt.createdAt, ...prompt.tags]
      .join('\n')
      .toLocaleLowerCase()
      .includes(query)
  })
})
const visiblePublicPrompts = computed(() =>
  filteredPublicPrompts.value.slice(0, publicPromptVisibleLimit.value),
)
const canvasAssets = computed(() => {
  const query = assetQuery.value.trim().toLocaleLowerCase()
  return assetLibraryItems.value
    .filter((asset) => (query ? true : asset.kind === activeAssetKind.value))
    .filter((asset) => !query || `${asset.title}\n${asset.description}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.createdAt - a.createdAt)
})
function assetCount(kind: 'image' | 'video' | 'audio') {
  return assetLibraryItems.value.filter((asset) => asset.kind === kind).length
}
const selectedNode = computed(() => {
  if (selected.value.length !== 1) return undefined
  const id = selected.value[0]
  return id ? nodeMap.value.get(id) : undefined
})
const expandedTextEditorNode = computed(() =>
  expandedTextEditorNodeId.value ? nodeMap.value.get(expandedTextEditorNodeId.value) : undefined,
)
const imageUpscaleNode = computed(() =>
  imageUpscaleNodeId.value ? nodeMap.value.get(imageUpscaleNodeId.value) : undefined,
)
const imageUpscaleOutputSize = computed(() => {
  const { sourceWidth, sourceHeight, targetLongEdge } = imageUpscaleDraft
  if (!sourceWidth || !sourceHeight) return { width: 0, height: 0 }
  const scale = targetLongEdge / Math.max(sourceWidth, sourceHeight)
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
})
function groupBoundsForNodes(groupNodes: CanvasNode[], padding = 28) {
  if (!groupNodes.length) return null
  const left = Math.min(...groupNodes.map((node) => node.x)) - padding
  const top = Math.min(...groupNodes.map((node) => node.y)) - padding
  const right = Math.max(...groupNodes.map((node) => node.x + (renderedNodeSizes[node.id]?.width || node.width))) + padding
  const bottom = Math.max(...groupNodes.map((node) => node.y + (renderedNodeSizes[node.id]?.height || node.height || 220))) + padding
  return { x: left, y: top, width: right - left, height: bottom - top, nodeIds: groupNodes.map((node) => node.id) }
}
const selectionGroupBounds = computed(() => {
  if (selected.value.length < 2) return null
  const groupNodes = selected.value
    .map((id) => nodeMap.value.get(id))
    .filter((node): node is CanvasNode => Boolean(node))
  if (groupNodes.length < 2) return null
  return groupBoundsForNodes(groupNodes)
})
const marqueeBounds = computed(() => ({
  x: Math.min(marquee.startX, marquee.currentX),
  y: Math.min(marquee.startY, marquee.currentY),
  width: Math.abs(marquee.currentX - marquee.startX),
  height: Math.abs(marquee.currentY - marquee.startY),
}))
const selectionIsSingleGroup = computed(() => {
  if (selected.value.length < 2) return false
  const groupIds = selected.value.map((id) => nodeMap.value.get(id)?.groupId)
  return Boolean(groupIds[0] && groupIds.every((groupId) => groupId === groupIds[0]))
})
const selectedPersistentGroupId = computed(() =>
  selectionIsSingleGroup.value ? nodeMap.value.get(selected.value[0]!)?.groupId || null : null,
)
const persistentGroupFrames = computed(() => {
  const grouped = new Map<string, CanvasNode[]>()
  nodes.value.forEach((node) => {
    if (!node.groupId) return
    const members = grouped.get(node.groupId) || []
    members.push(node)
    grouped.set(node.groupId, members)
  })
  return [...grouped.entries()].flatMap(([groupId, members]) => {
    const bounds = groupBoundsForNodes(members)
    return bounds ? [{ ...bounds, groupId }] : []
  })
})
const inactivePersistentGroupFrames = computed(() =>
  persistentGroupFrames.value.filter((group) => group.groupId !== selectedPersistentGroupId.value),
)
function groupFrame(groupId?: string) {
  return groupId ? persistentGroupFrames.value.find((group) => group.groupId === groupId) : undefined
}
function edgeSourceNodeIds(edge: Edge) {
  return edge.sourceGroupId ? groupNodeIds(edge.sourceGroupId) : nodeMap.value.has(edge.source) ? [edge.source] : []
}
function edgeTargetNodeIds(edge: Edge) {
  return edge.targetGroupId ? groupNodeIds(edge.targetGroupId) : nodeMap.value.has(edge.target) ? [edge.target] : []
}
function expandedEdgePairs(edge: Edge) {
  return edgeSourceNodeIds(edge).flatMap((source) => edgeTargetNodeIds(edge).map((target) => ({ source, target })))
}
function edgeEndpointLabel(edge: Edge, endpoint: 'source' | 'target') {
  const groupId = endpoint === 'source' ? edge.sourceGroupId : edge.targetGroupId
  if (groupId) return `分组（${groupNodeIds(groupId).length} 个节点）`
  const nodeId = endpoint === 'source' ? edge.source : edge.target
  return nodeMap.value.get(nodeId)?.title || '已删除节点'
}
const selectedEdgeData = computed(() => edges.value.find((edge) => edge.id === selectedEdge.value))
function isEdgeConnectedToSelection(edge: Edge) {
  return [...edgeSourceNodeIds(edge), ...edgeTargetNodeIds(edge)].some((id) => selected.value.includes(id))
}
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
    Math.max(
      viewLeft + viewWidth,
      ...nodes.value.map(
        (node) => node.x + (renderedNodeSizes[node.id]?.width || node.width),
      ),
    ) + padding
  const maxY =
    Math.max(
      viewTop + viewHeight,
      ...nodes.value.map(
        (node) =>
          node.y + (renderedNodeSizes[node.id]?.height || node.height || 210),
      ),
    ) +
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
            width: `${Math.max(5, (renderedNodeSizes[node.id]?.width || node.width) * scale)}px`,
            height: `${Math.max(3, (renderedNodeSizes[node.id]?.height || node.height || 210) * scale)}px`,
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
function observeNodeElement(element: unknown) {
  if (!(element instanceof HTMLElement) || !nodeSizeObserver) return
  nodeSizeObserver.observe(element)
}
function startNodeSizeObserver() {
  nodeSizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const element = entry.target as HTMLElement
      const id = element.dataset.nodeId
      if (!id) return
      const borderBox = Array.isArray(entry.borderBoxSize)
        ? entry.borderBoxSize[0]
        : entry.borderBoxSize
      const width = borderBox?.inlineSize || entry.contentRect.width + 2
      const height = borderBox?.blockSize || entry.contentRect.height + 2
      const previous = renderedNodeSizes[id]
      if (
        !previous ||
        Math.abs(previous.width - width) > 0.5 ||
        Math.abs(previous.height - height) > 0.5
      ) {
        renderedNodeSizes[id] = { width, height }
      }
    })
  })
  nextTick(() => {
    canvasEl.value
      ?.querySelectorAll<HTMLElement>('.canvas-node')
      .forEach((element) => nodeSizeObserver?.observe(element))
  })
}
function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
function persistCanvasRoles() {
  localStorage.setItem(CANVAS_ROLES_KEY, JSON.stringify(canvasRoles.value))
}
function loadCanvasRoles() {
  try {
    const saved = JSON.parse(localStorage.getItem(CANVAS_ROLES_KEY) || '[]')
    canvasRoles.value = Array.isArray(saved)
      ? saved
          .filter(
            (role: Partial<CanvasRole>) =>
              role.id && typeof role.name === 'string' && typeof role.systemPrompt === 'string',
          )
          .slice(0, MAX_CANVAS_ROLES)
          .map((role: CanvasRole) => ({
            ...role,
            name: role.name.trim().slice(0, 60),
            systemPrompt: role.systemPrompt.trim().slice(0, 12000),
            createdAt: Number(role.createdAt) || Date.now(),
          }))
      : []
  } catch {
    canvasRoles.value = []
  }
}
function roleForNode(node: CanvasNode) {
  return canvasRoles.value.find((role) => role.id === node.roleId)
}
function openRoleManager(node: CanvasNode) {
  roleManagerNodeId.value = node.id
  showCreateRole.value = false
  roleDraft.name = ''
  roleDraft.systemPrompt = ''
}
function closeRoleManager() {
  roleManagerNodeId.value = null
  showCreateRole.value = false
  roleDraft.name = ''
  roleDraft.systemPrompt = ''
}
function startCreateRole() {
  showCreateRole.value = true
  roleDraft.name = ''
  roleDraft.systemPrompt = ''
}
function saveCreatedRole() {
  if (canvasRoles.value.length >= MAX_CANVAS_ROLES)
    return flash('最多只能创建 30 个角色')
  const name = roleDraft.name.trim().slice(0, 60)
  const systemPrompt = roleDraft.systemPrompt.trim().slice(0, 12000)
  if (!name) return flash('请输入角色名称')
  if (!systemPrompt) return flash('请输入角色系统提示词')
  const role: CanvasRole = {
    id: `role-${Date.now()}-${uid()}`,
    name,
    systemPrompt,
    createdAt: Date.now(),
  }
  canvasRoles.value.push(role)
  try {
    persistCanvasRoles()
    showCreateRole.value = false
    roleDraft.name = ''
    roleDraft.systemPrompt = ''
    flash(`已创建角色“${name}”，现在可以选择`)
  } catch {
    canvasRoles.value.pop()
    flash('角色保存失败，请检查浏览器本地存储')
  }
}
function deleteCanvasRole(role: CanvasRole) {
  if (!window.confirm(`确定删除角色“${role.name}”吗？`)) return
  const previousRoles = canvasRoles.value
  canvasRoles.value = canvasRoles.value.filter((item) => item.id !== role.id)
  try {
    persistCanvasRoles()
  } catch {
    canvasRoles.value = previousRoles
    flash('角色删除失败')
    return
  }
  const affectedNodes = nodes.value.filter((node) => node.roleId === role.id)
  if (affectedNodes.length) {
    affectedNodes.forEach((node) => {
      node.roleId = undefined
      markNodeChanged(node)
    })
  }
  flash(`已删除角色“${role.name}”`)
}
function selectRoleForCurrentNode(role: CanvasRole) {
  const node = roleManagerNode.value
  if (!node) return
  checkpoint()
  node.roleId = role.id
  markNodeChanged(node)
  closeRoleManager()
  flash(`已为“${node.title}”选择角色“${role.name}”`)
}
function clearRoleForCurrentNode() {
  const node = roleManagerNode.value
  if (!node?.roleId) return
  checkpoint()
  node.roleId = undefined
  markNodeChanged(node)
  closeRoleManager()
  flash(`已清除“${node.title}”的角色`)
}
function persistSavedPrompts() {
  localStorage.setItem(SAVED_PROMPTS_KEY, JSON.stringify(savedPrompts.value))
}
function loadSavedPrompts() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_PROMPTS_KEY) || '[]')
    const validKinds: ServiceKind[] = ['text', 'image', 'video', 'audio']
    savedPrompts.value = Array.isArray(saved)
      ? saved
          .filter(
            (item: Partial<SavedPrompt>) =>
              item.id && typeof item.text === 'string' && validKinds.includes(item.kind as ServiceKind),
          )
          .slice(0, MAX_SAVED_PROMPTS)
          .map((item: SavedPrompt) => ({
            ...item,
            name: typeof item.name === 'string' ? item.name.trim().slice(0, 60) : undefined,
            text: item.text.trim().slice(0, 32000),
            createdAt: Number(item.createdAt) || Date.now(),
            updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
          }))
          .filter((item: SavedPrompt) => item.text)
      : []
  } catch {
    savedPrompts.value = []
  }
}
function normalizedPromptText(value: string) {
  return value.replace(/\r\n?/g, '\n').trim()
}
function savePromptText(textValue: string, kind: ServiceKind) {
  const text = normalizedPromptText(textValue)
  if (!text) return false
  if (savedPrompts.value.some((prompt) => normalizedPromptText(prompt.text) === text)) {
    flash('提示词库中已有完全相同的内容，无需重复保存')
    return false
  }
  if (savedPrompts.value.length >= MAX_SAVED_PROMPTS) {
    flash(`最多只能保存 ${MAX_SAVED_PROMPTS} 条提示词`)
    return false
  }
  const now = Date.now()
  const savedPrompt: SavedPrompt = {
    id: `prompt-${now}-${uid()}`,
    text: text.slice(0, 32000),
    kind,
    createdAt: now,
    updatedAt: now,
  }
  savedPrompts.value.unshift(savedPrompt)
  try {
    persistSavedPrompts()
    flash('当前提示词已保存到“我的提示词”')
    return true
  } catch {
    savedPrompts.value.shift()
    flash('提示词保存失败，请检查浏览器本地存储')
    return false
  }
}
function saveCurrentPrompt(node: CanvasNode) {
  savePromptText(node.content, nodeServiceKind(node))
}
function toggleTextPromptSaveMenu(node: CanvasNode) {
  textPromptSaveNodeId.value = textPromptSaveNodeId.value === node.id ? null : node.id
}
function saveTextPromptVersion(node: CanvasNode, version: 'before' | 'after') {
  const text = version === 'before' ? node.content : node.resultText || ''
  if (!text.trim()) return flash(version === 'before' ? '生成前内容为空' : '生成后内容为空')
  savePromptText(text, 'text')
  textPromptSaveNodeId.value = null
}
function closeTextPromptSaveOutside(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('.text-prompt-save-wrap')) return
  textPromptSaveNodeId.value = null
}
function openPromptLibrary(node: CanvasNode) {
  textPromptSaveNodeId.value = null
  promptLibraryNodeId.value = node.id
  editingPromptId.value = null
  showCreatePrompt.value = false
  promptManagerView.value = 'mine'
}
function openExpandedTextEditor(node: CanvasNode) {
  expandedTextEditorNodeId.value = node.id
}
function closeExpandedTextEditor() {
  expandedTextEditorNodeId.value = null
}
function closePromptLibrary() {
  publicPromptDetail.value = null
  promptLibraryNodeId.value = null
  editingPromptId.value = null
  promptEditDraft.text = ''
  promptEditDraft.kind = 'text'
  showCreatePrompt.value = false
  promptCreateDraft.text = ''
  promptCreateDraft.kind = 'text'
}
function createPromptSource(source?: Partial<PublicPromptSource>): PublicPromptSource {
  return {
    id: source?.id?.trim() || `prompt-source-${uid()}`,
    name: source?.name?.trim() || '新来源',
    url: source?.url?.trim() || '',
    homepage: source?.homepage?.trim() || '',
    enabled: source?.enabled ?? true,
    builtIn: source?.builtIn ?? false,
    autoMap: source?.autoMap ?? true,
  }
}
function persistPromptSources() {
  localStorage.setItem(PROMPT_SOURCES_KEY, JSON.stringify(publicPromptSources))
}
function loadPromptSources() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROMPT_SOURCES_KEY) || '[]')
    if (!Array.isArray(saved) || !saved.length) return
    const savedById = new Map(
      saved
        .filter((item: unknown): item is Partial<PublicPromptSource> => Boolean(item && typeof item === 'object'))
        .map((item: Partial<PublicPromptSource>) => [item.id, item]),
    )
    const builtIns = DEFAULT_PUBLIC_PROMPT_SOURCES.map((source) =>
      createPromptSource({ ...source, ...savedById.get(source.id), id: source.id, builtIn: true }),
    )
    const customs = saved
      .filter((item: Partial<PublicPromptSource>) => item.id && !DEFAULT_PUBLIC_PROMPT_SOURCES.some((source) => source.id === item.id))
      .slice(0, 20)
      .map((item: Partial<PublicPromptSource>) => createPromptSource({ ...item, builtIn: false }))
    publicPromptSources.splice(0, publicPromptSources.length, ...builtIns, ...customs)
  } catch {
    publicPromptSources.splice(0, publicPromptSources.length, ...cloneValue(DEFAULT_PUBLIC_PROMPT_SOURCES))
  }
}
function addPromptSource(source?: Partial<PublicPromptSource>) {
  if (publicPromptSources.length >= 20) return flash('提示词来源最多添加 20 个')
  if (source?.url && publicPromptSources.some((item) => item.url === source.url)) {
    return flash('这个 JSON URL 已经存在，无需重复添加')
  }
  const created = createPromptSource(source)
  publicPromptSources.unshift(created)
  promptSourceTests[created.id] = { status: 'idle', message: '' }
  flash('已添加提示词来源')
}
function removePromptSource(source: PublicPromptSource) {
  if (source.builtIn) return
  const index = publicPromptSources.findIndex((item) => item.id === source.id)
  if (index < 0) return
  publicPromptSources.splice(index, 1)
  delete promptSourceTests[source.id]
  if (publicPromptSourceId.value === source.id) publicPromptSourceId.value = 'all'
  publicPrompts.value = publicPrompts.value.filter((prompt) => prompt.sourceId !== source.id)
  flash(`已删除提示词来源“${source.name}”`)
}
function resetPromptSources() {
  publicPromptSources.splice(0, publicPromptSources.length, ...cloneValue(DEFAULT_PUBLIC_PROMPT_SOURCES))
  Object.keys(promptSourceTests).forEach((id) => delete promptSourceTests[id])
  publicPromptSourceId.value = 'all'
  publicPrompts.value = []
  flash('提示词来源已恢复默认')
}
function promptItemsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const object = payload as Record<string, unknown>
  if (Array.isArray(object.items)) return object.items
  if (Array.isArray(object.data)) return object.data
  if (Array.isArray(object.prompts)) return object.prompts
  return []
}
function promptSourceTestState(sourceId: string) {
  return promptSourceTests[sourceId] || (promptSourceTests[sourceId] = { status: 'idle', message: '' })
}
function isPromptSourceCollapsed(sourceId: string) {
  return !expandedPromptSourceIds.value.includes(sourceId)
}
function togglePromptSourceCollapsed(sourceId: string) {
  expandedPromptSourceIds.value = isPromptSourceCollapsed(sourceId)
    ? [...expandedPromptSourceIds.value, sourceId]
    : expandedPromptSourceIds.value.filter((id) => id !== sourceId)
}
function inferPromptSourceHomepage(source: PublicPromptSource) {
  if (source.homepage.trim()) return source.homepage.trim()
  try {
    const url = new URL(source.url)
    if (url.hostname === 'raw.githubusercontent.com') {
      const [owner, repository] = url.pathname.split('/').filter(Boolean)
      if (owner && repository) return `https://github.com/${owner}/${repository}`
    }
    if (url.hostname === 'github.com') {
      const [owner, repository] = url.pathname.split('/').filter(Boolean)
      if (owner && repository) return `https://github.com/${owner}/${repository}`
    }
  } catch {
    // The URL validator reports malformed source URLs before normalization.
  }
  return ''
}
function clearPromptSourceTest(sourceId: string) {
  promptSourceTests[sourceId] = { status: 'idle', message: '' }
}
async function testPromptSource(source: PublicPromptSource) {
  const state = promptSourceTestState(source.id)
  const url = source.url.trim()
  if (!/^https?:\/\//i.test(url)) {
    state.status = 'error'
    state.message = '请输入以 http:// 或 https:// 开头的 JSON URL'
    return
  }
  state.status = 'testing'
  state.message = '正在拉取并解析 JSON…'
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const items = promptItemsFromPayload(payload)
    const usable = items
      .map((item, index) => normalizePublicPrompt(item, source, index))
      .filter((item): item is PublicPrompt => Boolean(item))
    if (!usable.length) {
      throw new Error(source.autoMap
        ? 'JSON 中没有识别到可映射的提示词字段'
        : 'JSON 中没有识别到标准 prompt 字段，请开启自动映射后重试')
    }
    state.status = 'success'
    state.message = `连接成功，识别到 ${usable.length} 条可用提示词`
  } catch (error) {
    state.status = 'error'
    state.message = error instanceof DOMException && error.name === 'AbortError'
      ? '拉取超时，请检查地址或网络'
      : error instanceof SyntaxError
        ? '返回内容不是有效 JSON'
        : error instanceof TypeError
          ? '无法访问该地址，可能是网络或跨域限制'
          : `拉取失败：${error instanceof Error ? error.message : '未知错误'}`
  } finally {
    window.clearTimeout(timeoutId)
  }
}
function normalizePublicPrompt(
  value: unknown,
  source: PublicPromptSource,
  index: number,
): PublicPrompt | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const mapped = source.autoMap
  const prompt = String(mapped
    ? item.prompt || item.text || item.prompt_text || item.Prompt || item.PromptTemplate || item['Prompt Template'] || ''
    : item.prompt || '').trim()
  if (!prompt) return null
  const arrayTags = [item.tags, mapped ? item.categories : undefined]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map((tag) => String(tag).trim())
    .filter(Boolean)
  const tags = [...new Set([
    ...arrayTags,
    String(mapped ? item.category || item.Category || item.Topic || item['dcterms:subject'] || '' : '').trim(),
    String(mapped ? item.sub_category || item.Activity || '' : '').trim(),
  ].filter(Boolean))].slice(0, 12)
  const referenceUrls = [item.referenceImageUrls, mapped ? item.reference_image_urls : undefined, mapped ? item.images : undefined]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map((url) => String(url).trim())
    .filter(Boolean)
  const rawId = String(item.id || (mapped ? item.ID || item.slug || item['dcterms:identifier'] : '') || index).trim()
  const id = rawId.startsWith(`${source.id}:`) ? rawId : `${source.id}:${rawId}`
  const firstPromptLine = prompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || prompt
  const generatedTitle = firstPromptLine.length > 48
    ? `${firstPromptLine.slice(0, 48).trim()}…`
    : firstPromptLine
  const numericMetadata = (value: unknown) => {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  }
  return {
    id,
    sourceId: source.id,
    title: String(item.title || (mapped ? item.Title || item.name || item['dcterms:title'] : '') || generatedTitle || '未命名提示词').trim().slice(0, 160),
    prompt: prompt.slice(0, 32000),
    description: String(item.description || (mapped ? item.Teaser || item.Help || item['dcterms:description'] : '') || '').trim().slice(0, 1000),
    coverUrl: String(item.coverUrl || (mapped ? item.imageUrl || item.preview || item.image : '') || '').trim(),
    referenceImageUrls: [...new Set(referenceUrls)].slice(0, 12),
    tags,
    author: String(item.author || (mapped ? item.author_name || item.AuthorName || item['dcterms:creator'] : '') || '').trim().slice(0, 120),
    authorUrl: String(item.authorUrl || (mapped ? item.AuthorURL : '') || '').trim(),
    sourceUrl: String(item.sourceUrl || (mapped ? item.source_url || item.link : '') || inferPromptSourceHomepage(source)).trim(),
    createdAt: String(item.createdAt || (mapped ? item.created || item.date || item.CreationTime || item['dcterms:modified'] : '') || '').trim(),
    updatedAt: String(item.updatedAt || (mapped ? item.updated || item.RevisionTime : '') || '').trim(),
    promptHint: String(item.promptHint || (mapped ? item.PromptHint : '') || '').trim().slice(0, 1000),
    community: String(item.community || (mapped ? item.Community : '') || '').trim().slice(0, 160),
    usageCount: numericMetadata(item.usageCount ?? (mapped ? item.Usages : undefined)),
    viewCount: numericMetadata(item.viewCount ?? (mapped ? item.Views : undefined)),
    voteCount: numericMetadata(item.voteCount ?? (mapped ? item.Votes : undefined)),
    imageMode: String(item.imageMode || (mapped ? item.mode : '') || 'generate'),
    imageModel: String(item.imageModel || (mapped ? item.model : '') || '').trim().slice(0, 120),
  }
}
async function loadPublicPromptLibrary(force = false) {
  if (publicPromptLoading.value || (publicPrompts.value.length && !force)) return
  publicPromptLoading.value = true
  publicPromptError.value = ''
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 20000)
  try {
    const enabledSources = publicPromptSources.filter((source) => source.enabled && source.url.trim())
    if (!enabledSources.length) throw new Error('没有启用的提示词来源，请先在配置中心启用或添加来源')
    const results = await Promise.allSettled(
      enabledSources.map(async (source) => {
        const response = await fetch(source.url, { cache: 'force-cache', signal: controller.signal })
        if (!response.ok) throw new Error(`${source.name} 返回 ${response.status}`)
        const payload = await response.json()
        const list = promptItemsFromPayload(payload)
        return list
          .map((item: unknown, index: number) => normalizePublicPrompt(item, source, index))
          .filter((item: PublicPrompt | null): item is PublicPrompt => Boolean(item))
      }),
    )
    const failed = results.filter((result) => result.status === 'rejected').length
    const merged = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    const unique = new Map<string, PublicPrompt>()
    merged.forEach((prompt) => {
      const key = `${prompt.sourceId}:${prompt.id}`
      if (!unique.has(key)) unique.set(key, prompt)
    })
    publicPrompts.value = [...unique.values()]
    if (!publicPrompts.value.length) {
      publicPromptError.value = '提示词库加载失败，请检查网络连接或稍后重试'
    } else if (failed) {
      publicPromptError.value = `${failed} 个来源加载失败，已显示其余 ${publicPrompts.value.length} 条提示词`
    }
  } catch (error) {
    publicPromptError.value =
      error instanceof DOMException && error.name === 'AbortError'
        ? '提示词库加载超时，请稍后重试'
        : error instanceof Error
          ? `提示词库加载失败：${error.message}`
          : '提示词库加载失败'
  } finally {
    window.clearTimeout(timeoutId)
    publicPromptLoading.value = false
  }
}
function openPublicPromptLibrary() {
  promptManagerView.value = 'library'
  showCreatePrompt.value = false
  editingPromptId.value = null
  publicPromptVisibleLimit.value = 36
  publicPromptCategoriesExpanded.value = false
  void loadPublicPromptLibrary()
}
function toggleTemplatePanel() {
  showTemplatePanel.value = !showTemplatePanel.value
  if (showTemplatePanel.value) showAssetPanel.value = false
  if (showTemplatePanel.value && activeTemplateTab.value === 'library' && activeTemplateKind.value === 'prompt') {
    void loadPublicPromptLibrary()
  }
}
function toggleAssetPanel() {
  showAssetPanel.value = !showAssetPanel.value
  if (showAssetPanel.value) {
    showTemplatePanel.value = false
    pendingFileSource.action = 'standalone'
    pendingFileSource.targetNodeId = null
  }
}
function openAssetDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, 2)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(ASSET_STORE_NAME)) {
        database.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(CANVAS_MEDIA_STORE_NAME)) {
        database.createObjectStore(CANVAS_MEDIA_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开资产库'))
  })
}
async function putCanvasMedia(record: CanvasMediaRecord) {
  const database = await openAssetDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CANVAS_MEDIA_STORE_NAME, 'readwrite')
    transaction.objectStore(CANVAS_MEDIA_STORE_NAME).put(record)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}
async function getCanvasMedia(assetId: string) {
  const database = await openAssetDatabase()
  const record = await new Promise<CanvasMediaRecord | undefined>((resolve, reject) => {
    const request = database
      .transaction(CANVAS_MEDIA_STORE_NAME, 'readonly')
      .objectStore(CANVAS_MEDIA_STORE_NAME)
      .get(assetId)
    request.onsuccess = () => resolve(request.result as CanvasMediaRecord | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return record
}
function runtimeUrlForMedia(record: CanvasMediaRecord) {
  const existing = canvasMediaObjectUrls.get(record.id)
  if (existing) return existing
  const url = URL.createObjectURL(record.blob)
  canvasMediaObjectUrls.set(record.id, url)
  return url
}
async function blobFromMediaUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`媒体文件读取失败（HTTP ${response.status}）`)
  const blob = await response.blob()
  if (!blob.size) throw new Error('媒体文件为空')
  return blob
}
async function assignCanvasMediaBlob(node: CanvasNode, blob: Blob, name = node.title) {
  const assetId = `canvas-media-${Date.now()}-${uid()}`
  const record: CanvasMediaRecord = {
    id: assetId,
    blob,
    name,
    mimeType: blob.type || 'application/octet-stream',
    size: blob.size,
    createdAt: Date.now(),
  }
  await putCanvasMedia(record)
  node.assetId = assetId
  node.url = runtimeUrlForMedia(record)
  void refreshStorageUsage()
  return assetId
}
async function assignCanvasMediaUrl(node: CanvasNode, url: string, name = node.title) {
  return assignCanvasMediaBlob(node, await blobFromMediaUrl(url), name)
}
async function hydrateCanvasMedia(targetNodes = nodes.value) {
  let migrated = 0
  await Promise.all(
    targetNodes.map(async (node) => {
      if (!['image', 'video', 'audio'].includes(node.kind)) return
      if (node.assetId) {
        const record = await getCanvasMedia(node.assetId)
        if (record) node.url = runtimeUrlForMedia(record)
        else {
          node.url = undefined
          node.status = 'error'
          node.resultText = '媒体资产不存在，可能已被浏览器清理，请重新上传'
        }
        return
      }
      if (!node.url) return
      try {
        await assignCanvasMediaUrl(node, node.url, node.title)
        migrated += 1
      } catch {
        // Keep legacy or remote URLs usable when the browser cannot cache them.
      }
    }),
  )
  if (migrated) saveNow(true)
}
function canvasNodesForStorage(source = nodes.value) {
  return source.map((node) => {
    const stored = { ...node }
    if (stored.assetId && ['image', 'video', 'audio'].includes(stored.kind)) delete stored.url
    return stored
  })
}
async function loadAssetLibrary() {
  try {
    const database = await openAssetDatabase()
    assetLibraryItems.value = await new Promise<LibraryAsset[]>((resolve, reject) => {
      const request = database.transaction(ASSET_STORE_NAME, 'readonly').objectStore(ASSET_STORE_NAME).getAll()
      request.onsuccess = () => resolve((request.result || []).map((asset: LibraryAsset) => ({ ...asset, size: Number(asset.size) || dataUrlByteSize(asset.url) })))
      request.onerror = () => reject(request.error)
    })
    database.close()
    void refreshStorageUsage()
  } catch {
    flash('资产库读取失败，请检查浏览器存储权限')
  }
}
async function putLibraryAsset(asset: LibraryAsset) {
  const database = await openAssetDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ASSET_STORE_NAME, 'readwrite')
    transaction.objectStore(ASSET_STORE_NAME).put(asset)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}
function handleAssetDragEnter(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) assetDragActive.value = true
}
function handleAssetDragLeave(event: DragEvent) {
  const panel = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && panel.contains(event.relatedTarget)) return
  assetDragActive.value = false
}
async function uploadFilesToAssetLibrary(files: File[]) {
  if (assetUploadBusy.value || !files.length) return
  assetUploadBusy.value = true
  let imported = 0
  let skipped = 0
  let failed = 0
  let firstImportedKind: LibraryAsset['kind'] | undefined
  try {
    for (const file of files) {
      const kind = uploadedFileKind(file)
      if (!kind || kind === 'text') {
        skipped += 1
        continue
      }
      if (assetLibraryItems.value.some((asset) =>
        asset.kind === kind && asset.title === file.name && asset.size === file.size
      )) {
        skipped += 1
        continue
      }
      try {
        const asset: LibraryAsset = {
          id: `asset-${Date.now()}-${uid()}`,
          kind,
          title: file.name,
          url: await fileAsDataUrl(file),
          description: '',
          size: file.size,
          createdAt: Date.now(),
        }
        await putLibraryAsset(asset)
        assetLibraryItems.value.unshift(asset)
        firstImportedKind ||= kind
        imported += 1
      } catch {
        failed += 1
      }
    }
    if (firstImportedKind) activeAssetKind.value = firstImportedKind
    void refreshStorageUsage()
    if (imported) {
      flash(`已上传 ${imported} 个资产${skipped ? `，跳过 ${skipped} 个重复或不支持文件` : ''}${failed ? `，${failed} 个失败` : ''}`)
    } else if (failed) {
      flash('资产上传失败，请检查浏览器存储空间或文件是否可读')
    } else {
      flash('没有可上传的文件；资产库仅支持图片、视频和音频')
    }
  } finally {
    assetUploadBusy.value = false
  }
}
async function handleAssetDrop(event: DragEvent) {
  assetDragActive.value = false
  const files = [...(event.dataTransfer?.files || [])]
  await uploadFilesToAssetLibrary(files)
}
async function deleteLibraryAsset(asset: LibraryAsset) {
  try {
    const database = await openAssetDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ASSET_STORE_NAME, 'readwrite')
      transaction.objectStore(ASSET_STORE_NAME).delete(asset.id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
    assetLibraryItems.value = assetLibraryItems.value.filter((item) => item.id !== asset.id)
    void refreshStorageUsage()
    flash(`已从资产库删除“${asset.title}”`)
  } catch {
    flash('资产删除失败')
  }
}
function dataUrlByteSize(url: string) {
  if (!url.startsWith('data:')) return 0
  const commaIndex = url.indexOf(',')
  if (commaIndex < 0) return 0
  const metadata = url.slice(0, commaIndex)
  const body = url.slice(commaIndex + 1)
  if (!metadata.includes(';base64')) return new Blob([decodeURIComponent(body)]).size
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding)
}
async function mediaUrlByteSize(url: string) {
  const inlineSize = dataUrlByteSize(url)
  if (inlineSize) return inlineSize
  try {
    if (url.startsWith('blob:')) return (await (await fetch(url)).blob()).size
    const response = await fetch(url, { method: 'HEAD' })
    return Number(response.headers.get('content-length')) || 0
  } catch {
    return 0
  }
}
function formatAssetSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
function localAndSessionStorageByteSize() {
  let bytes = 0
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) || ''
      bytes += new Blob([key, storage.getItem(key) || '']).size
    }
  }
  return bytes
}
function assetLibraryByteSize() {
  if (!assetLibraryItems.value.length) return 0
  return new Blob([JSON.stringify(assetLibraryItems.value)]).size
}
async function refreshStorageUsage() {
  const measuredAppUsage = localAndSessionStorageByteSize() + assetLibraryByteSize()
  try {
    const estimate = await navigator.storage?.estimate?.()
    originStorageUsage.value = Math.max(measuredAppUsage, Number(estimate?.usage) || 0)
    originStorageQuota.value = Number(estimate?.quota) || 0
  } catch {
    originStorageUsage.value = measuredAppUsage
    originStorageQuota.value = 0
  }
}
const storageUsageLabel = computed(() => formatAssetSize(originStorageUsage.value).replace('大小未知', '0 B'))
async function saveNodeAsAsset(node: CanvasNode) {
  if (!['image', 'video', 'audio'].includes(node.kind) || !node.url) {
    return flash('当前控件没有可保存的媒体文件')
  }
  if (assetLibraryItems.value.some((asset) => asset.kind === node.kind && asset.url === node.url)) {
    return flash('这个文件已经保存在资产库中')
  }
  const asset: LibraryAsset = {
    id: `asset-${Date.now()}-${uid()}`,
    kind: node.kind as LibraryAsset['kind'],
    title: node.title,
    url: node.url,
    description: isMediaPlaceholderContent(node.content) ? '' : node.content,
    size: await mediaUrlByteSize(node.url),
    createdAt: Date.now(),
  }
  try {
    await putLibraryAsset(asset)
    assetLibraryItems.value.unshift(asset)
    void refreshStorageUsage()
    flash(`已将“${node.title}”存入资产库`)
  } catch {
    flash('资产保存失败，浏览器存储空间可能不足或不可用')
  }
}
function openFileSourceChoice(action: FileSourceAction, node?: CanvasNode) {
  pendingFileSource.action = action
  pendingFileSource.targetNodeId = node?.id || null
  pendingFileSource.preferredKind =
    node?.kind === 'video' || node?.kind === 'audio' || node?.kind === 'image' ? node.kind : 'image'
  showFileSourceChoice.value = true
}
function chooseLocalFileSource() {
  const action = pendingFileSource.action
  const node = pendingFileSource.targetNodeId ? nodeMap.value.get(pendingFileSource.targetNodeId) : undefined
  showFileSourceChoice.value = false
  if (action === 'standalone') return openStandaloneFilePicker()
  if (!node) return flash('目标控件已不存在')
  if (action === 'upstream') return openNodeFilePicker(node)
  selected.value = [node.id]
  if (node.kind === 'image') replaceImageInput.value?.click()
  else if (node.kind === 'video' || node.kind === 'audio') replaceMediaInput.value?.click()
}
function chooseAssetLibrarySource() {
  showFileSourceChoice.value = false
  activeAssetKind.value = pendingFileSource.preferredKind
  assetQuery.value = ''
  showTemplatePanel.value = false
  showAssetPanel.value = true
}
function assetNodeFromLibrary(asset: LibraryAsset, x: number, y: number): CanvasNode {
  return {
    id: `node-${uid()}`,
    kind: asset.kind,
    title: asset.title,
    x,
    y,
    width: 300,
    content: asset.description,
    url: asset.url,
    status: 'idle',
    version: 1,
    createdAt: Date.now(),
    imageWidth: asset.kind === 'image' ? 1024 : undefined,
    imageHeight: asset.kind === 'image' ? 1024 : undefined,
    imageAutoSize: asset.kind === 'image' ? true : undefined,
    imageCount: asset.kind === 'image' ? 1 : undefined,
    videoAspectWidth: asset.kind === 'video' ? 16 : undefined,
    videoAspectHeight: asset.kind === 'video' ? 9 : undefined,
    videoAutoSize: asset.kind === 'video' ? true : undefined,
    videoDuration: asset.kind === 'video' ? 5 : undefined,
    videoResolution: asset.kind === 'video' ? 720 : undefined,
    audioVoice: asset.kind === 'audio' ? 'alloy' : undefined,
    audioFormat: asset.kind === 'audio' ? 'mp3' : undefined,
    audioGenerationSpeed: asset.kind === 'audio' ? 1 : undefined,
    audioInstructions: asset.kind === 'audio' ? '自然' : undefined,
  }
}
async function useLibraryAsset(asset: LibraryAsset) {
  const action = pendingFileSource.action
  const target = pendingFileSource.targetNodeId ? nodeMap.value.get(pendingFileSource.targetNodeId) : undefined
  if (action === 'replace') {
    if (!target) return flash('需要替换的控件已不存在')
    if (target.kind !== asset.kind) return flash(`请选择${serviceKindLabel(target.kind as ServiceKind)}资产`)
    checkpoint()
    target.title = asset.title
    await assignCanvasMediaUrl(target, asset.url, asset.title)
    if (target.kind === 'audio') target.audioRecorded = false
    target.content = asset.description
    target.status = 'idle'
    target.resultText = undefined
    target.lastGeneration = undefined
    target.version = (target.version || 0) + 1
    if (target.kind === 'audio') delete audioPlaybackStates[target.id]
    showAssetPanel.value = false
    return flash(`已使用资产“${asset.title}”替换当前文件`)
  }
  if (action === 'upstream') {
    if (!target) return flash('目标控件已不存在')
    checkpoint()
    const node = assetNodeFromLibrary(asset, target.x - 430, target.y)
    node.url = undefined
    await assignCanvasMediaUrl(node, asset.url, asset.title)
    nodes.value.push(node)
    edges.value.push({
      id: `edge-${uid()}`,
      source: node.id,
      target: target.id,
      sourceHandle: 'output',
      targetHandle: 'input',
      order: incomingEdges(target.id).length + 1,
      enabled: true,
    })
    selected.value = [node.id]
    markNodeChanged(target)
    showAssetPanel.value = false
    return flash(`已从资产库添加“${asset.title}”并连接为上游`)
  }
  const center = screenToCanvas(window.innerWidth * 0.47, window.innerHeight * 0.5)
  checkpoint()
  const node = assetNodeFromLibrary(asset, center.x - 150, center.y - 150)
  node.url = undefined
  await assignCanvasMediaUrl(node, asset.url, asset.title)
  nodes.value.push(node)
  selected.value = [node.id]
  selectedEdge.value = null
  showAssetPanel.value = false
  flash(`已从资产库创建“${asset.title}”控件`)
}
function setTemplateTab(tab: 'mine' | 'library') {
  activeTemplateTab.value = tab
  if (tab === 'library' && activeTemplateKind.value === 'prompt') void loadPublicPromptLibrary()
}
function setTemplateKind(kind: 'canvas' | 'prompt') {
  activeTemplateKind.value = kind
  if (kind === 'prompt' && activeTemplateTab.value === 'library') void loadPublicPromptLibrary()
}
function returnToMyPrompts() {
  publicPromptDetail.value = null
  promptManagerView.value = 'mine'
}
function openPublicPromptDetail(prompt: PublicPrompt) {
  publicPromptDetail.value = prompt
}
function publicPromptImages(prompt: PublicPrompt) {
  return [...new Set([prompt.coverUrl, ...prompt.referenceImageUrls].filter(Boolean))]
}
function selectPublicPrompt(prompt: PublicPrompt) {
  const node = promptLibraryNode.value
  if (!node) return usePublicPromptTemplate(prompt)
  checkpoint()
  node.content = prompt.prompt
  markNodeChanged(node)
  closePromptLibrary()
  if (['image', 'video', 'audio'].includes(node.kind)) mediaPromptNodeId.value = node.id
  flash(`已使用提示词“${prompt.title}”`)
}
function startCreatePrompt() {
  editingPromptId.value = null
  showCreatePrompt.value = true
  promptCreateDraft.text = ''
  promptCreateDraft.kind = promptLibraryNode.value
    ? nodeServiceKind(promptLibraryNode.value)
    : 'text'
}
function cancelCreatePrompt() {
  showCreatePrompt.value = false
  promptCreateDraft.text = ''
}
function saveCreatedPrompt() {
  if (!promptCreateDraft.text.trim()) return flash('请输入提示词内容')
  if (savePromptText(promptCreateDraft.text, promptCreateDraft.kind)) cancelCreatePrompt()
}
function selectSavedPrompt(prompt: SavedPrompt) {
  const node = promptLibraryNode.value
  if (!node) return
  checkpoint()
  node.content = prompt.text
  markNodeChanged(node)
  closePromptLibrary()
  if (['image', 'video', 'audio'].includes(node.kind)) mediaPromptNodeId.value = node.id
  flash(`已填入${serviceKindLabel(prompt.kind)}提示词`)
}
function startEditSavedPrompt(prompt: SavedPrompt) {
  editingPromptId.value = prompt.id
  promptEditDraft.text = prompt.text
  promptEditDraft.kind = prompt.kind
}
function cancelEditSavedPrompt() {
  editingPromptId.value = null
  promptEditDraft.text = ''
  promptEditDraft.kind = 'text'
}
function saveEditedPrompt(prompt: SavedPrompt) {
  const text = promptEditDraft.text.trim().slice(0, 32000)
  if (!text) return flash('提示词不能为空')
  const previous = { ...prompt }
  prompt.text = text
  prompt.kind = promptEditDraft.kind
  prompt.updatedAt = Date.now()
  try {
    persistSavedPrompts()
    cancelEditSavedPrompt()
    flash('提示词已修改')
  } catch {
    Object.assign(prompt, previous)
    flash('提示词修改失败')
  }
}
function deleteSavedPrompt(prompt: SavedPrompt) {
  if (!window.confirm('确定删除这条提示词吗？')) return
  const previous = savedPrompts.value
  savedPrompts.value = savedPrompts.value.filter((item) => item.id !== prompt.id)
  try {
    persistSavedPrompts()
    if (editingPromptId.value === prompt.id) cancelEditSavedPrompt()
    if (editingTemplateId.value === prompt.id) cancelTemplateRename()
    flash('提示词已删除')
  } catch {
    savedPrompts.value = previous
    flash('提示词删除失败')
  }
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
  const isMedia = kind === 'image' || kind === 'video' || kind === 'audio'
  const savedMediaPrompt = isMedia && !isMediaPlaceholderContent(node.content) ? node.content : ''
  const savedContent = kind === 'text' ? node.content : savedMediaPrompt
  return {
    id: node.id,
    groupId: node.groupId,
    kind,
    title: node.title.trim() || defaults[kind].title,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    content: savedContent,
    status: 'idle',
    version: 1,
    createdAt: index + 1,
    imageWidth: kind === 'image' ? 1024 : undefined,
    imageHeight: kind === 'image' ? 1024 : undefined,
    imageAutoSize: kind === 'image' ? true : undefined,
    imageCount: kind === 'image' ? 1 : undefined,
    videoAspectWidth: kind === 'video' ? 16 : undefined,
    videoAspectHeight: kind === 'video' ? 9 : undefined,
    videoAutoSize: kind === 'video' ? true : undefined,
    videoDuration: kind === 'video' ? 5 : undefined,
    videoResolution: kind === 'video' ? 720 : undefined,
    audioVoice: kind === 'audio' ? 'alloy' : undefined,
    audioFormat: kind === 'audio' ? 'mp3' : undefined,
    audioGenerationSpeed: kind === 'audio' ? 1 : undefined,
    audioInstructions: kind === 'audio' ? '自然' : undefined,
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
function startTemplateRename(template: Pick<CanvasTemplate, 'id' | 'name'>) {
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
function savedPromptTemplateName(prompt: SavedPrompt, index = 0) {
  if (prompt.name?.trim()) return prompt.name.trim()
  const firstLine = prompt.text.split(/\r?\n/).find((line) => line.trim())?.trim() || ''
  return firstLine.length > 22 ? `${firstLine.slice(0, 22)}…` : firstLine || `提示词 ${index + 1}`
}
function startPromptTemplateRename(prompt: SavedPrompt, index = 0) {
  editingTemplateId.value = prompt.id
  templateNameDraft.value = savedPromptTemplateName(prompt, index)
}
function commitPromptTemplateRename(prompt: SavedPrompt, index = 0) {
  if (editingTemplateId.value !== prompt.id) return
  const nextName = templateNameDraft.value.trim().slice(0, 60)
  const previousName = prompt.name
  const currentName = savedPromptTemplateName(prompt, index)
  if (!nextName || nextName === currentName) {
    cancelTemplateRename()
    return
  }
  prompt.name = nextName
  prompt.updatedAt = Date.now()
  try {
    persistSavedPrompts()
    flash(`提示词模板已重命名为“${nextName}”`)
  } catch {
    prompt.name = previousName
    flash('提示词模板名称保存失败')
  }
  cancelTemplateRename()
}
function saveSelectedNodeToMyPrompts() {
  const current = selectedNode.value
  if (!current?.content.trim()) return flash('请先选择一个有提示词内容的节点')
  savePromptText(current.content, nodeServiceKind(current))
}
function usePromptTemplate(template: SavedPrompt, index = 0) {
  const templateName = savedPromptTemplateName(template, index)
  let target = selectedNode.value
  if (!target || nodeServiceKind(target) !== template.kind) {
    addNode(template.kind)
    target = selectedNode.value
    if (target) target.title = templateName
  } else {
    checkpoint()
  }
  if (!target) return
  target.content = template.text
  markNodeChanged(target)
  if (['image', 'video', 'audio'].includes(target.kind)) mediaPromptNodeId.value = target.id
  showTemplatePanel.value = false
  flash(`已使用提示词模板“${templateName}”`)
}
function usePublicPromptTemplate(prompt: PublicPrompt) {
  let target = selectedNode.value
  if (!target || nodeServiceKind(target) !== 'image') {
    addNode('image')
    target = selectedNode.value
    if (target) target.title = prompt.title
  } else {
    checkpoint()
  }
  if (!target) return
  target.content = prompt.prompt
  markNodeChanged(target)
  mediaPromptNodeId.value = target.id
  publicPromptDetail.value = null
  showTemplatePanel.value = false
  flash(`已使用提示词“${prompt.title}”`)
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
  const templateGroupMap = new Map<string, string>()
  template.nodes.forEach((node) => {
    if (node.groupId && !templateGroupMap.has(node.groupId)) {
      templateGroupMap.set(node.groupId, `group-${uid()}-${now}`)
    }
  })
  const remapTemplateMentions = (content: string) =>
    content.replace(/@\[node:([^\]]+)\]/g, (token, sourceId: string) => {
      const mappedId = idMap.get(sourceId)
      return mappedId ? `@[node:${mappedId}]` : token
    })
  const copiedNodes = cloneValue(template.nodes).map((node, index) => {
    return {
      ...node,
      id: idMap.get(node.id)!,
      groupId: node.groupId ? templateGroupMap.get(node.groupId) : undefined,
      content: remapTemplateMentions(node.content),
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
      sourceGroupId: edge.sourceGroupId ? templateGroupMap.get(edge.sourceGroupId) : undefined,
      targetGroupId: edge.targetGroupId ? templateGroupMap.get(edge.targetGroupId) : undefined,
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
function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片文件读取失败，请重新替换图片后再试'))
    image.src = url
  })
}
function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('浏览器无法导出放大后的图片'))),
      'image/png',
      1,
    )
  })
}
function drawUpscaleStep(
  source: CanvasImageSource,
  width: number,
  height: number,
  smoothing: boolean,
  quality: ImageSmoothingQuality = 'high',
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法创建图片处理画布')
  context.imageSmoothingEnabled = smoothing
  if (smoothing) context.imageSmoothingQuality = quality
  context.drawImage(source, 0, 0, width, height)
  return canvas
}
async function upscaleImageLocally(
  url: string,
  width: number,
  height: number,
  algorithm: ImageUpscaleAlgorithm,
) {
  const sourceImage = await loadCanvasImage(url)
  if (algorithm === 'nearest') {
    return canvasToPngBlob(drawUpscaleStep(sourceImage, width, height, false))
  }
  if (algorithm === 'bilinear') {
    return canvasToPngBlob(drawUpscaleStep(sourceImage, width, height, true, 'medium'))
  }

  let source: CanvasImageSource = sourceImage
  let stepWidth = sourceImage.naturalWidth
  let stepHeight = sourceImage.naturalHeight
  while (Math.max(stepWidth, stepHeight) * 2 < Math.max(width, height)) {
    stepWidth = Math.min(width, stepWidth * 2)
    stepHeight = Math.min(height, stepHeight * 2)
    source = drawUpscaleStep(source, stepWidth, stepHeight, true, 'high')
  }
  return canvasToPngBlob(drawUpscaleStep(source, width, height, true, 'high'))
}
async function openImageUpscale(node: CanvasNode) {
  if (!node.url) {
    flash('请先为图片节点添加文件')
    return
  }
  imageUpscaleNodeId.value = node.id
  imageUpscaleDraft.loading = true
  imageUpscaleDraft.running = false
  imageUpscaleDraft.sourceWidth = 0
  imageUpscaleDraft.sourceHeight = 0
  imageUpscaleDraft.algorithm = 'high'
  try {
    const image = await loadCanvasImage(node.url)
    if (imageUpscaleNodeId.value !== node.id) return
    imageUpscaleDraft.sourceWidth = image.naturalWidth
    imageUpscaleDraft.sourceHeight = image.naturalHeight
    const sourceLongEdge = Math.max(image.naturalWidth, image.naturalHeight)
    imageUpscaleDraft.targetLongEdge =
      IMAGE_UPSCALE_TARGETS.find((target) => target > sourceLongEdge) || 4096
  } catch (error) {
    imageUpscaleNodeId.value = null
    flash(error instanceof Error ? error.message : '图片读取失败')
  } finally {
    imageUpscaleDraft.loading = false
  }
}
function closeImageUpscale() {
  if (imageUpscaleDraft.running) return
  imageUpscaleNodeId.value = null
}
function imageUpscaleAlgorithmLabel(algorithm: ImageUpscaleAlgorithm) {
  return algorithm === 'high' ? '高清插值' : algorithm === 'bilinear' ? '双线性' : '最近邻'
}
async function createUpscaledImageNode() {
  const source = imageUpscaleNode.value
  const output = imageUpscaleOutputSize.value
  if (!source?.url || !output.width || !output.height || imageUpscaleDraft.running) return
  if (imageUpscaleDraft.targetLongEdge <= Math.max(imageUpscaleDraft.sourceWidth, imageUpscaleDraft.sourceHeight)) {
    flash('请选择高于原图分辨率的目标尺寸')
    return
  }
  imageUpscaleDraft.running = true
  try {
    const blob = await upscaleImageLocally(
      source.url,
      output.width,
      output.height,
      imageUpscaleDraft.algorithm,
    )
    const child: CanvasNode = {
      id: `node-${uid()}`,
      kind: 'image',
      title: `${source.title} · 放大图`,
      x: source.x + source.width + 110,
      y: source.y,
      width: source.width,
      content: source.content,
      status: 'success',
      version: 1,
      createdAt: Date.now(),
      resultText: `已通过${imageUpscaleAlgorithmLabel(imageUpscaleDraft.algorithm)}放大至 ${output.width} × ${output.height}`,
      imageWidth: output.width,
      imageHeight: output.height,
      imageAutoSize: false,
      imageCount: 1,
      imagePrompt: source.imagePrompt,
      modelChannelId: source.modelChannelId,
    }
    await assignCanvasMediaBlob(child, blob, `${source.title}-${output.width}x${output.height}.png`)
    checkpoint()
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
    selected.value = [child.id]
    selectedEdge.value = null
    imageUpscaleNodeId.value = null
    flash(`已生成 ${output.width} × ${output.height} 放大图`)
  } catch (error) {
    flash(error instanceof Error ? error.message : '图片放大失败')
  } finally {
    imageUpscaleDraft.running = false
  }
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
  const nodeWidth = kind === 'text' ? 360 : kind === 'config' ? 310 : 300
  const nodeHeight = kind === 'text' ? 300 : undefined
  const node: CanvasNode = {
    id: `node-${uid()}`,
    kind,
    title: defaults[kind].title!,
    content: defaults[kind].content!,
    status: defaults[kind].status,
    x: center.x - nodeWidth / 2,
    y: center.y - (nodeHeight || 180) / 2,
    width: nodeWidth,
    height: nodeHeight,
    version: 1,
    createdAt: Date.now(),
    imageWidth: kind === 'image' ? 1024 : undefined,
    imageHeight: kind === 'image' ? 1024 : undefined,
    imageAutoSize: kind === 'image' ? true : undefined,
    imageCount: kind === 'image' ? 1 : undefined,
    videoAspectWidth: kind === 'video' ? 16 : undefined,
    videoAspectHeight: kind === 'video' ? 9 : undefined,
    videoAutoSize: kind === 'video' ? true : undefined,
    videoDuration: kind === 'video' ? 5 : undefined,
    videoResolution: kind === 'video' ? 720 : undefined,
    audioVoice: kind === 'audio' ? 'alloy' : undefined,
    audioFormat: kind === 'audio' ? 'mp3' : undefined,
    audioGenerationSpeed: kind === 'audio' ? 1 : undefined,
    audioInstructions: kind === 'audio' ? '自然' : undefined,
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
function activeGridSize() {
  return settings.grid === '网格' ? 28 : 24
}
function snapCanvasValue(value: number) {
  if (!settings.snap) return value
  const size = activeGridSize()
  return Math.round(value / size) * size
}
function updateDraggedNodePosition() {
  if (!drag?.id) return
  const dx = (dragPointer.x - drag.startX - (viewport.x - drag.vx)) / viewport.zoom
  const dy = (dragPointer.y - drag.startY - (viewport.y - drag.vy)) / viewport.zoom
  const origins = drag.selectedOrigins || [{ id: drag.id, x: drag.nodeX!, y: drag.nodeY! }]
  const anchor = origins.find((origin) => origin.id === drag!.id) || origins[0]!
  const snappedDx = snapCanvasValue(anchor.x + dx) - anchor.x
  const snappedDy = snapCanvasValue(anchor.y + dy) - anchor.y
  origins.forEach((origin) => {
    const node = nodeMap.value.get(origin.id)
    if (!node) return
    node.x = origin.x + snappedDx
    node.y = origin.y + snappedDy
  })
}
function updateLinkingPointerPosition() {
  if (!linkingFrom.value && !linkingGroupSources.value.length) return
  const point = screenToCanvas(dragPointer.x, dragPointer.y)
  linkingPointer.x = point.x
  linkingPointer.y = point.y
}
function stopEdgeAutoPan() {
  if (autoPanFrame) cancelAnimationFrame(autoPanFrame)
  autoPanFrame = 0
}
function edgeAutoPanStep() {
  autoPanFrame = 0
  if ((!drag?.id && !linkingFrom.value && !linkingGroupSources.value.length) || !canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const threshold = 72
  const maxSpeed = 8
  const edgeSpeed = (distance: number) =>
    distance >= threshold ? 0 : Math.max(1, maxSpeed * (1 - Math.max(0, distance) / threshold))
  let dx = 0
  let dy = 0
  if (dragPointer.x < rect.left + threshold) dx = edgeSpeed(dragPointer.x - rect.left)
  else if (dragPointer.x > rect.right - threshold) dx = -edgeSpeed(rect.right - dragPointer.x)
  if (dragPointer.y < rect.top + threshold) dy = edgeSpeed(dragPointer.y - rect.top)
  else if (dragPointer.y > rect.bottom - threshold) dy = -edgeSpeed(rect.bottom - dragPointer.y)
  if (dx || dy) {
    viewport.x += dx
    viewport.y += dy
    updateDraggedNodePosition()
    updateLinkingPointerPosition()
    autoPanFrame = requestAnimationFrame(edgeAutoPanStep)
  }
}
function scheduleEdgeAutoPan() {
  if (!autoPanFrame) autoPanFrame = requestAnimationFrame(edgeAutoPanStep)
}
function groupNodeIds(groupId: string) {
  return nodes.value.filter((node) => node.groupId === groupId).map((node) => node.id)
}
function selectNodeGroupOnPointerDown(event: PointerEvent, node: CanvasNode) {
  if (!node.groupId || event.button !== 0 || event.ctrlKey || event.metaKey) return
  const ids = groupNodeIds(node.groupId)
  if (!ids.length) return
  if (ids.length !== selected.value.length || ids.some((id) => !selected.value.includes(id))) {
    selected.value = ids
    selectedEdge.value = null
  }
}
function startSelectionFrameDrag(event: PointerEvent, nodeIds: string[]) {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('button,.selection-group-toolbar')) return
  const movableNodes = nodeIds.map((id) => nodeMap.value.get(id)).filter((node): node is CanvasNode => Boolean(node))
  if (!movableNodes.length) return
  event.preventDefault()
  event.stopPropagation()
  selected.value = movableNodes.map((node) => node.id)
  movingGroupNodeIds.value = movableNodes.map((node) => node.id)
  selectedEdge.value = null
  checkpoint()
  const captureTarget = event.currentTarget as HTMLElement
  captureTarget.setPointerCapture(event.pointerId)
  drag = {
    id: movableNodes[0]!.id,
    startX: event.clientX,
    startY: event.clientY,
    nodeX: movableNodes[0]!.x,
    nodeY: movableNodes[0]!.y,
    vx: viewport.x,
    vy: viewport.y,
    pointerId: event.pointerId,
    captureTarget,
    moved: false,
    selectedOrigins: movableNodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
  }
  dragPointer = { x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag, { once: true })
  window.addEventListener('pointercancel', endDrag, { once: true })
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
  if (node.groupId && !event.ctrlKey && !event.metaKey) {
    const memberIds = groupNodeIds(node.groupId)
    if (!memberIds.every((id) => selected.value.includes(id))) selected.value = memberIds
  } else if (!selected.value.includes(node.id)) {
    selected.value = event.ctrlKey || event.metaKey ? [...selected.value, node.id] : [node.id]
  }
  movingGroupNodeIds.value = node.groupId || selected.value.length > 1 ? [...selected.value] : []
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
    openMediaPromptId: ['image', 'video', 'audio'].includes(node.kind) ? node.id : undefined,
    moved: false,
    selectedOrigins: selected.value.map((id) => {
      const selectedNode = nodeMap.value.get(id)!
      return { id, x: selectedNode.x, y: selectedNode.y }
    }),
  }
  dragPointer = { x: event.clientX, y: event.clientY }
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
  if (event.button !== 0 && event.button !== 1) return
  event.preventDefault()
  const captureTarget = event.currentTarget as HTMLElement
  captureTarget.setPointerCapture(event.pointerId)
  if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
    const point = screenToCanvas(event.clientX, event.clientY)
    marquee.active = true
    marquee.startX = point.x
    marquee.startY = point.y
    marquee.currentX = point.x
    marquee.currentY = point.y
    marquee.baseSelection = [...selected.value]
    selectedEdge.value = null
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      vx: viewport.x,
      vy: viewport.y,
      pointerId: event.pointerId,
      captureTarget,
      marquee: true,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag, { once: true })
    window.addEventListener('pointercancel', endDrag, { once: true })
    return
  }
  drag = {
    startX: event.clientX,
    startY: event.clientY,
    vx: viewport.x,
    vy: viewport.y,
    pointerId: event.pointerId,
    captureTarget,
    moved: false,
    clearSelectionOnClick: true,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag, { once: true })
  window.addEventListener('pointercancel', endDrag, { once: true })
}
function onPointerMove(event: PointerEvent) {
  if (!drag) return
  dragPointer = { x: event.clientX, y: event.clientY }
  if (drag.marquee) {
    const point = screenToCanvas(event.clientX, event.clientY)
    marquee.currentX = point.x
    marquee.currentY = point.y
    const bounds = marqueeBounds.value
    const matched = nodes.value
      .filter((node) => {
        const width = renderedNodeSizes[node.id]?.width || node.width
        const height = renderedNodeSizes[node.id]?.height || node.height || 220
        return node.x < bounds.x + bounds.width && node.x + width > bounds.x && node.y < bounds.y + bounds.height && node.y + height > bounds.y
      })
      .map((node) => node.id)
    selected.value = [...new Set([...marquee.baseSelection, ...matched])]
  } else if (drag.id) {
    if (
      Math.abs(event.clientX - drag.startX) > 4 ||
      Math.abs(event.clientY - drag.startY) > 4
    )
      drag.moved = true
    updateDraggedNodePosition()
    scheduleEdgeAutoPan()
  } else {
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) drag.moved = true
    viewport.x = drag.vx + event.clientX - drag.startX
    viewport.y = drag.vy + event.clientY - drag.startY
  }
}
function endDrag() {
  const mediaNodeId =
    drag?.openMediaPromptId && !drag.moved ? drag.openMediaPromptId : undefined
  if (drag?.captureTarget.hasPointerCapture(drag.pointerId))
    drag.captureTarget.releasePointerCapture(drag.pointerId)
  const wasMarquee = Boolean(drag?.marquee)
  const shouldClearSelection = Boolean(drag?.clearSelectionOnClick && !drag.moved)
  drag = null
  movingGroupNodeIds.value = []
  if (wasMarquee) marquee.active = false
  if (shouldClearSelection) {
    selected.value = []
    selectedEdge.value = null
  }
  stopEdgeAutoPan()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (mediaNodeId) {
    const node = nodeMap.value.get(mediaNodeId)
    if (node) openMediaPrompt(node)
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
  const fixedRight = resize.nodeX + resize.width
  const fixedBottom = resize.nodeY + resize.height
  const requestedLeft = fromWest ? resize.nodeX + deltaX : resize.nodeX
  const requestedTop = fromNorth ? resize.nodeY + deltaY : resize.nodeY
  const requestedRight = fromWest ? fixedRight : fixedRight + deltaX
  const requestedBottom = fromNorth ? fixedBottom : fixedBottom + deltaY
  const snappedLeft = fromWest ? snapCanvasValue(requestedLeft) : resize.nodeX
  const snappedTop = fromNorth ? snapCanvasValue(requestedTop) : resize.nodeY
  const snappedRight = fromWest ? fixedRight : snapCanvasValue(requestedRight)
  const snappedBottom = fromNorth ? fixedBottom : snapCanvasValue(requestedBottom)
  const nextWidth = Math.max(220, snappedRight - snappedLeft)
  const nextHeight = Math.max(160, snappedBottom - snappedTop)
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
function normalizedWheelDelta(event: WheelEvent, pageHeight: number) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1
  return Math.max(-120, Math.min(120, event.deltaY * unit))
}
function flushWheelZoom() {
  wheelZoomFrame = 0
  if (!pendingWheelZoomDelta) return
  const old = viewport.zoom
  const next = Math.min(2, Math.max(0.35, old * Math.exp(-pendingWheelZoomDelta * 0.0015)))
  const { x: px, y: py } = pendingWheelZoomAnchor
  pendingWheelZoomDelta = 0
  if (Math.abs(next - old) < 0.00001) return
  viewport.x = px - ((px - viewport.x) / old) * next
  viewport.y = py - ((py - viewport.y) / old) * next
  viewport.zoom = next
}
function scheduleWheelZoom(delta: number, x: number, y: number) {
  pendingWheelZoomDelta = Math.max(-120, Math.min(120, pendingWheelZoomDelta + delta))
  pendingWheelZoomAnchor = { x, y }
  if (!wheelZoomFrame) wheelZoomFrame = requestAnimationFrame(flushWheelZoom)
}
function stopWheelZoom() {
  if (wheelZoomFrame) cancelAnimationFrame(wheelZoomFrame)
  wheelZoomFrame = 0
  pendingWheelZoomDelta = 0
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
  if (inputMode.value === 'mouse' || event.ctrlKey || event.metaKey) {
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    scheduleWheelZoom(normalizedWheelDelta(event, rect.height), px, py)
    return
  }
  viewport.x -= event.deltaX
  viewport.y -= event.deltaY
}
function resetView() {
  viewport.x = 50
  viewport.y = 40
  viewport.zoom = 1
}
function arrangeNodeSubset(targetNodes: CanvasNode[], successMessage: string) {
  if (!targetNodes.length) return flash('没有可整理的卡片')
  if (!nodes.value.length) return flash('画布中没有可整理的卡片')
  checkpoint()

  const nodeById = new Map(targetNodes.map((node) => [node.id, node]))
  const outgoing = new Map(targetNodes.map((node) => [node.id, [] as string[]]))
  const indegree = new Map(targetNodes.map((node) => [node.id, 0]))
  edges.value.forEach((edge) => {
    if (!edge.enabled) return
    expandedEdgePairs(edge).forEach(({ source, target }) => {
      if (!nodeById.has(source) || !nodeById.has(target)) return
      outgoing.get(source)?.push(target)
      indegree.set(target, (indegree.get(target) || 0) + 1)
    })
  })

  const stableOrder = (a: CanvasNode, b: CanvasNode) =>
    a.y - b.y || a.x - b.x || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  const queue = targetNodes.filter((node) => indegree.get(node.id) === 0).sort(stableOrder)
  const levels = new Map(targetNodes.map((node) => [node.id, 0]))
  const processed = new Set<string>()
  while (queue.length) {
    const node = queue.shift()!
    processed.add(node.id)
    for (const targetId of outgoing.get(node.id) || []) {
      levels.set(targetId, Math.max(levels.get(targetId) || 0, (levels.get(node.id) || 0) + 1))
      const nextIndegree = (indegree.get(targetId) || 0) - 1
      indegree.set(targetId, nextIndegree)
      if (nextIndegree === 0) {
        const target = nodeById.get(targetId)
        if (target) {
          queue.push(target)
          queue.sort(stableOrder)
        }
      }
    }
  }

  // 正常交互会阻止循环；对旧数据中的异常循环也给出稳定的兜底层级。
  const lastLevel = Math.max(0, ...levels.values())
  targetNodes.filter((node) => !processed.has(node.id)).sort(stableOrder).forEach((node) => {
    levels.set(node.id, lastLevel + 1)
  })

  const groups = new Map<number, CanvasNode[]>()
  targetNodes.forEach((node) => {
    const level = levels.get(node.id) || 0
    const group = groups.get(level) || []
    group.push(node)
    groups.set(level, group)
  })
  groups.forEach((group) => group.sort(stableOrder))

  const startX = Math.min(...targetNodes.map((node) => node.x))
  const startY = Math.min(...targetNodes.map((node) => node.y))
  const horizontalGap = 150
  const verticalGap = 76
  let columnX = startX
  ;[...groups.keys()].sort((a, b) => a - b).forEach((level) => {
    const group = groups.get(level) || []
    const columnWidth = Math.max(...group.map((node) => renderedNodeSizes[node.id]?.width || node.width))
    let rowY = startY
    group.forEach((node) => {
      node.x = Math.round(columnX)
      node.y = Math.round(rowY)
      const height = renderedNodeSizes[node.id]?.height || node.height || 220
      rowY += height + verticalGap
    })
    columnX += columnWidth + horizontalGap
  })
  flash(successMessage)
  return
  flash(`已按数据流整理 ${nodes.value.length} 张卡片`)
}
function autoArrangeNodes() {
  arrangeNodeSubset(nodes.value, `已按数据流整理 ${nodes.value.length} 张卡片`)
}
function arrangeSelectedNodes() {
  const selectedNodes = selected.value.map((id) => nodeMap.value.get(id)).filter((node): node is CanvasNode => Boolean(node))
  arrangeNodeSubset(selectedNodes, `已整理选区内 ${selectedNodes.length} 张卡片`)
}
function dedupeLogicalEdges(items: Edge[]) {
  const seen = new Set<string>()
  return items.filter((edge) => {
    const sourceKey = edge.sourceGroupId ? `group:${edge.sourceGroupId}` : `node:${edge.source}`
    const targetKey = edge.targetGroupId ? `group:${edge.targetGroupId}` : `node:${edge.target}`
    const key = `${sourceKey}->${targetKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
function setSelectedAsGroup() {
  if (selected.value.length < 2) return
  checkpoint()
  if (selectionIsSingleGroup.value && selectedPersistentGroupId.value) {
    const groupId = selectedPersistentGroupId.value
    const members = groupNodeIds(groupId)
    const converted = edges.value.flatMap((edge) => {
      const sources = edge.sourceGroupId === groupId ? members : [edge.source]
      const targets = edge.targetGroupId === groupId ? members : [edge.target]
      return sources.flatMap((source) => targets.map((target) => ({
        ...edge,
        id: sources.length === 1 && targets.length === 1 ? edge.id : `edge-${uid()}`,
        source,
        target,
        sourceGroupId: edge.sourceGroupId === groupId ? undefined : edge.sourceGroupId,
        targetGroupId: edge.targetGroupId === groupId ? undefined : edge.targetGroupId,
      })))
    })
    edges.value = dedupeLogicalEdges(converted)
    members.forEach((id) => {
      const node = nodeMap.value.get(id)
      if (node) node.groupId = undefined
    })
    flash(`已解除分组，${members.length} 个节点恢复为独立连线端点`)
    return
  }
  const groupId = `group-${uid()}-${Date.now()}`
  const memberIds = new Set(selected.value)
  const previousGroupIds = new Set(
    selected.value.map((id) => nodeMap.value.get(id)?.groupId).filter((id): id is string => Boolean(id)),
  )
  selected.value.forEach((id) => {
    const node = nodeMap.value.get(id)
    if (node) node.groupId = groupId
  })
  const representative = selected.value[0]!
  edges.value = dedupeLogicalEdges(edges.value.map((edge) => {
    let nextEdge = edge
    if (edge.sourceGroupId && previousGroupIds.has(edge.sourceGroupId)) {
      const remaining = groupNodeIds(edge.sourceGroupId)
      nextEdge = remaining.length === 0
        ? { ...nextEdge, source: representative, sourceGroupId: groupId }
        : remaining.length === 1
          ? { ...nextEdge, source: remaining[0]!, sourceGroupId: undefined }
          : nextEdge
    }
    if (edge.targetGroupId && previousGroupIds.has(edge.targetGroupId)) {
      const remaining = groupNodeIds(edge.targetGroupId)
      nextEdge = remaining.length === 0
        ? { ...nextEdge, target: representative, targetGroupId: groupId }
        : remaining.length === 1
          ? { ...nextEdge, target: remaining[0]!, targetGroupId: undefined }
          : nextEdge
    }
    const sourceInside = !nextEdge.sourceGroupId && memberIds.has(nextEdge.source)
    const targetInside = !nextEdge.targetGroupId && memberIds.has(nextEdge.target)
    if (sourceInside && !targetInside) return { ...nextEdge, source: representative, sourceGroupId: groupId }
    if (targetInside && !sourceInside) return { ...nextEdge, target: representative, targetGroupId: groupId }
    return nextEdge
  }))
  previousGroupIds.forEach((previousGroupId) => {
    const remaining = groupNodeIds(previousGroupId)
    if (remaining.length === 1) {
      const node = nodeMap.value.get(remaining[0]!)
      if (node) node.groupId = undefined
    }
  })
  flash(`已将 ${selected.value.length} 个节点设为分组`)
}
function duplicateSelectedNodes() {
  const sourceNodes = selected.value.map((id) => nodeMap.value.get(id)).filter((node): node is CanvasNode => Boolean(node))
  if (!sourceNodes.length) return
  checkpoint()
  const now = Date.now()
  const idMap = new Map(sourceNodes.map((node) => [node.id, `node-${uid()}-${now}`]))
  const groupMap = new Map<string, string>()
  sourceNodes.forEach((node) => {
    if (node.groupId && !groupMap.has(node.groupId)) groupMap.set(node.groupId, `group-${uid()}-${now}`)
  })
  const remapMentions = (content: string) => content.replace(/@\[node:([^\]]+)\]/g, (token, sourceId: string) => {
    const mappedId = idMap.get(sourceId)
    return mappedId ? `@[node:${mappedId}]` : token
  })
  const copies = cloneValue(sourceNodes).map((node, index) => ({
    ...node,
    id: idMap.get(node.id)!,
    groupId: node.groupId ? groupMap.get(node.groupId) : undefined,
    title: `${node.title} · 副本`,
    content: remapMentions(node.content),
    x: node.x + 60,
    y: node.y + 60,
    createdAt: now + index,
  }))
  const copiedEdges = edges.value
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...cloneValue(edge),
      id: `edge-${uid()}-${now}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      sourceGroupId: edge.sourceGroupId ? groupMap.get(edge.sourceGroupId) : undefined,
      targetGroupId: edge.targetGroupId ? groupMap.get(edge.targetGroupId) : undefined,
    }))
  nodes.value.push(...copies)
  edges.value.push(...copiedEdges)
  selected.value = copies.map((node) => node.id)
  selectedEdge.value = null
  flash(`已创建 ${copies.length} 个节点和 ${copiedEdges.length} 条内部连线的副本`)
}
function copySelectedNodes() {
  if (!selected.value.length) return
  const selectedIds = new Set(selected.value)
  const completeGroupIds = new Set(
    [...new Set(selected.value.map((id) => nodeMap.value.get(id)?.groupId).filter((id): id is string => Boolean(id)))]
      .filter((groupId) => groupNodeIds(groupId).every((id) => selectedIds.has(id))),
  )
  const copiedNodes = selected.value
    .map((id) => nodeMap.value.get(id))
    .filter((node): node is CanvasNode => Boolean(node))
    .map((node) => ({
      ...cloneValue(node),
      groupId: node.groupId && completeGroupIds.has(node.groupId) ? node.groupId : undefined,
    }))
  const copiedEdges = edges.value
    .filter((edge) =>
      edgeSourceNodeIds(edge).every((id) => selectedIds.has(id)) &&
      edgeTargetNodeIds(edge).every((id) => selectedIds.has(id)),
    )
    .map((edge) => cloneValue(edge))
  nodeClipboard = { nodes: copiedNodes, edges: copiedEdges }
  clipboardPasteCount = 0
  flash(`已复制 ${copiedNodes.length} 个节点`)
}
function pasteCopiedNodes() {
  if (!nodeClipboard?.nodes.length) {
    flash('没有可粘贴的节点，请先复制控件')
    return
  }
  checkpoint()
  clipboardPasteCount += 1
  const now = Date.now()
  const offset = 48 * clipboardPasteCount
  const idMap = new Map(nodeClipboard.nodes.map((node) => [node.id, `node-${uid()}-${now}`]))
  const groupMap = new Map<string, string>()
  nodeClipboard.nodes.forEach((node) => {
    if (node.groupId && !groupMap.has(node.groupId)) groupMap.set(node.groupId, `group-${uid()}-${now}`)
  })
  const remapMentions = (content: string) => content.replace(/@\[node:([^\]]+)\]/g, (token, sourceId: string) => {
    const mappedId = idMap.get(sourceId)
    return mappedId ? `@[node:${mappedId}]` : token
  })
  const copies = cloneValue(nodeClipboard.nodes).map((node, index) => ({
    ...node,
    id: idMap.get(node.id)!,
    groupId: node.groupId ? groupMap.get(node.groupId) : undefined,
    title: `${node.title} · 副本`,
    content: remapMentions(node.content),
    x: node.x + offset,
    y: node.y + offset,
    createdAt: now + index,
  }))
  const copiedEdges = cloneValue(nodeClipboard.edges)
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: `edge-${uid()}-${now}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      sourceGroupId: edge.sourceGroupId ? groupMap.get(edge.sourceGroupId) : undefined,
      targetGroupId: edge.targetGroupId ? groupMap.get(edge.targetGroupId) : undefined,
    }))
  nodes.value.push(...copies)
  edges.value.push(...copiedEdges)
  selected.value = copies.map((node) => node.id)
  selectedEdge.value = null
  flash(`已粘贴 ${copies.length} 个节点`)
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
  const remainingGroupIds = new Set(nodes.value.map((node) => node.groupId).filter((id): id is string => Boolean(id)))
  edges.value = edges.value
    .filter((edge) =>
      (edge.sourceGroupId ? remainingGroupIds.has(edge.sourceGroupId) : !ids.has(edge.source)) &&
      (edge.targetGroupId ? remainingGroupIds.has(edge.targetGroupId) : !ids.has(edge.target)),
    )
    .map((edge) => ({
      ...edge,
      source: edge.sourceGroupId ? groupNodeIds(edge.sourceGroupId)[0] || edge.source : edge.source,
      target: edge.targetGroupId ? groupNodeIds(edge.targetGroupId)[0] || edge.target : edge.target,
    }))
  if (imageEditNodeId.value && ids.has(imageEditNodeId.value)) imageEditNodeId.value = null
  if (mediaPromptNodeId.value && ids.has(mediaPromptNodeId.value)) mediaPromptNodeId.value = null
  selected.value = []
}
function hasPath(from: string, to: string, visited = new Set<string>()): boolean {
  if (from === to) return true
  if (visited.has(from)) return false
  visited.add(from)
  return edges.value
    .filter((edge) => edge.enabled)
    .flatMap(expandedEdgePairs)
    .filter((pair) => pair.source === from)
    .some((pair) => hasPath(pair.target, to, visited))
}
function createConnection(source: string, target: string) {
  createEndpointConnection([source], [target])
}
function createEndpointConnection(sourceIds: string[], targetIds: string[], sourceGroupId?: string, targetGroupId?: string) {
  if (!sourceIds.length || !targetIds.length || sourceIds.some((id) => !nodeMap.value.has(id)) || targetIds.some((id) => !nodeMap.value.has(id))) {
    flash('节点或分组不存在，无法连接')
    return false
  }
  const sourceSet = new Set(sourceIds)
  if (targetIds.some((id) => sourceSet.has(id))) {
    flash('不允许节点或分组连接自身')
    return false
  }
  const duplicate = edges.value.some((edge) =>
    (edge.sourceGroupId || undefined) === sourceGroupId &&
    (edge.targetGroupId || undefined) === targetGroupId &&
    (!sourceGroupId ? edge.source === sourceIds[0] : true) &&
    (!targetGroupId ? edge.target === targetIds[0] : true),
  )
  if (duplicate) {
    flash('这两个连线端点已经连接')
    return false
  }
  if (sourceIds.some((source) => targetIds.some((target) => hasPath(target, source)))) {
    flash('连接会形成循环依赖，已阻止')
    return false
  }
  checkpoint()
  const order = edges.value.filter((edge) => targetGroupId ? edge.targetGroupId === targetGroupId : !edge.targetGroupId && edge.target === targetIds[0]).length + 1
  edges.value.push({
    id: `edge-${uid()}`,
    source: sourceIds[0]!,
    target: targetIds[0]!,
    sourceGroupId,
    targetGroupId,
    sourceHandle: 'output',
    targetHandle: 'input',
    order,
    enabled: true,
  })
  flash(sourceGroupId || targetGroupId ? '已建立分组数据连接' : '已建立有向数据连接')
  return true
}
function createGroupConnections(sourceIds: string[], targetIds: string[]) {
  const pairs = sourceIds.flatMap((source) => targetIds.map((target) => ({ source, target })))
  let created = 0
  let skipped = 0
  let checkpointed = false
  for (const { source, target } of pairs) {
    if (!nodeMap.value.has(source) || !nodeMap.value.has(target) || source === target || edges.value.some((edge) => edge.source === source && edge.target === target) || hasPath(target, source)) {
      skipped += 1
      continue
    }
    if (!checkpointed) {
      checkpoint()
      checkpointed = true
    }
    edges.value.push({ id: `edge-${uid()}`, source, target, sourceHandle: 'output', targetHandle: 'input', order: edges.value.filter((edge) => edge.target === target).length + 1, enabled: true })
    created += 1
  }
  if (created) flash(`已建立 ${created} 条组连线${skipped ? `，跳过 ${skipped} 条重复、成环或自身连接` : ''}`)
  else flash('没有可建立的组连线，可能存在重复、循环或自身连接')
}
function connectTo(nodeId: string) {
  if (!linkingFrom.value) {
    linkingGroupSources.value = []
    linkingFromGroupId.value = null
    linkingFrom.value = nodeId
    return flash('请点击下游节点，或拖动连线到目标节点任意位置')
  }
  createConnection(linkingFrom.value, nodeId)
  linkingFrom.value = null
}
function startConnection(event: PointerEvent, nodeId: string) {
  event.stopPropagation()
  const point = screenToCanvas(event.clientX, event.clientY)
  linkingGroupSources.value = []
  linkingFromGroupId.value = null
  linkingFrom.value = nodeId
  linkingPointer.x = point.x
  linkingPointer.y = point.y
  dragPointer = { x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', moveConnection)
  window.addEventListener('pointerup', finishConnection, { once: true })
  window.addEventListener('pointercancel', finishConnection, { once: true })
}
function startGroupConnection(event: PointerEvent) {
  const bounds = selectionGroupBounds.value
  if (!bounds) return
  event.preventDefault()
  event.stopPropagation()
  linkingFrom.value = null
  linkingGroupSources.value = [...bounds.nodeIds]
  linkingFromGroupId.value = selectedPersistentGroupId.value
  linkingGroupOrigin.x = bounds.x + bounds.width
  linkingGroupOrigin.y = bounds.y + bounds.height / 2
  const point = screenToCanvas(event.clientX, event.clientY)
  linkingPointer.x = point.x
  linkingPointer.y = point.y
  dragPointer = { x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', moveConnection)
  window.addEventListener('pointerup', finishConnection, { once: true })
  window.addEventListener('pointercancel', finishConnection, { once: true })
}
function connectCurrentSourceToGroup() {
  const bounds = selectionGroupBounds.value
  if (!bounds || !linkingFrom.value) return flash('请先从一个节点开始连接')
  if (selectedPersistentGroupId.value) createEndpointConnection([linkingFrom.value], bounds.nodeIds, undefined, selectedPersistentGroupId.value)
  else createGroupConnections([linkingFrom.value], bounds.nodeIds)
  linkingFrom.value = null
  linkingFromGroupId.value = null
}
function moveConnection(event: PointerEvent) {
  dragPointer = { x: event.clientX, y: event.clientY }
  updateLinkingPointerPosition()
  scheduleEdgeAutoPan()
}
function finishConnection(event: PointerEvent) {
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const target = element?.closest<HTMLElement>('.canvas-node')
  const groupTarget = element?.closest<HTMLElement>('.selection-group-frame,.persistent-group-frame')
  const targetGroupId = groupTarget?.dataset.groupId
  const sourceGroupId = linkingFromGroupId.value || undefined
  const sources = linkingGroupSources.value.length
    ? [...linkingGroupSources.value]
    : linkingFrom.value ? [linkingFrom.value] : []
  if (target?.dataset.nodeId && sources.length) {
    if (sourceGroupId) createEndpointConnection(sources, [target.dataset.nodeId], sourceGroupId)
    else createGroupConnections(sources, [target.dataset.nodeId])
  }
  else if (groupTarget && sources.length) {
    const targets = targetGroupId ? groupNodeIds(targetGroupId) : selectionGroupBounds.value?.nodeIds || []
    const isSameGroup = linkingGroupSources.value.length > 0 &&
      linkingGroupSources.value.length === targets.length &&
      linkingGroupSources.value.every((id) => targets.includes(id))
    if (isSameGroup) flash('不允许将选区大框连接到自身')
    else if (targetGroupId && sourceGroupId) createEndpointConnection(sources, targets, sourceGroupId, targetGroupId)
    else if (targetGroupId) {
      if (sources.length === 1) createEndpointConnection(sources, targets, undefined, targetGroupId)
      else sources.forEach((source) => createEndpointConnection([source], targets, undefined, targetGroupId))
    }
    else if (sourceGroupId) targets.forEach((targetId) => createEndpointConnection(sources, [targetId], sourceGroupId))
    else createGroupConnections(sources, targets)
  }
  else flash('将连线拖到目标节点任意位置，或点击目标节点')
  linkingFrom.value = null
  linkingGroupSources.value = []
  linkingFromGroupId.value = null
  stopEdgeAutoPan()
  window.removeEventListener('pointermove', moveConnection)
  window.removeEventListener('pointerup', finishConnection)
  window.removeEventListener('pointercancel', finishConnection)
}
function edgePath(edge: Edge) {
  const source = nodeMap.value.get(edge.source)
  const target = nodeMap.value.get(edge.target)
  const sourceFrame = groupFrame(edge.sourceGroupId)
  const targetFrame = groupFrame(edge.targetGroupId)
  if ((!source && !sourceFrame) || (!target && !targetFrame)) return ''
  const x1 = sourceFrame ? sourceFrame.x + sourceFrame.width : source!.x + source!.width
  const y1 = sourceFrame ? sourceFrame.y + sourceFrame.height / 2 : source!.y + 82
  const x2 = targetFrame ? targetFrame.x : target!.x
  const y2 = targetFrame ? targetFrame.y + targetFrame.height / 2 : target!.y + 82
  const bend = Math.max(60, Math.abs(x2 - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}
function draftPath() {
  const source = linkingFrom.value ? nodeMap.value.get(linkingFrom.value) : undefined
  if (!source && !linkingGroupSources.value.length) return ''
  const x1 = source ? source.x + source.width : linkingGroupOrigin.x
  const y1 = source ? source.y + 82 : linkingGroupOrigin.y
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
  const orderedEdges = edges.value
    .filter((edge) => edge.enabled && edgeTargetNodeIds(edge).includes(nodeId))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      const sourceA = nodeMap.value.get(edgeSourceNodeIds(a)[0] || '')
      const sourceB = nodeMap.value.get(edgeSourceNodeIds(b)[0] || '')
      return (sourceA?.y || 0) - (sourceB?.y || 0)
    })
  const seen = new Set<string>()
  return orderedEdges
    .flatMap((edge) => edgeSourceNodeIds(edge))
    .filter((id) => !seen.has(id) && Boolean(seen.add(id)))
    .map((id) => nodeMap.value.get(id))
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
  const selectedRole = roleForNode(node)
  const messages: Array<{ role: 'system' | 'user'; content: string | unknown[] }> = [
    { role: 'system', content: settings.systemPrompt },
  ]
  if (selectedRole) {
    messages.push({
      role: 'system',
      content: `当前节点角色：${selectedRole.name}\n${selectedRole.systemPrompt}`,
    })
  }
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
  return { upstream, formattedInputs, messages, selectedRole }
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
  return edges.value.filter((edge) => edgeTargetNodeIds(edge).includes(nodeId)).sort((a, b) => a.order - b.order)
}
function activeInputCount(nodeId: string) {
  return incomingEdges(nodeId).filter(
    (edge) => edge.enabled,
  ).reduce((count, edge) => count + edgeSourceNodeIds(edge).length, 0)
}
function moveEdge(edge: Edge, direction: -1 | 1) {
  const list = edge.targetGroupId
    ? edges.value.filter((item) => item.targetGroupId === edge.targetGroupId).sort((a, b) => a.order - b.order)
    : incomingEdges(edge.target)
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
function modelSupportsUpstream(target: CanvasNode, source: CanvasNode) {
  const sourceKind: ServiceKind = source.kind === 'config' ? 'text' : source.kind
  const supportedInputs: Record<ServiceKind, ServiceKind[]> = {
    text: ['text', 'image'],
    image: ['text', 'image'],
    video: ['text', 'image', 'video'],
    audio: ['text'],
  }
  return supportedInputs[nodeServiceKind(target)].includes(sourceKind)
}
function isEdgeIncompatible(edge: Edge) {
  const sources = edgeSourceNodeIds(edge).map((id) => nodeMap.value.get(id)).filter((node): node is CanvasNode => Boolean(node))
  const targets = edgeTargetNodeIds(edge).map((id) => nodeMap.value.get(id)).filter((node): node is CanvasNode => Boolean(node))
  return sources.some((source) => targets.some((target) => !modelSupportsUpstream(target, source)))
}
function incompatibleEdgeTitle(edge: Edge) {
  if (!isEdgeIncompatible(edge)) return ''
  return '该分组连线中包含目标模型不支持的上游输入类型'
}
function configuredApiBase(service: ModelServiceConfig) {
  return service.baseUrl.trim().replace(/\/+$/, '')
}
type ScriptRequestConfig = {
  method?: string
  url: string
  headers?: Record<string, string>
  params?: Record<string, unknown>
  data?: unknown
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'
}
type ModelScriptArgs = {
  service: ModelChannel
  kind: ServiceKind
  prompt?: string
  images?: string[]
  messages?: unknown[]
  params?: Record<string, unknown>
  signal?: AbortSignal
}
function scriptRequestUrl(baseUrl: string, path: string, params?: Record<string, unknown>) {
  const url = new URL(/^https?:\/\//i.test(path) ? path : `${baseUrl}/${path.replace(/^\/+/, '')}`)
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, String(value))
  })
  return url.toString()
}
async function executeScriptRequest(config: ScriptRequestConfig, baseUrl: string, signal?: AbortSignal) {
  const headers = { ...(config.headers || {}) }
  const isForm = config.data instanceof FormData
  if (config.data != null && !isForm && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json'
  }
  let body: BodyInit | undefined
  if (config.data != null) {
    body = isForm || typeof config.data === 'string' || config.data instanceof Blob
      ? config.data as BodyInit
      : JSON.stringify(config.data)
  }
  const response = await fetch(scriptRequestUrl(baseUrl, config.url, config.params), {
    method: config.method || (config.data == null ? 'GET' : 'POST'),
    headers,
    body,
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}${detail ? `：${detail.slice(0, 300)}` : ''}`)
  }
  if (config.responseType === 'blob') return response.blob()
  if (config.responseType === 'text') return response.text()
  if (config.responseType === 'arraybuffer') return response.arrayBuffer()
  return response.json()
}
async function runModelScript(args: ModelScriptArgs) {
  const { service, signal } = args
  const request = (config: ScriptRequestConfig) => executeScriptRequest(config, configuredApiBase(service), signal)
  const http = {
    url: (path: string) => scriptRequestUrl(configuredApiBase(service), path),
    get: (path: string, options: Omit<ScriptRequestConfig, 'url' | 'method'> = {}) =>
      request({ ...options, method: 'GET', url: path, headers: { Authorization: `Bearer ${service.apiKey}`, ...(options.headers || {}) } }),
    post: (path: string, data?: unknown, options: Omit<ScriptRequestConfig, 'url' | 'method' | 'data'> = {}) =>
      request({ ...options, method: 'POST', url: path, data, headers: { Authorization: `Bearer ${service.apiKey}`, ...(options.headers || {}) } }),
  }
  const sleep = (milliseconds: number) => waitForVideoPoll(milliseconds, signal)
  const poll = async <T, R>(requestValue: () => Promise<T>, extract: (value: T) => R | null | undefined | false, options: { intervalMs?: number; timeoutMs?: number } = {}) => {
    const deadline = Date.now() + (options.timeoutMs || 300000)
    for (;;) {
      if (signal?.aborted) throw new DOMException('生成已中断', 'AbortError')
      const result = extract(await requestValue())
      if (result !== null && result !== undefined && result !== false) return result
      if (Date.now() >= deadline) throw new Error('调用脚本轮询超时')
      await sleep(options.intervalMs || 2500)
    }
  }
  let streamedText = ''
  const onDelta = (text: string) => { streamedText += String(text || '') }
  try {
    const runner = new Function(
      'prompt', 'images', 'messages', 'params', 'model', 'baseUrl', 'apiKey', 'systemPrompt',
      'reasoningEffort', 'http', 'request', 'poll', 'sleep', 'signal', 'onDelta',
      `"use strict"; return (async () => {\n${service.script}\n})();`,
    ) as (...values: unknown[]) => Promise<unknown>
    const result = await runner(
      args.prompt || '', args.images || [], args.messages || [], args.params || {}, service.model,
      configuredApiBase(service), service.apiKey, settings.systemPrompt, service.reasoningEffort || 'auto',
      http, request, poll, sleep, signal, onDelta,
    )
    return result ?? streamedText
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new Error(`模型调用脚本执行失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
function scriptResultUrls(result: unknown, kind: 'image' | 'audio' | 'video') {
  const values = Array.isArray(result) ? result : [result]
  return values.flatMap((value): Array<string | Blob> => {
    if (typeof value === 'string' || value instanceof Blob) return [value]
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    if (item.blob instanceof Blob) return [item.blob]
    const direct = item.url || item.dataUrl
    if (typeof direct === 'string') return [direct]
    const base64 = item.b64_json || item.data
    if (typeof base64 === 'string') return [`data:${kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/mpeg'};base64,${base64}`]
    return []
  })
}
function serviceKindLabel(kind: ServiceKind) {
  return serviceOptions.find((item) => item.kind === kind)?.label || '当前'
}
function validateServiceConfig(service: ModelServiceConfig, kind: ServiceKind) {
  const label = serviceKindLabel(kind)
  const apiBase = configuredApiBase(service)
  if (!apiBase) throw new Error(`未填写${label}服务的 API Base URL`)
  try {
    const parsed = new URL(apiBase)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
  } catch {
    throw new Error(
      `${label}服务的 API Base URL 格式错误：“${service.baseUrl}”。请输入以 http:// 或 https:// 开头的完整地址`,
    )
  }
  if (!service.model.trim())
    throw new Error(`未填写${label}服务的模型名称，请在配置中心填写后重试`)
  if (!service.apiKey.trim())
    throw new Error(
      `未配置${label}模型“${service.model}”的 API Key，请先打开配置中心完成设置`,
    )
}
function serviceResponseError(
  status: number,
  detail: string,
  service: ModelServiceConfig,
  kind: ServiceKind,
) {
  const label = serviceKindLabel(kind)
  if (status === 401 || status === 403)
    return new Error(`${label}服务认证失败，请检查 API Key 是否正确或是否具有访问权限`)
  if (status === 404)
    return new Error(
      `${label}服务接口不存在或模型不可用。请检查 API Base URL“${configuredApiBase(service)}”和模型名称“${service.model}”`,
    )
  if (/model|模型|deployment/i.test(detail))
    return new Error(
      `${label}模型名称“${service.model}”可能无效：${detail || `HTTP ${status}`}`,
    )
  return new Error(`${label}服务请求失败（HTTP ${status}）：${detail || '未返回错误详情'}`)
}
function readableServiceError(
  error: unknown,
  service: ModelServiceConfig,
  kind: ServiceKind,
) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed|load failed/i.test(message)
  ) {
    return `${serviceKindLabel(kind)}服务无法连接到“${configuredApiBase(service)}”。请检查 API Base URL、网络连接、HTTPS 与跨域（CORS）设置`
  }
  return message || `${serviceKindLabel(kind)}服务请求失败`
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
function normalizedVideoDuration(node: CanvasNode) {
  return Math.min(15, Math.max(1, Math.round(node.videoDuration || 5)))
}
function normalizeVideoSettings(node: CanvasNode) {
  node.videoAspectWidth = Math.min(100, Math.max(1, Math.round(node.videoAspectWidth || 16)))
  node.videoAspectHeight = Math.min(100, Math.max(1, Math.round(node.videoAspectHeight || 9)))
  node.videoDuration = normalizedVideoDuration(node)
  node.videoResolution = [480, 720, 1080, 2160].includes(Number(node.videoResolution))
    ? node.videoResolution
    : 720
  markNodeChanged(node)
}
function setVideoAuto(node: CanvasNode) {
  node.videoAutoSize = true
  markNodeChanged(node)
}
function setVideoRatio(node: CanvasNode, width: number, height: number) {
  node.videoAutoSize = false
  node.videoAspectWidth = width
  node.videoAspectHeight = height
  markNodeChanged(node)
}
function videoAspectLabel(node: CanvasNode) {
  if (node.videoAutoSize ?? true) return '自动'
  return `${node.videoAspectWidth || 16}:${node.videoAspectHeight || 9}`
}
function videoRequestDimensions(node: CanvasNode) {
  const resolution = [480, 720, 1080, 2160].includes(Number(node.videoResolution))
    ? Number(node.videoResolution)
    : 720
  const aspectWidth = node.videoAutoSize ?? true ? 16 : Math.max(1, node.videoAspectWidth || 16)
  const aspectHeight = node.videoAutoSize ?? true ? 9 : Math.max(1, node.videoAspectHeight || 9)
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)
  if (aspectWidth >= aspectHeight) {
    return { width: even((resolution * aspectWidth) / aspectHeight), height: resolution }
  }
  return { width: resolution, height: even((resolution * aspectHeight) / aspectWidth) }
}
function videoSizeLabel(node: CanvasNode) {
  const size = videoRequestDimensions(node)
  return `${size.width} × ${size.height}`
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
  try {
    validateServiceConfig(service, kind)
  } catch (error) {
    connectionTest.status = 'error'
    connectionTest.message = error instanceof Error ? error.message : '模型服务配置不完整'
    return
  }
  connectionTest.status = 'testing'
  connectionTest.message = '正在连接模型服务…'
  try {
    const response = await fetch(`${configuredApiBase(service)}/models`, {
      headers: { Authorization: `Bearer ${service.apiKey.trim()}` },
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok)
      throw serviceResponseError(
        response.status,
        payload?.error?.message || payload?.message || '',
        service,
        kind,
      )
    const models = Array.isArray(payload?.data) ? payload.data : []
    const available = models.some((item: { id?: string }) => item.id === service.model)
    connectionTest.status = 'success'
    connectionTest.message = `连接成功，读取到 ${models.length} 个模型；当前模型${available ? '可用' : '未在列表中找到'}`
  } catch (error) {
    connectionTest.status = 'error'
    connectionTest.message = readableServiceError(error, service, kind)
  }
}
async function writeImageResult(node: CanvasNode, imageUrl: string, prompt = '') {
  await assignCanvasMediaUrl(node, imageUrl, node.title)
  if (prompt) node.imagePrompt = prompt
  node.version = (node.version || 0) + 1
}
function buildConfiguredImagePrompt(
  node: CanvasNode,
  context: ReturnType<typeof buildGenerationContext>,
) {
  const requestedWidth = node.imageWidth || 1024
  const requestedHeight = node.imageHeight || 1024
  const currentPrompt = resolveMentionTokens(node.content, node.id).trim()
  const fixedSections = [
    `系统提示词：\n${settings.systemPrompt.slice(0, 6000)}`,
    ...(context.selectedRole
      ? [
          `当前节点角色：${context.selectedRole.name}\n${context.selectedRole.systemPrompt.slice(0, 6000)}`,
        ]
      : []),
    `当前节点生成提示词：\n${currentPrompt || '（未填写，请根据直接上游输入完成生成）'}`,
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
    ...fixedSections.slice(0, -2),
    `直接上游输入：\n${upstreamText}`,
    ...fixedSections.slice(-2),
  ].join('\n\n')
}
async function callConfiguredImage(
  node: CanvasNode,
  context: ReturnType<typeof buildGenerationContext>,
  ownReferenceUrl = '',
  promptOverride = '',
  includeUpstreamReferences = true,
  signal?: AbortSignal,
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
  if (service.script.trim()) {
    const images = await Promise.all(referenceImages.map(async (reference) => {
      try {
        const response = await fetch(reference.url, { signal })
        if (!response.ok) throw new Error()
        return blobToDataUrl(await response.blob())
      } catch (error) {
        if (isAbortError(error)) throw error
        throw new Error(`无法读取参考图片“${reference.title}”，请重新上传后再试`)
      }
    }))
    const result = await runModelScript({
      service,
      kind: 'image',
      prompt,
      images,
      params: { size: supportedImageSize(node), count: 1, quality: 'auto' },
      signal,
    })
    const image = scriptResultUrls(result, 'image')[0]
    if (!image) throw new Error('模型调用脚本没有返回图片')
    return { imageUrl: image instanceof Blob ? await blobToDataUrl(image) : image, prompt } satisfies GeneratedImageResult
  }
  let response: Response
  if (referenceImages.length) {
    const formData = new FormData()
    formData.append('model', service.model)
    formData.append('prompt', prompt)
    formData.append('size', supportedImageSize(node))
    for (const [index, reference] of referenceImages.entries()) {
      let imageResponse: Response
      try {
        imageResponse = await fetch(reference.url, { signal })
      } catch (error) {
        if (isAbortError(error)) throw error
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
      signal,
    })
  } else {
    response = await fetch(`${apiBase}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: service.model, prompt, size: supportedImageSize(node) }),
      signal,
    })
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw serviceResponseError(
      response.status,
      error?.error?.message || error?.message || '',
      service,
      'image',
    )
  }
  const payload = await response.json()
  const item = payload.data?.[0]
  const imageUrl = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : '')
  if (!imageUrl) throw new Error('图像服务未返回可用结果')
  return { imageUrl, prompt } satisfies GeneratedImageResult
}
async function callConfiguredModel(node: CanvasNode, context: ReturnType<typeof buildGenerationContext>, signal?: AbortSignal) {
  const service = serviceForNode(node)
  if (service.script.trim()) {
    const result = await runModelScript({
      service,
      kind: 'text',
      messages: context.messages,
      params: {
        maxTokens: service.maxTokens,
        temperature: /^gpt-5|^o\d/i.test(service.model) ? undefined : service.temperature,
      },
      signal,
    })
    if (typeof result !== 'string' || !result.trim()) throw new Error('模型调用脚本没有返回文本')
    return result
  }
  const apiBase = configuredApiBase(service)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${service.apiKey}` }
  const body: Record<string, unknown> = {
    model: service.model,
    messages: context.messages,
    max_completion_tokens: service.maxTokens,
  }
  if (service.reasoningEffort && service.reasoningEffort !== 'auto') {
    body.reasoning_effort = service.reasoningEffort
  }
  if (!/^gpt-5|^o\d/i.test(service.model)) body.temperature = service.temperature
  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw serviceResponseError(
      response.status,
      error?.error?.message || error?.message || '',
      service,
      nodeServiceKind(node),
    )
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
  signal?: AbortSignal,
) {
  const service = serviceForNode(node)
  const input = buildAudioSpeechInput(node, context)
  if (service.script.trim()) {
    const result = await runModelScript({
      service,
      kind: 'audio',
      prompt: input,
      params: {
        voice: node.audioVoice || 'alloy',
        format: node.audioFormat || 'mp3',
        speed: node.audioGenerationSpeed || 1,
        instructions: node.audioInstructions?.trim() || '自然',
      },
      signal,
    })
    const audio = scriptResultUrls(result, 'audio')[0]
    if (!audio) throw new Error('模型调用脚本没有返回音频')
    return { audioUrl: audio instanceof Blob ? await blobToDataUrl(audio) : audio, input }
  }
  const response = await fetch(`${configuredApiBase(service)}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${service.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: service.model,
      input,
      voice: node.audioVoice || 'alloy',
      response_format: node.audioFormat || 'mp3',
      speed: node.audioGenerationSpeed || 1,
      instructions: node.audioInstructions?.trim() || '自然',
    }),
    signal,
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
    throw serviceResponseError(response.status, message, service, 'audio')
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
function waitForVideoPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new DOMException('生成已中断', 'AbortError'))
    }, { once: true })
  })
}
async function callConfiguredVideo(
  node: CanvasNode,
  context: ReturnType<typeof buildGenerationContext>,
  signal?: AbortSignal,
) {
  const service = serviceForNode(node)
  const ownPrompt = resolveMentionTokens(node.content, node.id).trim()
  const prompt = [
    settings.systemPrompt.trim(),
    context.selectedRole ? `角色：${context.selectedRole.name}\n${context.selectedRole.systemPrompt}` : '',
    context.formattedInputs ? `上游输入：\n${context.formattedInputs}` : '',
    ownPrompt ? `当前节点任务：\n${ownPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 30000)
  if (!prompt) throw new Error('请先输入视频生成提示词，或连接包含有效内容的上游节点')

  if (service.script.trim()) {
    const imageReferences = context.upstream.filter((item) => item.kind === 'image' && item.url)
    const images = await Promise.all(imageReferences.map(async (reference) => {
      try {
        const response = await fetch(reference.url!, { signal })
        if (!response.ok) throw new Error()
        return blobToDataUrl(await response.blob())
      } catch (error) {
        if (isAbortError(error)) throw error
        throw new Error(`无法读取参考图片“${reference.title}”`)
      }
    }))
    const dimensions = videoRequestDimensions(node)
    const result = await runModelScript({
      service,
      kind: 'video',
      prompt,
      images,
      params: {
        size: `${dimensions.width}x${dimensions.height}`,
        seconds: normalizedVideoDuration(node),
        resolution: node.videoResolution || 720,
        ratio: node.videoAutoSize ? 'auto' : `${node.videoAspectWidth || 16}:${node.videoAspectHeight || 9}`,
      },
      signal,
    })
    const video = scriptResultUrls(result, 'video')[0]
    if (!video) throw new Error('模型调用脚本没有返回视频')
    return { videoUrl: video instanceof Blob ? await blobToDataUrl(video) : video, prompt }
  }

  const baseUrl = configuredApiBase(service)
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${service.apiKey.trim()}`,
  }
  const createResponse = await fetch(`${baseUrl}/videos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: service.model,
      prompt,
      size: `${videoRequestDimensions(node).width}x${videoRequestDimensions(node).height}`,
      seconds: String(normalizedVideoDuration(node)),
    }),
    signal,
  })
  const createPayload = await createResponse.json().catch(() => null)
  if (!createResponse.ok) {
    const message =
      createPayload?.error?.message || createPayload?.message || `视频服务返回 ${createResponse.status}`
    throw serviceResponseError(createResponse.status, message, service, 'video')
  }
  const videoId = String(createPayload?.id || '')
  if (!videoId) throw new Error('视频服务未返回任务 ID，无法查询生成进度')

  let video = createPayload
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = String(video?.status || '').toLowerCase()
    if (status === 'completed') break
    if (['failed', 'expired', 'cancelled'].includes(status)) {
      throw new Error(video?.error?.message || video?.error || `视频生成任务${status}`)
    }
    const progress = Number(video?.progress)
    node.resultText = Number.isFinite(progress) ? `视频生成中 · ${progress}%` : '视频生成中'
    await waitForVideoPoll(10000, signal)
    const statusResponse = await fetch(`${baseUrl}/videos/${encodeURIComponent(videoId)}`, {
      headers,
      signal,
    })
    const statusPayload = await statusResponse.json().catch(() => null)
    if (!statusResponse.ok) {
      const message =
        statusPayload?.error?.message ||
        statusPayload?.message ||
        `查询视频任务返回 ${statusResponse.status}`
      throw serviceResponseError(statusResponse.status, message, service, 'video')
    }
    video = statusPayload
  }
  if (String(video?.status || '').toLowerCase() !== 'completed') {
    throw new Error('视频生成等待超时，请稍后重新生成或检查服务端任务状态')
  }

  const contentResponse = await fetch(
    `${baseUrl}/videos/${encodeURIComponent(videoId)}/content`,
    { headers: { Authorization: headers.Authorization }, signal },
  )
  if (!contentResponse.ok) {
    const payload = await contentResponse.json().catch(() => null)
    const message =
      payload?.error?.message || payload?.message || `下载视频返回 ${contentResponse.status}`
    throw serviceResponseError(contentResponse.status, message, service, 'video')
  }
  const blob = await contentResponse.blob()
  if (!blob.size) throw new Error('视频服务返回了空文件')
  const videoUrl = await blobToDataUrl(blob.type ? blob : new Blob([blob], { type: 'video/mp4' }))
  return { videoUrl, prompt }
}
async function createImageBatchResultNodes(
  source: CanvasNode,
  imageResults: GeneratedImageResult[],
  snapshot: GenerationSnapshot,
) {
  const verticalGap = 28
  const previewHeight =
    source.width * ((source.imageHeight || 1024) / Math.max(1, source.imageWidth || 1024))
  const nodeHeight = source.height || Math.max(250, previewHeight + 115)
  for (const [index, result] of imageResults.entries()) {
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
    await writeImageResult(child, result.imageUrl, result.prompt)
    nodes.value.push(child)
  }
}
function isGeneratedImage(node: CanvasNode) {
  return Boolean(
    node.kind === 'image' &&
      node.url &&
      (node.imagePrompt || node.lastGeneration || node.resultText?.startsWith('已通过')),
  )
}
function isMediaPlaceholderContent(value: string) {
  const content = value.trim()
  return (
    !content ||
    /(?:MB|KB)\s*·\s*本地资产/.test(content) ||
    content.startsWith('由 ') ||
    content.startsWith('00:00') ||
    content === '拖入图片或点击上传' ||
    content === '等待添加视频素材' ||
    content === '准备生成动态画面'
  )
}
function openMediaPrompt(node: CanvasNode) {
  if (!['image', 'video', 'audio'].includes(node.kind)) return
  if (isMediaPlaceholderContent(node.content)) {
    node.content = node.kind === 'image' ? node.imagePrompt || '' : ''
  }
  mediaPromptNodeId.value = node.id
  imageEditNodeId.value = null
  imageSettingsNodeId.value = null
  videoSettingsNodeId.value = null
  audioMenuNodeId.value = null
  selected.value = [node.id]
  selectedEdge.value = null
}
function closeMediaPrompt() {
  mediaPromptNodeId.value = null
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
  if (target.closest('.media-generation-panel')) return false
  const targetNodeId = target.closest<HTMLElement>('.canvas-node')?.dataset.nodeId
  return targetNodeId !== mediaPromptNodeId.value
}
function startImageEditorOutsidePointer(event: PointerEvent) {
  if (!mediaPromptNodeId.value || event.button !== 0) return
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
  closeMediaPrompt()
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
    audioPlaybackStates[node.id] = {
      currentTime: 0,
      duration: Number.isFinite(node.audioDuration) ? Math.max(0, node.audioDuration || 0) : 0,
      playing: false,
      muted: false,
    }
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
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    state.duration = audio.duration
    node.audioDuration = audio.duration
  } else {
    state.duration = Math.max(0, node.audioDuration || 0)
  }
  audio.playbackRate = node.audioPlaybackRate || 1
  audio.volume = node.audioVolume ?? 1
}
function syncVideoMetadata(event: Event, node: CanvasNode) {
  const video = event.currentTarget as HTMLVideoElement
  if (!video.videoWidth || !video.videoHeight) return
  node.imageWidth = video.videoWidth
  node.imageHeight = video.videoHeight
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
function audioSpeedIndex(value?: number) {
  const index = AUDIO_SPEED_OPTIONS.indexOf(value as AudioSpeed)
  return index < 0 ? AUDIO_SPEED_OPTIONS.indexOf(1) : index
}
function setAudioPlaybackRateFromSlider(event: Event, node: CanvasNode) {
  const rate = AUDIO_SPEED_OPTIONS[Number((event.currentTarget as HTMLInputElement).value)] || 1
  setAudioPlaybackRate(event, node, rate)
}
function setAudioGenerationSpeedFromSlider(event: Event, node: CanvasNode) {
  node.audioGenerationSpeed =
    AUDIO_SPEED_OPTIONS[Number((event.currentTarget as HTMLInputElement).value)] || 1
  markNodeChanged(node)
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
async function toggleAudioRecording(node: CanvasNode) {
  if (recordingAudioNodeId.value === node.id && activeAudioRecorder) {
    activeAudioRecorder.stop()
    return
  }
  if (recordingAudioNodeId.value) return flash('请先结束当前录音')
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return flash('当前浏览器不支持录音，请改用上传文件')
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    activeAudioRecorder = recorder
    activeAudioStream = stream
    activeAudioChunks = []
    activeAudioStartedAt = performance.now()
    recordingAudioNodeId.value = node.id
    recorder.ondataavailable = (event) => {
      if (event.data.size) activeAudioChunks.push(event.data)
    }
    recorder.onerror = () => flash('录音失败，请检查麦克风权限')
    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || 'audio/webm'
      const blob = new Blob(activeAudioChunks, { type: mimeType })
      const recordedDuration = Math.max(0.1, (performance.now() - activeAudioStartedAt) / 1000)
      activeAudioStream?.getTracks().forEach((track) => track.stop())
      activeAudioRecorder = null
      activeAudioStream = null
      activeAudioChunks = []
      recordingAudioNodeId.value = null
      if (!blob.size) return flash('没有录到有效声音')
      uploadingAudioNodeIds.value = [...uploadingAudioNodeIds.value, node.id]
      node.audioDuration = recordedDuration
      Object.assign(audioState(node), {
        currentTime: 0,
        duration: recordedDuration,
        playing: false,
        muted: false,
      })
      await nextTick()
      const uploadFeedbackDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 500))
      try {
        checkpoint()
        await Promise.all([
          assignCanvasMediaBlob(node, blob, `${node.title}-录音.webm`),
          uploadFeedbackDelay,
        ])
        node.audioRecorded = true
        node.content = `本地录音 · ${formatAssetSize(blob.size)}`
        node.status = 'idle'
        node.version = (node.version || 0) + 1
        delete audioPlaybackStates[node.id]
        flash('录音已保存到当前音频控件')
      } catch {
        flash('录音保存失败，请检查浏览器存储空间')
      } finally {
        uploadingAudioNodeIds.value = uploadingAudioNodeIds.value.filter((id) => id !== node.id)
      }
    }
    recorder.start(250)
    flash('正在录音，再次点击“停止录音”即可保存')
  } catch (error) {
    flash(error instanceof DOMException && error.name === 'NotAllowedError'
      ? '没有麦克风权限，请在浏览器中允许访问麦克风'
      : '无法启动录音设备')
  }
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
  mediaPromptNodeId.value = null
  videoSettingsNodeId.value = null
  audioSettingsNodeId.value = null
  imageSettingsNodeId.value = imageSettingsNodeId.value === node.id ? null : node.id
}
function toggleVideoSettings(node: CanvasNode) {
  imageEditNodeId.value = null
  mediaPromptNodeId.value = null
  imageSettingsNodeId.value = null
  audioSettingsNodeId.value = null
  videoSettingsNodeId.value = videoSettingsNodeId.value === node.id ? null : node.id
}
function toggleAudioSettings(node: CanvasNode) {
  imageEditNodeId.value = null
  mediaPromptNodeId.value = null
  imageSettingsNodeId.value = null
  videoSettingsNodeId.value = null
  audioMenuNodeId.value = null
  audioSettingsNodeId.value = audioSettingsNodeId.value === node.id ? null : node.id
}
async function createImageVariationResultNodes(
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
  const children: CanvasNode[] = []
  for (const [index, result] of imageResults.entries()) {
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
    await writeImageResult(child, result.imageUrl, result.prompt)
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
    children.push(child)
  }
  return children
}
async function runImageVariation(source: CanvasNode) {
  if (imageEditDraft.nodeId !== source.id || !source.url) return
  if (!imageEditDraft.imageAutoSize) normalizeImageEditDimensions()
  normalizeImageEditCount()
  const prompt = imageEditDraft.prompt.trim()
  if (!prompt) return flash('请先填写图片修改提示词')
  const variationService = serviceForNode(source)
  try {
    validateServiceConfig(variationService, 'image')
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片模型配置不完整'
    source.status = 'error'
    source.resultText = message
    flash(message)
    return
  }
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
  const controller = new AbortController()
  generationControllers.set(source.id, controller)
  imageEditNodeId.value = null
  mediaPromptNodeId.value = null
  imageVariationRunningIds.value = [...imageVariationRunningIds.value, source.id]
  flash(`正在生成 ${draft.imageCount} 张修改结果`)
  const imageResults: GeneratedImageResult[] = []
  try {
    for (let index = 0; index < draft.imageCount; index += 1) {
      imageResults.push(
        await callConfiguredImage(requestNode, context, source.url, prompt, false, controller.signal),
      )
    }
    checkpoint()
    const children = await createImageVariationResultNodes(source, imageResults, draft)
    selected.value = children[0] ? [children[0].id] : [source.id]
    flash(`图片修改完成 · 新增 ${children.length} 张结果`)
  } catch (error) {
    if (isAbortError(error)) {
      if (imageResults.length) {
        checkpoint()
        const children = await createImageVariationResultNodes(source, imageResults, draft)
        selected.value = children[0] ? [children[0].id] : [source.id]
      }
      flash(`已停止生成${imageResults.length ? `，并保留 ${imageResults.length} 张已完成图片` : ''}`)
      return
    }
    const message = readableServiceError(error, variationService, 'image')
    Object.assign(imageEditDraft, draft)
    mediaPromptNodeId.value = source.id
    source.status = 'error'
    source.resultText = message
    flash(message)
  } finally {
    if (generationControllers.get(source.id) === controller) generationControllers.delete(source.id)
    imageVariationRunningIds.value = imageVariationRunningIds.value.filter(
      (id) => id !== source.id,
    )
  }
}
async function runMediaNode(node: CanvasNode) {
  if (!['image', 'video', 'audio'].includes(node.kind)) return
  if (node.kind === 'image' && node.url) {
    const context = buildGenerationContext(node)
    Object.assign(imageEditDraft, {
      nodeId: node.id,
      prompt: node.content.trim() || buildConfiguredImagePrompt(node, context),
      imageWidth: node.imageWidth || 1024,
      imageHeight: node.imageHeight || 1024,
      imageAutoSize: node.imageAutoSize ?? true,
      imageCount: normalizedImageCount(node),
    })
    await runImageVariation(node)
    return
  }
  mediaPromptNodeId.value = null
  await runNode(node)
}
function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
function handleGenerationAction(node: CanvasNode) {
  if (node.status === 'running' || imageVariationRunningIds.value.includes(node.id)) {
    const confirmed = window.confirm('当前生成请求会被中断，已经生成完成的内容会保留。确定停止生成吗？')
    if (!confirmed) return
    generationControllers.get(node.id)?.abort()
    flash('正在停止生成请求…')
    return
  }
  if (['image', 'video', 'audio'].includes(node.kind)) void runMediaNode(node)
  else void runNode(node)
}
async function runNode(node: CanvasNode) {
  if (node.kind === 'image' && imageVariationRunningIds.value.includes(node.id)) {
    flash('当前图片正在生成修改结果')
    return
  }
  const context = buildGenerationContext(node)
  const service = serviceForNode(node)
  const requestedPrompt = node.content
  const previousState = {
    status: node.status,
    resultText: node.resultText,
    url: node.url,
    lastGeneration: node.lastGeneration,
  }
  const controller = new AbortController()
  generationControllers.set(node.id, controller)
  const partialImageResults: GeneratedImageResult[] = []
  let partialImageSnapshot: GenerationSnapshot | undefined
  node.status = 'running'
  try {
    validateServiceConfig(service, nodeServiceKind(node))
    if (node.kind === 'image') {
      const imageCount = normalizedImageCount(node)
      node.imageCount = imageCount
      const ownReferenceUrl = node.url || ''
      const inputVersions = Object.fromEntries(
        context.upstream.map((item) => [item.id, item.version]),
      )
      partialImageSnapshot = {
        generatedAt: new Date().toISOString(),
        inputNodeIds: context.upstream.map((item) => item.id),
        inputVersions,
        prompt: '',
        model: service.model,
      }
      for (let index = 0; index < imageCount; index += 1) {
        partialImageResults.push(await callConfiguredImage(node, context, ownReferenceUrl, '', true, controller.signal))
      }
      const snapshot: GenerationSnapshot = {
        ...partialImageSnapshot,
        prompt: partialImageResults[0]!.prompt,
      }
      await writeImageResult(node, partialImageResults[0]!.imageUrl, partialImageResults[0]!.prompt)
      node.status = 'success'
      node.lastGeneration = snapshot
      node.resultText = `已通过 ${service.model} 生成 ${imageCount} 张图像`
      await createImageBatchResultNodes(node, partialImageResults.slice(1), snapshot)
      flash(
        `生成完成 · ${imageCount} 张图像 · 使用 ${context.upstream.length} 个上游输入`,
      )
      return
    }
    if (node.kind === 'audio') {
      const { audioUrl, input } = await callConfiguredAudio(node, context, controller.signal)
      const inputVersions = Object.fromEntries(
        context.upstream.map((item) => [item.id, item.version]),
      )
      await assignCanvasMediaUrl(node, audioUrl, `${node.title}.${node.audioFormat || 'mp3'}`)
      node.audioRecorded = false
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
    if (node.kind === 'video') {
      const { videoUrl, prompt } = await callConfiguredVideo(node, context, controller.signal)
      const inputVersions = Object.fromEntries(
        context.upstream.map((item) => [item.id, item.version]),
      )
      await assignCanvasMediaUrl(node, videoUrl, `${node.title}.mp4`)
      node.status = 'success'
      node.lastGeneration = {
        generatedAt: new Date().toISOString(),
        inputNodeIds: context.upstream.map((item) => item.id),
        inputVersions,
        prompt,
        model: service.model,
      }
      node.resultText = `已通过 ${service.model} 生成视频`
      node.version = (node.version || 0) + 1
      flash(`视频生成完成 · 使用 ${context.upstream.length} 个上游输入`)
      return
    }
    const result = await callConfiguredModel(node, context, controller.signal)
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
    if (isAbortError(error)) {
      Object.assign(node, previousState)
      if (partialImageResults.length && partialImageSnapshot) {
        const snapshot = { ...partialImageSnapshot, prompt: partialImageResults[0]!.prompt }
        await writeImageResult(node, partialImageResults[0]!.imageUrl, partialImageResults[0]!.prompt)
        node.status = 'success'
        node.lastGeneration = snapshot
        node.resultText = `生成已中断 · 已保留 ${partialImageResults.length} 张完成图像`
        await createImageBatchResultNodes(node, partialImageResults.slice(1), snapshot)
      }
      flash(`已停止生成${partialImageResults.length ? `，并保留 ${partialImageResults.length} 张已完成图片` : ''}`)
      return
    }
    const message = readableServiceError(error, service, nodeServiceKind(node))
    node.status = 'error'
    node.resultText = message
    flash(message)
  } finally {
    if (generationControllers.get(node.id) === controller) generationControllers.delete(node.id)
  }
}
function openNodeFilePicker(node: CanvasNode) {
  addFileTargetNodeId.value = node.id
  if (addFileInput.value) {
    addFileInput.value.removeAttribute('accept')
    addFileInput.value.click()
  }
}
const supportedUploadExtensions: Record<ServiceKind, string[]> = {
  text: [
    'txt', 'md', 'markdown', 'json', 'csv', 'log', 'xml', 'html', 'htm', 'css', 'js', 'mjs',
    'cjs', 'ts', 'tsx', 'jsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'yaml',
    'yml', 'toml', 'ini', 'conf',
  ],
  image: ['jpg', 'jpeg', 'jpe', 'png', 'webp', 'gif', 'bmp', 'avif'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
}
function uploadedFileKind(file: File): ServiceKind | undefined {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (
    file.type.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/javascript'].includes(file.type) ||
    supportedUploadExtensions.text.includes(extension)
  ) return 'text'
  if (file.type.startsWith('image/') || supportedUploadExtensions.image.includes(extension))
    return 'image'
  if (file.type.startsWith('video/') || supportedUploadExtensions.video.includes(extension))
    return 'video'
  if (file.type.startsWith('audio/') || supportedUploadExtensions.audio.includes(extension))
    return 'audio'
  return undefined
}
function uploadedNodeFromFile(
  file: File,
  kind: ServiceKind,
  value: string,
  x: number,
  y: number,
): CanvasNode {
  const isTextFile = kind === 'text'
  return {
    id: `node-${uid()}`,
    kind,
    title: file.name,
    x,
    y,
    width: isTextFile ? 360 : 300,
    height: isTextFile ? 300 : undefined,
    content: isTextFile
      ? value
      : `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · 本地资产`,
    url: isTextFile ? undefined : value,
    status: 'idle',
    version: 1,
    createdAt: Date.now(),
    imageWidth: kind === 'image' ? 1024 : undefined,
    imageHeight: kind === 'image' ? 1024 : undefined,
    imageAutoSize: kind === 'image' ? true : undefined,
    imageCount: kind === 'image' ? 1 : undefined,
    videoAspectWidth: kind === 'video' ? 16 : undefined,
    videoAspectHeight: kind === 'video' ? 9 : undefined,
    videoAutoSize: kind === 'video' ? true : undefined,
    videoDuration: kind === 'video' ? 5 : undefined,
    videoResolution: kind === 'video' ? 720 : undefined,
  }
}
function openStandaloneFilePicker() {
  showTemplatePanel.value = false
  showAssetPanel.value = false
  standaloneFileInput.value?.click()
}
async function addStandaloneFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const kind = uploadedFileKind(file)
  if (!kind)
    return flash(`无法为“${file.name}”创建控件：暂不支持该文件类型`)
  try {
    const value = kind === 'text' ? await readUploadedTextFile(file) : ''
    if (!value) throw new Error(`无法读取文件“${file.name}”`)
    const center = screenToCanvas(window.innerWidth * 0.5, window.innerHeight * 0.5)
    const node = uploadedNodeFromFile(file, kind, value, center.x - (kind === 'text' ? 180 : 150), center.y - 150)
    if (kind !== 'text') await assignCanvasMediaBlob(node, file, file.name)
    checkpoint()
    nodes.value.push(node)
    selected.value = [node.id]
    selectedEdge.value = null
    flash(`已上传“${file.name}”并创建${serviceKindLabel(kind)}控件`)
  } catch (error) {
    flash(error instanceof Error ? error.message : `无法为“${file.name}”创建控件`)
  }
}
function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取所选文件'))
    reader.readAsDataURL(file)
  })
}
function decodedTextLooksValid(value: string) {
  if (value.includes('\u0000')) return false
  if (!value.length) return true
  let invalidControls = 0
  let replacementCharacters = 0
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 32 && !['\n', '\r', '\t', '\f'].includes(character)) invalidControls += 1
    if (character === '\uFFFD') replacementCharacters += 1
  }
  return (
    invalidControls / value.length < 0.01 &&
    replacementCharacters / value.length < 0.01
  )
}
async function readUploadedTextFile(file: File) {
  try {
    const nativeText = (await file.text()).replace(/^\uFEFF/, '')
    if (nativeText.trim() && decodedTextLooksValid(nativeText)) return nativeText
  } catch {
    // Fall back to explicit byte decoding below.
  }
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    throw new Error(`无法读取文本文件“${file.name}”`)
  }
  if (!bytes.byteLength)
    throw new Error(`文本文件“${file.name}”是空文件，没有可读取的文字内容`)
  const data = new Uint8Array(bytes)
  const encodings: string[] = []
  if (data[0] === 0xff && data[1] === 0xfe) encodings.push('utf-16le')
  else if (data[0] === 0xfe && data[1] === 0xff) encodings.push('utf-16be')
  else if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) encodings.push('utf-8')
  encodings.push('utf-8', 'gb18030', 'utf-16le', 'utf-16be')
  for (const encoding of [...new Set(encodings)]) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: true })
        .decode(data)
        .replace(/^\uFEFF/, '')
      if (decoded.trim() && decodedTextLooksValid(decoded)) return decoded
    } catch {
      // Try the next common text encoding.
    }
  }
  throw new Error(
    `无法读取文本文件“${file.name}”：文件可能损坏、不是纯文本，或使用了不支持的字符编码`,
  )
}
async function addFileToNode(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const targetId = addFileTargetNodeId.value
  input.value = ''
  addFileTargetNodeId.value = null
  if (!file || !targetId) return
  const targetNode = nodeMap.value.get(targetId)
  if (!targetNode) return flash('目标控件已不存在')
  const fileKind = uploadedFileKind(file)
  if (!fileKind) {
    flash('暂不支持该文件类型，请选择文本、图片、视频或音频文件')
    return
  }
  try {
    const isTextFile = fileKind === 'text'
    const value = isTextFile ? await readUploadedTextFile(file) : ''
    const nodeWidth = fileKind === 'text' ? 360 : 300
    const existingInputCount = incomingEdges(targetNode.id).length
    const newNode = uploadedNodeFromFile(
      file,
      fileKind,
      value,
      targetNode.x - nodeWidth - 120,
      targetNode.y + existingInputCount * 38,
    )
    if (!isTextFile) await assignCanvasMediaBlob(newNode, file, file.name)
    const nextOrder =
      Math.max(0, ...incomingEdges(targetNode.id).map((edge) => edge.order)) + 1
    checkpoint()
    nodes.value.push(newNode)
    edges.value.push({
      id: `edge-${uid()}`,
      source: newNode.id,
      target: targetNode.id,
      sourceHandle: 'output',
      targetHandle: 'input',
      order: nextOrder,
      enabled: true,
    })
    selected.value = [newNode.id]
    selectedEdge.value = null
    markNodeChanged(targetNode)
    flash(
      isTextFile
        ? `已读取 ${value.length} 字，并在左侧创建文本节点`
        : `已在左侧创建${serviceKindLabel(fileKind)}节点并连接到“${targetNode.title}”`,
    )
  } catch (error) {
    flash(error instanceof Error ? error.message : '文件添加失败')
  }
}
async function replaceSelectedImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  const node = selectedNode.value
  if (!file || !node || node.kind !== 'image') return
  ;(event.target as HTMLInputElement).value = ''
  try {
    await assignCanvasMediaBlob(node, file, file.name)
    checkpoint()
    node.title = file.name
    node.content = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · 本地资产`
    node.imagePrompt = undefined
    node.lastGeneration = undefined
    node.resultText = undefined
    node.status = 'idle'
    imageEditNodeId.value = null
    mediaPromptNodeId.value = null
    node.version = (node.version || 0) + 1
    flash('图片已替换，下游结果需要重新生成')
  } catch {
    flash(`无法保存“${file.name}”，请检查浏览器存储空间`)
  }
}
async function replaceSelectedMedia(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const node = selectedNode.value
  input.value = ''
  if (!file || !node || (node.kind !== 'video' && node.kind !== 'audio')) return
  const mediaKind: 'video' | 'audio' = node.kind
  if (!file.type.startsWith(`${mediaKind}/`)) {
    return flash(`请选择${serviceKindLabel(mediaKind)}文件`)
  }
  try {
    await assignCanvasMediaBlob(node, file, file.name)
    checkpoint()
    node.title = file.name
    node.content = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · 本地资产`
    node.lastGeneration = undefined
    node.resultText = undefined
    node.status = 'idle'
    node.version = (node.version || 0) + 1
    mediaPromptNodeId.value = null
    if (node.kind === 'audio') {
      node.audioRecorded = false
      delete audioPlaybackStates[node.id]
    }
    flash(`${serviceKindLabel(mediaKind)}文件已替换，下游结果需要重新生成`)
  } catch {
    flash(`无法保存“${file.name}”，请检查浏览器存储空间`)
  }
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
  openFileSourceChoice('replace', node)
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
    nodes: canvasNodesForStorage(),
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
  void refreshStorageUsage()
  if (!silent) flash('已保存到本地')
}
type ZipEntry = { name: string; data: Uint8Array }
type ExportedAsset = {
  assetId: string
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
type ImportedCanvasPackage = {
  format?: unknown
  version?: unknown
  name?: unknown
  nodes?: unknown
  edges?: unknown
  viewport?: unknown
  files?: unknown
}
const MAX_IMPORT_ARCHIVE_BYTES = 512 * 1024 * 1024
const MAX_IMPORT_ENTRIES = 10000
const MAX_IMPORT_NODES = 5000
const MAX_IMPORT_EDGES = 10000
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
function isSafeZipPath(path: string) {
  if (!path || path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path)) return false
  return path.split('/').every((part) => part !== '..' && part !== '.')
}
function parseStoredZip(buffer: ArrayBuffer) {
  if (buffer.byteLength > MAX_IMPORT_ARCHIVE_BYTES) {
    throw new Error('压缩包超过 512 MB，无法导入')
  }
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (bytes.length < 22) throw new Error('ZIP 文件不完整')
  const endOffset = bytes.length - 22
  if (view.getUint32(endOffset, true) !== 0x06054b50 || view.getUint16(endOffset + 20, true) !== 0) {
    throw new Error('ZIP 结束目录损坏或包含不兼容的附加数据')
  }
  const entryCount = view.getUint16(endOffset + 10, true)
  const centralSize = view.getUint32(endOffset + 12, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  if (
    view.getUint16(endOffset + 4, true) !== 0 ||
    view.getUint16(endOffset + 6, true) !== 0 ||
    view.getUint16(endOffset + 8, true) !== entryCount ||
    centralOffset + centralSize !== endOffset
  ) throw new Error('ZIP 中央目录无效')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const entries = new Map<string, Uint8Array>()
  let offset = 0
  while (offset < centralOffset) {
    const signature = view.getUint32(offset, true)
    if (signature !== 0x04034b50 || offset + 30 > bytes.length) {
      throw new Error('ZIP 结构损坏或不是本项目导出的压缩包')
    }
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const expectedCrc = view.getUint32(offset + 14, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const uncompressedSize = view.getUint32(offset + 22, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    if (flags & 0x0001) throw new Error('不支持加密 ZIP')
    if (flags & 0x0008) throw new Error('ZIP 使用了不兼容的数据描述符')
    if (method !== 0) throw new Error('压缩方式不匹配，请导入本项目“导出画布”生成的 ZIP')
    if (compressedSize !== uncompressedSize) throw new Error('ZIP 文件尺寸声明不一致')
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressedSize
    if (!nameLength || dataStart > bytes.length || dataEnd > bytes.length) {
      throw new Error('ZIP 文件条目不完整')
    }
    let name = ''
    try {
      name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    } catch {
      throw new Error('ZIP 中存在无法读取的文件名')
    }
    if (!isSafeZipPath(name)) throw new Error(`ZIP 中存在不安全路径：${name}`)
    if (entries.has(name)) throw new Error(`ZIP 中存在重复文件：${name}`)
    const data = bytes.slice(dataStart, dataEnd)
    if (crc32(data) !== expectedCrc) throw new Error(`文件校验失败：${name}`)
    entries.set(name, data)
    if (entries.size > MAX_IMPORT_ENTRIES) throw new Error('ZIP 内文件数量过多')
    offset = dataEnd
  }
  if (offset !== centralOffset || !entries.size || entries.size !== entryCount) {
    throw new Error('ZIP 目录数量或位置不一致')
  }
  let directoryOffset = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (directoryOffset + 46 > endOffset || view.getUint32(directoryOffset, true) !== 0x02014b50) {
      throw new Error('ZIP 中央目录条目损坏')
    }
    const nameLength = view.getUint16(directoryOffset + 28, true)
    const extraLength = view.getUint16(directoryOffset + 30, true)
    const commentLength = view.getUint16(directoryOffset + 32, true)
    directoryOffset += 46 + nameLength + extraLength + commentLength
  }
  if (directoryOffset !== endOffset) throw new Error('ZIP 中央目录尺寸不一致')
  return entries
}
function mimeTypeForPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase()
  const known: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm',
    mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  }
  return known[extension || ''] || 'application/octet-stream'
}
function validateImportedCanvas(raw: ImportedCanvasPackage) {
  if (raw.format !== 'infinite-canvas-export' || ![1, 2].includes(Number(raw.version))) {
    throw new Error('canvas.json 格式或版本不匹配')
  }
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new Error('canvas.json 缺少节点或连线数据')
  }
  if (raw.nodes.length > MAX_IMPORT_NODES || raw.edges.length > MAX_IMPORT_EDGES) {
    throw new Error('画布中的节点或连线数量超过导入上限')
  }
  const validKinds = new Set<NodeKind>(['text', 'image', 'video', 'audio', 'config'])
  const nodeIds = new Set<string>()
  for (const value of raw.nodes) {
    const node = value as Partial<CanvasNode>
    if (!node || typeof node !== 'object') throw new Error('节点数据格式错误')
    if (typeof node.id !== 'string' || !node.id.trim() || nodeIds.has(node.id)) {
      throw new Error('节点 ID 缺失或重复')
    }
    if (!validKinds.has(node.kind as NodeKind)) throw new Error(`节点类型无效：${node.id}`)
    if (typeof node.title !== 'string' || typeof node.content !== 'string') {
      throw new Error(`节点文字字段无效：${node.id}`)
    }
    if (![node.x, node.y, node.width].every((value) => Number.isFinite(value)) || Number(node.width) <= 0) {
      throw new Error(`节点位置或尺寸无效：${node.id}`)
    }
    if (node.height != null && (!Number.isFinite(node.height) || node.height <= 0)) {
      throw new Error(`节点高度无效：${node.id}`)
    }
    if (node.url != null && typeof node.url !== 'string') throw new Error(`节点资源地址无效：${node.id}`)
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  const groupIds = new Set(
    (raw.nodes as CanvasNode[]).map((node) => node.groupId).filter((id): id is string => typeof id === 'string' && Boolean(id)),
  )
  for (const value of raw.edges) {
    const edge = value as Partial<Edge>
    if (!edge || typeof edge !== 'object' || typeof edge.id !== 'string' || !edge.id.trim()) {
      throw new Error('连线 ID 缺失')
    }
    if (edgeIds.has(edge.id)) throw new Error(`连线 ID 重复：${edge.id}`)
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      throw new Error(`连线端点无效：${edge.id}`)
    }
    if (edge.source === edge.target || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`连线引用了无效节点：${edge.id}`)
    }
    if ((edge.sourceGroupId && !groupIds.has(edge.sourceGroupId)) || (edge.targetGroupId && !groupIds.has(edge.targetGroupId))) {
      throw new Error(`连线引用了无效分组：${edge.id}`)
    }
    if (edge.order != null && !Number.isFinite(edge.order)) throw new Error(`连线顺序无效：${edge.id}`)
    edgeIds.add(edge.id)
  }
  if (raw.viewport != null) {
    const importedViewport = raw.viewport as Partial<typeof viewport>
    if (
      typeof importedViewport !== 'object' ||
      ![importedViewport.x, importedViewport.y, importedViewport.zoom].every((value) => Number.isFinite(value)) ||
      Number(importedViewport.zoom) <= 0
    ) throw new Error('画布视口数据无效')
  }
  if (raw.files != null && !Array.isArray(raw.files)) throw new Error('资源清单格式无效')
  return {
    name: typeof raw.name === 'string' ? raw.name : '导入的画布',
    nodes: JSON.parse(JSON.stringify(raw.nodes)) as CanvasNode[],
    edges: JSON.parse(JSON.stringify(raw.edges)) as Edge[],
    viewport: raw.viewport as Partial<typeof viewport> | undefined,
    files: (raw.files || []) as Array<{ assetId?: unknown; path?: unknown; mimeType?: unknown; size?: unknown }>,
  }
}
function uniqueImportedCanvasName(value: string) {
  const base = normalizeCanvasName(value || '导入的画布')
  const usedNames = new Set(canvasIndex.value.map((item) => item.name))
  if (!usedNames.has(base)) return base
  let suffix = 2
  let candidate = `${base}（导入）`
  while (usedNames.has(candidate)) {
    candidate = `${base}（导入 ${suffix}）`
    suffix += 1
  }
  return candidate
}
async function importCanvasArchive(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  showProjectMenu.value = false
  showCanvasList.value = false
  try {
    if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('请选择 .zip 画布压缩包')
    if (file.size > MAX_IMPORT_ARCHIVE_BYTES) throw new Error('压缩包超过 512 MB，无法导入')
    flash('正在校验并导入画布…')
    const zipEntries = parseStoredZip(await file.arrayBuffer())
    for (const path of zipEntries.keys()) {
      if (path !== 'canvas.json' && !path.startsWith('file/')) {
        throw new Error(`压缩包中存在不属于画布的文件：${path}`)
      }
    }
    const canvasBytes = zipEntries.get('canvas.json')
    if (!canvasBytes) throw new Error('压缩包根目录缺少 canvas.json')
    let raw: ImportedCanvasPackage
    try {
      raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(canvasBytes))
    } catch {
      throw new Error('canvas.json 不是可读取的 UTF-8 JSON 文件')
    }
    const imported = validateImportedCanvas(raw)
    const manifest = new Map<string, { assetId?: string; mimeType?: string; size?: number }>()
    for (const item of imported.files) {
      if (typeof item.path !== 'string' || !item.path.startsWith('file/') || !isSafeZipPath(item.path)) {
        throw new Error('资源清单中存在无效路径')
      }
      if (item.size != null && (!Number.isFinite(item.size) || Number(item.size) < 0)) {
        throw new Error(`资源尺寸无效：${item.path}`)
      }
      const nextManifestItem = {
        assetId: typeof item.assetId === 'string' ? item.assetId : undefined,
        mimeType: typeof item.mimeType === 'string' ? item.mimeType : undefined,
        size: typeof item.size === 'number' ? item.size : undefined,
      }
      const existingManifestItem = manifest.get(item.path)
      if (
        existingManifestItem &&
        (existingManifestItem.mimeType !== nextManifestItem.mimeType ||
          existingManifestItem.size !== nextManifestItem.size)
      ) throw new Error(`资源清单中的重复记录不一致：${item.path}`)
      manifest.set(item.path, nextManifestItem)
    }
    for (const [path, declared] of manifest) {
      const data = zipEntries.get(path)
      if (!data) throw new Error(`资源清单中的文件不存在：${path}`)
      if (declared.size != null && declared.size !== data.length) {
        throw new Error(`资源尺寸与清单不一致：${path}`)
      }
    }
    for (const node of imported.nodes) {
      const path = node.url?.startsWith('file/')
        ? node.url
        : [...manifest.entries()].find(([, item]) => item.assetId === node.assetId)?.[0]
      if (!path) continue
      const data = zipEntries.get(path)
      if (!data) throw new Error(`节点“${node.title}”引用的文件不存在：${path}`)
      const declared = manifest.get(path)
      if (!declared) throw new Error(`节点“${node.title}”的资源未登记在文件清单中`)
      if (declared?.size != null && declared.size !== data.length) {
        throw new Error(`资源尺寸与清单不一致：${path}`)
      }
      const mimeType = declared?.mimeType || mimeTypeForPath(path)
      const importedAssetId = `canvas-media-${Date.now()}-${uid()}`
      await putCanvasMedia({
        id: importedAssetId,
        blob: new Blob([new Uint8Array(data)], { type: mimeType }),
        name: node.title,
        mimeType,
        size: data.length,
        createdAt: Date.now(),
      })
      node.assetId = importedAssetId
      delete node.url
    }
    saveNow(true)
    const importedId = `canvas-${uid()}`
    const importedName = uniqueImportedCanvasName(imported.name)
    const updatedAt = Date.now()
    const payload = {
      name: importedName,
      nodes: imported.nodes,
      edges: imported.edges,
      viewport: imported.viewport || { x: 0, y: 0, zoom: 1 },
      updatedAt,
    }
    const storageKeyForImport = `infinite:canvas:${importedId}`
    try {
      localStorage.setItem(storageKeyForImport, JSON.stringify(payload))
    } catch (error) {
      localStorage.removeItem(storageKeyForImport)
      throw new Error(error instanceof DOMException && error.name === 'QuotaExceededError'
        ? '浏览器本地存储空间不足，画布未导入'
        : '无法写入浏览器本地存储，画布未导入')
    }
    canvasId.value = importedId
    applyCanvasPayload(payload)
    await hydrateCanvasMedia()
    localStorage.setItem('infinite:last-canvas', importedId)
    upsertCanvasIndex(importedId, importedName, updatedAt, imported.nodes.length, imported.edges.length)
    selected.value = []
    selectedEdge.value = null
    history.value = []
    future.value = []
    imageEditNodeId.value = null
    mediaPromptNodeId.value = null
    imageSettingsNodeId.value = null
    videoSettingsNodeId.value = null
    flash(`已导入画布“${importedName}”：${imported.nodes.length} 个节点，${imported.edges.length} 条连线`)
  } catch (error) {
    flash(`导入失败：${error instanceof Error ? error.message : '无法读取画布压缩包'}`)
  }
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
    const assetById = new Map<string, { path: string; mimeType: string; size: number }>()

    for (const [index, node] of exportedNodes.entries()) {
      const liveNode = nodes.value[index]
      if (!liveNode?.assetId && !liveNode?.url) continue
      const identity = liveNode.assetId || liveNode.url!
      const existing = assetById.get(identity)
      if (existing) {
        delete node.url
        exportedAssets.push({
          assetId: liveNode.assetId || identity,
          nodeId: node.id,
          nodeTitle: node.title,
          path: existing.path,
          mimeType: existing.mimeType,
          size: existing.size,
        })
        continue
      }
      const originalUrl = liveNode.url || ''
      try {
        const stored = liveNode.assetId ? await getCanvasMedia(liveNode.assetId) : undefined
        const asset = stored
          ? { data: new Uint8Array(await stored.blob.arrayBuffer()), mimeType: stored.mimeType }
          : await readExportAsset(originalUrl)
        const filename = uniqueAssetName(node.title, asset.mimeType, usedNames)
        const path = `file/${filename}`
        zipEntries.push({ name: path, data: asset.data })
        assetById.set(identity, { path, mimeType: asset.mimeType, size: asset.data.length })
        node.assetId = liveNode.assetId || `exported-${uid()}`
        delete node.url
        exportedAssets.push({
          assetId: node.assetId,
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
      version: 2,
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
    void hydrateCanvasMedia()
    localStorage.setItem('infinite:last-canvas', targetId)
    selected.value = []
    selectedEdge.value = null
    history.value = []
    future.value = []
    imageEditNodeId.value = null
    mediaPromptNodeId.value = null
    imageSettingsNodeId.value = null
    videoSettingsNodeId.value = null
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
  mediaPromptNodeId.value = null
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
    void hydrateCanvasMedia()
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
  mediaPromptNodeId.value = null
  imageSettingsNodeId.value = null
  videoSettingsNodeId.value = null
  showRenameCanvas.value = false
  showCanvasList.value = false
  showProjectMenu.value = false
  flash(`已删除画布“${deletedName}”`)
}
function deleteCanvasFromList(item: CanvasIndexItem) {
  if (item.id === canvasId.value) {
    deleteCurrentCanvas()
    return
  }
  if (!window.confirm(`确定删除画布“${item.name}”吗？此操作无法撤销。`)) return
  localStorage.removeItem(`infinite:canvas:${item.id}`)
  canvasIndex.value = canvasIndex.value.filter((canvas) => canvas.id !== item.id)
  persistCanvasIndex()
  flash(`已删除画布“${item.name}”`)
}
function clearLocalData() {
  localStorage.clear()
  inputMode.value = 'mouse'
  canvasIndex.value = []
  canvasTemplates.value = []
  canvasRoles.value = []
  savedPrompts.value = []
  publicPromptSources.splice(0, publicPromptSources.length, ...cloneValue(DEFAULT_PUBLIC_PROMPT_SOURCES))
  publicPrompts.value = []
  Object.keys(promptSourceTests).forEach((id) => delete promptSourceTests[id])
  closePromptLibrary()
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
    videoAspectWidth:
      node.kind === 'video' ? Math.min(100, Math.max(1, Math.round(node.videoAspectWidth || 16))) : node.videoAspectWidth,
    videoAspectHeight:
      node.kind === 'video' ? Math.min(100, Math.max(1, Math.round(node.videoAspectHeight || 9))) : node.videoAspectHeight,
    videoAutoSize: node.kind === 'video' ? node.videoAutoSize ?? true : node.videoAutoSize,
    videoDuration:
      node.kind === 'video' ? Math.min(15, Math.max(1, Math.round(node.videoDuration || 5))) : node.videoDuration,
    videoResolution:
      node.kind === 'video' && [480, 720, 1080, 2160].includes(Number(node.videoResolution))
        ? node.videoResolution
        : node.kind === 'video' ? 720 : node.videoResolution,
    audioVoice: node.kind === 'audio' ? node.audioVoice || 'alloy' : node.audioVoice,
    audioFormat: node.kind === 'audio' ? node.audioFormat || 'mp3' : node.audioFormat,
    audioGenerationSpeed:
      node.kind === 'audio' && AUDIO_SPEED_OPTIONS.includes(Number(node.audioGenerationSpeed) as AudioSpeed)
        ? node.audioGenerationSpeed
        : node.kind === 'audio' ? 1 : node.audioGenerationSpeed,
    audioInstructions: node.kind === 'audio' ? node.audioInstructions || '自然' : node.audioInstructions,
    audioRecorded:
      node.kind === 'audio'
        ? node.audioRecorded ?? node.content.startsWith('本地录音')
        : node.audioRecorded,
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
  loadCanvasRoles()
  loadSavedPrompts()
  loadPromptSources()
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
    delete baseSettings.canvasPrompt
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
  if (!localStorage.getItem(SNAP_DEFAULT_MIGRATION_KEY)) {
    settings.snap = false
    localStorage.setItem(SNAP_DEFAULT_MIGRATION_KEY, '1')
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
    void hydrateCanvasMedia()
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
  if (event.key === 'Escape' && showShortcutHelp.value) {
    event.preventDefault()
    showShortcutHelp.value = false
    return
  }
  const target = event.target as HTMLElement
  const typing =
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"], .node-prompt-editor'))
  if (typing) return
  const commandKey = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (commandKey && key === 'c') {
    event.preventDefault()
    copySelectedNodes()
  } else if (commandKey && key === 'v') {
    event.preventDefault()
    pasteCopiedNodes()
  } else if (commandKey && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  } else if (commandKey && key === 's') {
    event.preventDefault()
    saveNow()
  } else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected()
  else if (event.key === 'Escape') {
    linkingFrom.value = null
    stopEdgeAutoPan()
    imageEditNodeId.value = null
    mediaPromptNodeId.value = null
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
watch(inputMode, (value) => localStorage.setItem(INPUT_MODE_KEY, value))
watch(publicPromptSources, () => {
  persistPromptSources()
  publicPrompts.value = []
  publicPromptError.value = ''
  if (publicPromptSourceId.value !== 'all' && !publicPromptSources.some((source) => source.id === publicPromptSourceId.value && source.enabled)) {
    publicPromptSourceId.value = 'all'
  }
}, { deep: true })
onMounted(() => {
  loadLocal()
  void loadAssetLibrary()
  void refreshStorageUsage()
  storageUsageTimer = window.setInterval(() => void refreshStorageUsage(), 2500)
  enableFontScaling()
  updateCanvasSize()
  startNodeSizeObserver()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateCanvasSize)
  window.addEventListener('pointerdown', startImageEditorOutsidePointer, true)
  window.addEventListener('pointermove', moveImageEditorOutsidePointer, true)
  window.addEventListener('pointerup', finishImageEditorOutsidePointer, true)
  window.addEventListener('pointercancel', cancelImageEditorOutsidePointer, true)
  window.addEventListener('pointerdown', closeAudioVolumeOutside, true)
  window.addEventListener('click', closeProjectMenuOutside)
  window.addEventListener('click', closeAudioMenuOutside)
  window.addEventListener('click', closeTextPromptSaveOutside)
})
onUnmounted(() => {
  window.clearInterval(storageUsageTimer)
  stopEdgeAutoPan()
  stopWheelZoom()
  generationControllers.forEach((controller) => controller.abort())
  generationControllers.clear()
  activeAudioRecorder?.stop()
  activeAudioStream?.getTracks().forEach((track) => track.stop())
  canvasMediaObjectUrls.forEach((url) => URL.revokeObjectURL(url))
  canvasMediaObjectUrls.clear()
  nodeSizeObserver?.disconnect()
  nodeSizeObserver = null
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateCanvasSize)
  window.removeEventListener('pointerdown', startImageEditorOutsidePointer, true)
  window.removeEventListener('pointermove', moveImageEditorOutsidePointer, true)
  window.removeEventListener('pointerup', finishImageEditorOutsidePointer, true)
  window.removeEventListener('pointercancel', cancelImageEditorOutsidePointer, true)
  window.removeEventListener('pointerdown', closeAudioVolumeOutside, true)
  window.removeEventListener('click', closeProjectMenuOutside)
  window.removeEventListener('click', closeAudioMenuOutside)
  window.removeEventListener('click', closeTextPromptSaveOutside)
})
</script>

<template>
  <div class="app-shell" :style="{ '--font-scale': fontScale }">
    <header class="topbar">
      <div class="project-wrap">
        <button class="project-button" @click="showProjectMenu = !showProjectMenu">
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
            <div
              v-for="item in canvasIndex"
              :key="item.id"
              class="canvas-picker-row"
              :class="{ current: item.id === canvasId }"
            >
              <button
                class="canvas-picker-item"
                @click="switchCanvas(item.id)"
              >
                <span>
                  <b>{{ item.name }}</b>
                  <small>{{ formatCanvasUpdatedAt(item.updatedAt) }}</small>
                  <small>{{ item.nodeCount }} 个节点 · {{ item.edgeCount }} 条连线</small>
                </span>
                <i v-if="item.id === canvasId">当前</i>
              </button>
              <button
                class="canvas-picker-delete"
                :aria-label="`删除画布 ${item.name}`"
                title="删除画布"
                @click.stop="deleteCanvasFromList(item)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14M9 7V4.5h6V7M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path>
                </svg>
              </button>
            </div>
            <div v-if="!canvasIndex.length" class="canvas-picker-empty">
              暂无已保存画布
            </div>
          </div>
          <button @click="importCanvasInput?.click()">⇩ 导入画布</button>
          <input
            ref="importCanvasInput"
            class="visually-hidden-file-input"
            type="file"
            accept=".zip,application/zip"
            @change="importCanvasArchive"
          />
          <div class="project-menu-divider"></div>
          <button @click="newCanvas">＋ 新建画布</button>
          <button @click="exportCanvas">⇩ 导出画布</button>
          <button @click="saveNow()">✓ 保存到本地</button>
          <button class="danger-menu-item" @click="deleteCurrentCanvas">⌫ 删除当前画布</button>
          <div class="menu-meta">ID · {{ canvasId }}</div>
        </div>
      </div>
      <div class="save-state"><span></span> 已保存</div>
      <div
        class="storage-usage-state"
        :title="originStorageQuota ? `当前网站全部本地存储占用 ${storageUsageLabel}，浏览器估算可用配额 ${formatAssetSize(originStorageQuota)}` : `当前网站全部本地存储占用 ${storageUsageLabel}`"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7" ry="3"></ellipse><path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path></svg>
        <span>本地占用 {{ storageUsageLabel }}</span>
      </div>
      <div class="top-spacer"></div>
      <CustomSelect
        v-model="inputMode"
        class="input-mode-control"
        title="选择画布滚动方式"
        aria-label="画布操作模式"
        :options="inputModeOptions"
      />
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
      <button
        class="top-action shortcut-help-button"
        title="查看所有快捷键"
        aria-label="快捷键"
        :aria-expanded="showShortcutHelp"
        @click="showShortcutHelp = true"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3"></rect>
          <path d="M7 9h1M11.5 9h1M16 9h1M7 13h1M11.5 13h1M16 13h1M8 16h8"></path>
        </svg>
        <span>快捷键</span>
      </button>
      <button class="top-action" @click="showSettings = true">⚙ <span>配置</span></button>
    </header>

    <main class="workspace">
      <aside
        class="left-rail"
        :class="{ collapsed: !railLocked && !railHovered, unlocked: !railLocked }"
        @mouseenter="railHovered = true"
        @mouseleave="railHovered = false"
      >
        <button
          class="rail-lock-button"
          :class="{ active: railLocked }"
          :title="railLocked ? '关闭状态栏锁定' : '锁定状态栏'"
          :aria-label="railLocked ? '关闭状态栏锁定' : '锁定状态栏'"
          :aria-pressed="railLocked"
          @click="railLocked = !railLocked"
        >
          <svg v-if="railLocked" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M16 10V7a4 4 0 0 0-7.5-2"></path></svg>
          <span>{{ railLocked ? '锁定' : '收起' }}</span>
        </button>
        <button v-for="item in toolbarItems" :key="item.kind" :title="item.label" @click="showTemplatePanel = false; showAssetPanel = false; addNode(item.kind)">
          <b>{{ item.icon }}</b><span>{{ item.label }}</span>
        </button>
        <button title="添加本地文件或资产库内容" aria-label="添加文件或资产" @click="openFileSourceChoice('standalone')">
          <b>＋</b><span>添加</span>
        </button>
        <button
          class="template-rail-button"
          :class="{ active: showTemplatePanel }"
          title="模板"
          aria-label="打开模板"
          @click="toggleTemplatePanel"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3 7 4-7 4-7-4 7-4Z"></path>
            <path d="m5 11 7 4 7-4"></path>
            <path d="m5 15 7 4 7-4"></path>
          </svg>
          <span>模板</span>
        </button>
        <button
          class="asset-rail-button"
          :class="{ active: showAssetPanel }"
          title="资产"
          aria-label="打开资产库"
          @click="toggleAssetPanel"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 6.5h6l2-2h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"></path>
            <circle cx="9" cy="11" r="1.5"></circle><path d="m5.5 17 4-4 3 3 2.5-2.5 3.5 3.5"></path>
          </svg>
          <span>资产</span>
        </button>
        <input ref="replaceImageInput" hidden type="file" accept="image/*" @change="replaceSelectedImage" />
        <input ref="replaceMediaInput" hidden type="file" accept="video/*,audio/*" @change="replaceSelectedMedia" />
        <input ref="addFileInput" hidden type="file" @change="addFileToNode" />
        <input ref="standaloneFileInput" hidden type="file" @change="addStandaloneFile" />
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
            @click="setTemplateTab('mine')"
          >我的模板</button>
          <button
            role="tab"
            :aria-selected="activeTemplateTab === 'library'"
            :class="{ active: activeTemplateTab === 'library' }"
            @click="setTemplateTab('library')"
          >模板库</button>
        </div>
        <div class="template-kind-tabs" role="tablist" aria-label="模板类型">
          <button
            role="tab"
            :aria-selected="activeTemplateKind === 'canvas'"
            :class="{ active: activeTemplateKind === 'canvas' }"
            @click="setTemplateKind('canvas')"
          >画布模板</button>
          <button
            role="tab"
            :aria-selected="activeTemplateKind === 'prompt'"
            :class="{ active: activeTemplateKind === 'prompt' }"
            @click="setTemplateKind('prompt')"
          >提示词模板</button>
        </div>
        <div class="template-panel-body">
          <div v-if="activeTemplateTab === 'mine' && activeTemplateKind === 'canvas'" class="template-mine">
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
          <div v-else-if="activeTemplateTab === 'library' && activeTemplateKind === 'canvas'" class="template-mine template-library-list">
            <div class="template-mine-toolbar">
              <span>内置模板 · 所有人可用</span>
            </div>
            <div class="template-list">
              <article
                v-for="item in builtInCanvasTemplates"
                :key="item.id"
                class="template-card template-library-card"
                tabindex="0"
              >
                <div class="template-card-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 6.5h14v11H5z"></path>
                    <path d="M8 10h3v3H8zM13 10h3M13 13h3"></path>
                  </svg>
                </div>
                <div class="template-card-info">
                  <b>{{ item.name }}</b>
                  <small>{{ item.nodes.length }} 个节点 · {{ item.edges.length }} 条连线</small>
                </div>
                <button class="template-use-button" @click="useCanvasTemplate(item)">使用模板</button>
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
          </div>
          <div v-else-if="activeTemplateTab === 'mine'" class="template-mine template-prompt-list">
            <div class="template-mine-toolbar">
              <span>来自“我的提示词” · {{ savedPrompts.length }}/{{ MAX_SAVED_PROMPTS }}</span>
              <button
                class="template-import-button"
                :disabled="!selectedNode?.content.trim() || savedPrompts.length >= MAX_SAVED_PROMPTS"
                @click="saveSelectedNodeToMyPrompts"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6.5 4.5h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4v-15a1 1 0 0 1 1-1Z"></path>
                </svg>
                保存当前节点
              </button>
            </div>
            <div v-if="savedPrompts.length" class="template-list">
              <article
                v-for="(item, index) in savedPrompts"
                :key="item.id"
                class="template-card prompt-template-card"
                tabindex="0"
              >
                <div class="template-card-icon prompt-template-kind-icon">{{ serviceKindLabel(item.kind).slice(0, 1) }}</div>
                <div class="template-card-info">
                  <input
                    v-if="editingTemplateId === item.id"
                    v-model="templateNameDraft"
                    class="template-name-input"
                    maxlength="60"
                    aria-label="提示词模板名称"
                    autofocus
                    @pointerdown.stop
                    @dblclick.stop
                    @blur="commitPromptTemplateRename(item, index)"
                    @keydown.enter.prevent="commitPromptTemplateRename(item, index)"
                    @keydown.esc.prevent="cancelTemplateRename"
                  />
                  <b
                    v-else
                    class="editable-template-name"
                    :title="`${savedPromptTemplateName(item, index)}（双击重命名）`"
                    @dblclick.stop="startPromptTemplateRename(item, index)"
                  >{{ savedPromptTemplateName(item, index) }}</b>
                  <small>{{ serviceKindLabel(item.kind) }} · {{ item.text }}</small>
                </div>
                <button class="template-use-button" @click="usePromptTemplate(item, index)">使用模板</button>
                <button
                  class="template-delete-button"
                  title="从我的提示词中删除"
                  :aria-label="`删除提示词模板 ${savedPromptTemplateName(item, index)}`"
                  @click.stop="deleteSavedPrompt(item)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V4.5h6V7M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path>
                  </svg>
                </button>
                <div class="template-preview-popover prompt-template-preview" aria-hidden="true">
                  <strong>{{ savedPromptTemplateName(item, index) }} · {{ serviceKindLabel(item.kind) }}</strong>
                  <p>{{ item.text }}</p>
                  <span>与“我的提示词”同步 · 使用后写入同类型节点</span>
                </div>
              </article>
            </div>
            <div v-else class="template-empty">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M12 10h24v28H12zM17 17h14M17 23h14M17 29h9"></path>
              </svg>
              <b>暂无提示词模板</b>
              <p>在节点中保存提示词后，会自动同步显示在这里</p>
            </div>
          </div>
          <div v-else class="template-mine template-library-list template-prompt-list">
            <div class="template-mine-toolbar">
              <span>提示词库 · {{ filteredPublicPrompts.length }} 条</span>
              <button class="template-import-button" :disabled="publicPromptLoading" @click="loadPublicPromptLibrary(true)">↻ 刷新</button>
            </div>
            <div class="template-prompt-library-filters">
              <input v-model="publicPromptQuery" placeholder="搜索标题、提示词、作者或标签" @input="publicPromptVisibleLimit = 36" />
              <CustomSelect
                v-model="publicPromptSourceId"
                aria-label="提示词来源"
                :options="publicPromptSourceOptions"
                @change="publicPromptVisibleLimit = 36"
              />
            </div>
            <div v-if="publicPromptLoading && !publicPrompts.length" class="template-empty compact"><b>正在加载提示词库…</b></div>
            <div v-else-if="visiblePublicPrompts.length" class="template-list">
              <article
                v-for="item in visiblePublicPrompts"
                :key="`${item.sourceId}:${item.id}`"
                class="template-card template-library-card prompt-template-card"
                tabindex="0"
              >
                <div class="template-card-icon prompt-library-thumbnail">
                  <img v-if="item.coverUrl" :src="item.coverUrl" alt="" loading="lazy" referrerpolicy="no-referrer" />
                  <span v-else>图</span>
                </div>
                <div class="template-card-info">
                  <b>{{ item.title }}</b>
                  <small>{{ publicPromptSources.find((source) => source.id === item.sourceId)?.name || item.sourceId }} · {{ item.description || item.prompt }}</small>
                </div>
                <button class="template-view-button" title="查看提示词和参考图片" aria-label="查看提示词详情" @click.stop="openPublicPromptDetail(item)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg>
                </button>
                <button class="template-use-button" @click="usePublicPromptTemplate(item)">使用模板</button>
              </article>
            </div>
            <div v-else class="template-empty compact"><b>没有匹配的提示词</b><p>{{ publicPromptError || '请更换关键词或来源' }}</p></div>
            <button v-if="filteredPublicPrompts.length > publicPromptVisibleLimit" class="public-prompt-more" @click="publicPromptVisibleLimit += 36">加载更多（{{ visiblePublicPrompts.length }}/{{ filteredPublicPrompts.length }}）</button>
          </div>
        </div>
      </aside>

      <aside
        v-if="showAssetPanel"
        class="template-panel asset-panel"
        :class="{ 'drag-active': assetDragActive }"
        aria-label="资产库"
        @pointerdown.stop
        @wheel.stop
        @dragenter.prevent="handleAssetDragEnter"
        @dragover.prevent="assetDragActive = true"
        @dragleave="handleAssetDragLeave"
        @drop.stop.prevent="handleAssetDrop"
      >
        <header class="template-panel-header">
          <div><h2>资产库</h2><p>用户手动添加的媒体资产</p></div>
          <button title="关闭资产库" aria-label="关闭资产库" @click="showAssetPanel = false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>
          </button>
        </header>
        <div class="asset-kind-tabs" role="tablist" aria-label="资产类型">
          <button
            v-for="kind in assetKinds"
            :key="kind"
            role="tab"
            :aria-selected="activeAssetKind === kind"
            :class="{ active: activeAssetKind === kind }"
            @click="activeAssetKind = kind"
          >
            {{ serviceKindLabel(kind) }} <span>{{ assetCount(kind) }}</span>
          </button>
        </div>
        <label class="asset-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>
          <input v-model="assetQuery" placeholder="同时搜索图片、视频和音频" />
        </label>
        <div class="asset-drop-hint" :class="{ uploading: assetUploadBusy }">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"></path><path d="M5 13v6h14v-6"></path></svg>
          {{ assetUploadBusy ? '正在保存上传文件…' : '可将图片、视频或音频拖到资产库上传' }}
        </div>
        <div class="asset-panel-body">
          <div v-if="canvasAssets.length" class="asset-grid">
            <article
              v-for="asset in canvasAssets"
              :key="asset.id"
              class="asset-card"
            >
              <button class="asset-card-use" :title="`使用资产“${asset.title}”`" @click="useLibraryAsset(asset)">
                <div class="asset-preview">
                  <img v-if="asset.kind === 'image' && asset.url" :src="asset.url" :alt="asset.title" />
                  <video v-else-if="asset.kind === 'video' && asset.url" :src="asset.url" muted preload="metadata"></video>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"></path><circle cx="6" cy="18" r="3"></circle><circle cx="16" cy="16" r="3"></circle></svg>
                  <i>{{ serviceKindLabel(asset.kind) }}</i>
                </div>
                <b>{{ asset.title }}</b>
                <small>{{ formatAssetSize(asset.size) }}</small>
              </button>
              <button class="asset-delete-button" :aria-label="`删除资产 ${asset.title}`" title="删除资产" @click.stop="deleteLibraryAsset(asset)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4.5h6V7M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path></svg>
              </button>
            </article>
          </div>
          <div v-else class="asset-empty">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 13h13l4-4h15v30H8z"></path><path d="m14 32 7-8 5 5 4-4 6 7"></path></svg>
            <b>{{ assetQuery.trim() ? '没有匹配的资产' : `暂无${serviceKindLabel(activeAssetKind)}资产` }}</b>
            <p>{{ assetQuery.trim() ? '请尝试其他关键词' : '将本地媒体文件拖入资产库即可保存' }}</p>
          </div>
        </div>
        <div v-if="assetDragActive" class="asset-drop-overlay">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 32V9M15 18l9-9 9 9"></path><path d="M9 28v10h30V28"></path></svg>
          <b>松开鼠标上传到资产库</b>
          <span>支持同时拖入多个图片、视频和音频文件</span>
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
              <marker id="arrow-highlight" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#b4aaff" />
              </marker>
              <marker id="arrow-incompatible" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#f0646f" />
              </marker>
            </defs>
            <g
              v-for="edge in edges"
              :key="edge.id"
              class="edge"
              :class="{ selected: selectedEdge === edge.id, connected: isEdgeConnectedToSelection(edge), incompatible: isEdgeIncompatible(edge), disabled: !edge.enabled }"
              @pointerdown.stop="selectedEdge = edge.id; selected = []"
            >
              <title v-if="isEdgeIncompatible(edge)">{{ incompatibleEdgeTitle(edge) }}</title>
              <path class="edge-hit" :d="edgePath(edge)" />
              <path
                class="edge-line"
                :d="edgePath(edge)"
                :marker-end="isEdgeIncompatible(edge) ? 'url(#arrow-incompatible)' : selectedEdge === edge.id || isEdgeConnectedToSelection(edge) ? 'url(#arrow-highlight)' : 'url(#arrow)'"
              />
            </g>
            <path v-if="linkingFrom || linkingGroupSources.length" class="draft-edge" :d="draftPath()" />
          </svg>

          <div
            v-if="marquee.active"
            class="selection-marquee"
            :style="{
              transform: `translate(${marqueeBounds.x}px, ${marqueeBounds.y}px)`,
              width: `${marqueeBounds.width}px`,
              height: `${marqueeBounds.height}px`,
            }"
          ></div>

          <div
            v-for="group in inactivePersistentGroupFrames"
            :key="group.groupId"
            class="persistent-group-frame"
            :data-group-id="group.groupId"
            :style="{
              transform: `translate(${group.x}px, ${group.y}px)`,
              width: `${group.width}px`,
              height: `${group.height}px`,
            }"
            @pointerdown="startSelectionFrameDrag($event, group.nodeIds)"
          >
            <span>分组 · {{ group.nodeIds.length }} 个节点</span>
          </div>

          <div
            v-if="selectionGroupBounds"
            class="selection-group-frame"
            :class="{ grouped: selectionIsSingleGroup }"
            :data-group-id="selectedPersistentGroupId || undefined"
            :style="{
              left: `${selectionGroupBounds.x}px`,
              top: `${selectionGroupBounds.y}px`,
              width: `${selectionGroupBounds.width}px`,
              height: `${selectionGroupBounds.height}px`,
            }"
            @pointerdown="startSelectionFrameDrag($event, selectionGroupBounds.nodeIds)"
          >
            <div
              class="selection-group-toolbar"
              :style="{
                top: `${-46 / viewport.zoom}px`,
                '--group-toolbar-scale': 1 / viewport.zoom,
              }"
              @pointerdown.stop
            >
              <span>已选择 {{ selectionGroupBounds.nodeIds.length }} 个节点</span>
              <button @click.stop="duplicateSelectedNodes">创建副本</button>
              <button :class="{ active: selectionIsSingleGroup }" @click.stop="setSelectedAsGroup">
                {{ selectionIsSingleGroup ? '解除分组' : '设为分组' }}
              </button>
              <button @click.stop="arrangeSelectedNodes">整理</button>
            </div>
            <button
              class="selection-group-port group-input-port"
              aria-label="连接到选区内所有节点"
              title="将上游节点连接到选区内所有节点"
              @click.stop="connectCurrentSourceToGroup"
            ></button>
            <button
              class="selection-group-port group-output-port"
              aria-label="从选区内所有节点开始连接"
              title="将选区内所有节点连接到下游节点"
              @pointerdown="startGroupConnection"
            ></button>
          </div>

          <article
            v-for="node in nodes"
            :key="node.id"
            :ref="observeNodeElement"
            :data-node-id="node.id"
            class="canvas-node"
            :class="[`node-${node.kind}`, { selected: selected.includes(node.id), linking: linkingFrom === node.id, stale: isNodeStale(node), resized: Boolean(node.height), 'has-result': Boolean(node.resultText) && node.kind === 'text', 'image-editing': imageEditNodeId === node.id, 'media-prompt-open': mediaPromptNodeId === node.id, 'group-moving': movingGroupNodeIds.includes(node.id) }]"
            :style="{
              transform: `translate(${node.x}px, ${node.y}px)`,
              width: `${node.width}px`,
              height: node.height ? `${node.height}px` : undefined,
            }"
            @pointerdown="startNodeDrag($event, node)"
            @pointerdown.capture="selectNodeGroupOnPointerDown($event, node)"
          >
            <button class="port input-port" aria-label="连接到此节点" @click.stop="connectTo(node.id)"></button>
            <div class="node-head">
              <span class="node-drag-handle" title="拖动节点" aria-label="拖动节点">⠿</span>
              <span class="kind-icon">{{ toolbarItems.find((x) => x.kind === node.kind)?.icon }}</span>
              <input v-model="node.title" aria-label="节点标题" @input="markNodeChanged(node)" />
              <span
                v-if="node.status"
                class="node-status-dot"
                :class="isNodeStale(node) ? 'stale' : node.status"
                :title="isNodeStale(node) ? '上游输入已更新' : node.status === 'success' ? '生成成功' : node.status === 'running' ? '生成中' : node.status === 'error' ? '生成失败' : '等待生成'"
                aria-hidden="true"
              ></span>
              <button
                v-if="node.kind === 'text'"
                class="node-role-button"
                :class="{ selected: Boolean(roleForNode(node)) }"
                :title="roleForNode(node) ? `当前角色：${roleForNode(node)?.name}` : '选择角色'"
                @click.stop="openRoleManager(node)"
              >
                选择角色
              </button>
              <span v-else-if="node.kind === 'image'" class="node-media-info">
                {{ node.imageWidth || 1024 }} × {{ node.imageHeight || 1024 }}
              </span>
              <span v-else-if="node.kind === 'video'" class="node-media-info">
                {{ videoSizeLabel(node) }}
              </span>
              <div v-else-if="node.kind === 'audio' && node.url && !uploadingAudioNodeIds.includes(node.id)" class="audio-menu-wrap">
                <button
                  class="node-media-play"
                  :class="{ active: audioMenuNodeId === node.id }"
                  title="播放与音频文件操作"
                  @click.stop="audioMenuNodeId = audioMenuNodeId === node.id ? null : node.id"
                >
                  播放
                </button>
                <div
                  v-if="audioMenuNodeId === node.id"
                  class="audio-options-menu"
                  @pointerdown.stop
                  @click.stop
                >
                  <div class="audio-speed-slider-setting">
                    <div><small>播放速度</small><b>{{ node.audioPlaybackRate || 1 }}×</b></div>
                    <input
                      type="range"
                      min="0"
                      :max="AUDIO_SPEED_OPTIONS.length - 1"
                      step="1"
                      :value="audioSpeedIndex(node.audioPlaybackRate)"
                      @input="setAudioPlaybackRateFromSlider($event, node)"
                    />
                    <div class="audio-speed-ticks">
                      <span v-for="speed in AUDIO_SPEED_OPTIONS" :key="speed">{{ speed }}</span>
                    </div>
                  </div>
                  <button :disabled="!node.url" @click="restartAudio($event, node)">↺ 从头播放</button>
                  <button :disabled="!node.url" @click="downloadAudio(node)">⇩ 下载音频</button>
                </div>
              </div>
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
                v-else-if="node.kind === 'video'"
                class="more image-settings-button"
                :class="{ active: videoSettingsNodeId === node.id }"
                title="视频设置"
                @click.stop="toggleVideoSettings(node)"
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
              <button
                v-else-if="node.kind === 'audio'"
                class="more image-settings-button"
                :class="{ active: audioSettingsNodeId === node.id }"
                title="音频生成设置"
                @click.stop="toggleAudioSettings(node)"
              >
                ⚙
              </button>
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
              v-if="node.kind === 'video' && videoSettingsNodeId === node.id"
              class="image-node-settings video-node-settings"
              @pointerdown.stop
            >
              <div class="ratio-title"><b>画面比例</b><span>{{ videoAspectLabel(node) }}</span></div>
              <div class="ratio-presets video-ratio-presets">
                <button :class="{ selected: node.videoAutoSize ?? true }" @click="setVideoAuto(node)">自动</button>
                <button :class="{ selected: !(node.videoAutoSize ?? true) && node.videoAspectWidth === 16 && node.videoAspectHeight === 9 }" @click="setVideoRatio(node, 16, 9)">16:9</button>
                <button :class="{ selected: !(node.videoAutoSize ?? true) && node.videoAspectWidth === 9 && node.videoAspectHeight === 16 }" @click="setVideoRatio(node, 9, 16)">9:16</button>
                <button :class="{ selected: !(node.videoAutoSize ?? true) && node.videoAspectWidth === 1 && node.videoAspectHeight === 1 }" @click="setVideoRatio(node, 1, 1)">1:1</button>
                <button :class="{ selected: !(node.videoAutoSize ?? true) && node.videoAspectWidth === 4 && node.videoAspectHeight === 3 }" @click="setVideoRatio(node, 4, 3)">4:3</button>
                <button :class="{ selected: !(node.videoAutoSize ?? true) && node.videoAspectWidth === 3 && node.videoAspectHeight === 4 }" @click="setVideoRatio(node, 3, 4)">3:4</button>
              </div>
              <div class="dimension-inputs video-aspect-inputs">
                <label>比例 W <input v-model.number="node.videoAspectWidth" type="number" min="1" max="100" @change="node.videoAutoSize = false; normalizeVideoSettings(node)" /></label>
                <span>:</span>
                <label>比例 H <input v-model.number="node.videoAspectHeight" type="number" min="1" max="100" @change="node.videoAutoSize = false; normalizeVideoSettings(node)" /></label>
              </div>
              <label class="video-duration-setting">
                <span>视频时长</span>
                <input v-model.number="node.videoDuration" type="range" min="1" max="15" step="1" @input="normalizeVideoSettings(node)" />
                <b>{{ normalizedVideoDuration(node) }}s</b>
              </label>
              <div class="video-resolution-setting">
                <span>分辨率</span>
                <div>
                  <button :class="{ selected: (node.videoResolution || 720) === 720 }" @click="node.videoResolution = 720; normalizeVideoSettings(node)">720p</button>
                  <button :class="{ selected: node.videoResolution === 480 }" @click="node.videoResolution = 480; normalizeVideoSettings(node)">480p</button>
                  <button :class="{ selected: node.videoResolution === 1080 }" @click="node.videoResolution = 1080; normalizeVideoSettings(node)">1080p</button>
                  <button :class="{ selected: node.videoResolution === 2160 }" @click="node.videoResolution = 2160; normalizeVideoSettings(node)">4K</button>
                </div>
              </div>
              <small>当前输出尺寸：{{ videoSizeLabel(node) }}，生成时会发送给视频模型。</small>
            </div>

            <div
              v-if="node.kind === 'audio' && audioSettingsNodeId === node.id"
              class="image-node-settings audio-node-settings"
              @pointerdown.stop
            >
              <label class="audio-generation-setting">
                <span>声音</span>
                <CustomSelect v-model="node.audioVoice" aria-label="声音" :options="audioVoiceOptions" />
              </label>
              <label class="audio-generation-setting">
                <span>输出格式</span>
                <CustomSelect v-model="node.audioFormat" aria-label="输出格式" :options="audioFormatOptions" />
              </label>
              <div class="audio-generation-speed">
                <div><span>语速</span><b>{{ node.audioGenerationSpeed || 1 }}×</b></div>
                <input
                  type="range"
                  min="0"
                  :max="AUDIO_SPEED_OPTIONS.length - 1"
                  step="1"
                  :value="audioSpeedIndex(node.audioGenerationSpeed)"
                  @input="setAudioGenerationSpeedFromSlider($event, node)"
                />
                <div class="audio-speed-ticks">
                  <span v-for="speed in AUDIO_SPEED_OPTIONS" :key="speed">{{ speed }}</span>
                </div>
              </div>
              <label class="audio-generation-instructions">
                <span>生成指令</span>
                <input
                  v-model="node.audioInstructions"
                  type="text"
                  placeholder="自然"
                  maxlength="1000"
                  @change="markNodeChanged(node)"
                />
              </label>
              <small>声音、格式、语速和生成指令会随请求发送；实际支持范围取决于当前音频服务。</small>
            </div>

            <div
              v-if="node.kind === 'image'"
              class="media-preview image-preview editable"
              :style="{ aspectRatio: imageAspect(node) }"
              title="单击打开图片生成输入"
              @click.stop="openMediaPrompt(node)"
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
            <div
              v-else-if="node.kind === 'video'"
              class="media-preview video-preview editable"
              title="单击打开视频生成输入"
              @click.stop="openMediaPrompt(node)"
            >
              <video
                v-if="node.url"
                :src="node.url"
                controls
                @loadedmetadata="syncVideoMetadata($event, node)"
              ></video>
              <div v-else class="video-placeholder"><button>▶</button><span>准备生成动态画面</span></div>
            </div>
            <div
              v-else-if="node.kind === 'audio'"
              class="audio-preview editable"
              :class="{ empty: !node.url || uploadingAudioNodeIds.includes(node.id) }"
              :title="node.url && !uploadingAudioNodeIds.includes(node.id) ? '单击打开音频生成输入' : '上传文件或开始录音'"
              @click.stop="node.url && !uploadingAudioNodeIds.includes(node.id) && openMediaPrompt(node)"
            >
              <template v-if="node.url && !uploadingAudioNodeIds.includes(node.id)">
                <audio
                :src="node.url"
                preload="metadata"
                @loadedmetadata="syncAudioMetadata($event, node)"
                @durationchange="syncAudioMetadata($event, node)"
                @timeupdate="syncAudioProgress($event, node)"
                @play="audioState(node).playing = true"
                @pause="audioState(node).playing = false"
                @ended="audioState(node).playing = false"
                ></audio>
              <div class="audio-primary-controls">
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
                <button
                  v-if="node.audioRecorded"
                  class="audio-rerecord-button"
                  @click.stop="toggleAudioRecording(node)"
                >
                  {{ recordingAudioNodeId === node.id ? '停止录音' : '重新录制' }}
                </button>
              </div>
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
                @pointerleave="audioVolumeNodeId = null"
                @pointerdown.stop
              >
                <button
                  class="audio-volume-button"
                  title="声音"
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
              </template>
              <div v-else class="empty-audio-actions" @pointerdown.stop>
                <button
                  class="empty-audio-action"
                  :disabled="uploadingAudioNodeIds.includes(node.id)"
                  @pointerup.stop="openFileSourceChoice('replace', node)"
                >
                  <span>＋</span>上传文件
                  <small>本地文件或资产库</small>
                </button>
                <button
                  class="empty-audio-action record"
                  :class="{
                    recording: recordingAudioNodeId === node.id,
                    uploading: uploadingAudioNodeIds.includes(node.id),
                  }"
                  :disabled="uploadingAudioNodeIds.includes(node.id)"
                  @pointerup.stop="toggleAudioRecording(node)"
                >
                  <span>{{ uploadingAudioNodeIds.includes(node.id) ? '↥' : recordingAudioNodeId === node.id ? '■' : '●' }}</span>
                  {{ uploadingAudioNodeIds.includes(node.id) ? '上传中' : recordingAudioNodeId === node.id ? '停止录音' : '录音' }}
                  <small>{{ uploadingAudioNodeIds.includes(node.id) ? '正在保存录音文件' : recordingAudioNodeId === node.id ? '点击结束并保存' : '使用麦克风录制' }}</small>
                </button>
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
              v-if="['image', 'video', 'audio'].includes(node.kind) && mediaPromptNodeId === node.id"
              class="media-generation-panel"
              @pointerdown.stop
              @wheel.stop
              @dblclick.stop
            >
              <header>
                <div>
                  <b>{{ serviceKindLabel(nodeServiceKind(node)) }}生成提示词</b>
                  <small>输入内容将作为当前节点新的生成提示词</small>
                </div>
                <div class="media-prompt-tools">
                  <button
                    title="保存当前提示词"
                    aria-label="保存当前提示词"
                    :disabled="!node.content.trim()"
                    @click.stop="saveCurrentPrompt(node)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6.5 4.5h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4v-15a1 1 0 0 1 1-1Z"></path>
                    </svg>
                  </button>
                  <button
                    title="我的提示词"
                    aria-label="我的提示词"
                    @click.stop="openPromptLibrary(node)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3.5 7.5h6l2-2h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"></path>
                    </svg>
                  </button>
                </div>
              </header>
              <NodePromptEditor
                v-model="node.content"
                :placeholder="`输入用于生成${serviceKindLabel(nodeServiceKind(node))}的提示词，可使用 @ 引用已连接资源`"
                :upstream="upstreamFor(node.id)"
                @change="markNodeChanged(node)"
              />
              <footer class="media-generation-footer">
                <span class="node-input-count">{{ activeInputCount(node.id) }} 个输入</span>
                <button class="node-add-file-button" @click.stop="openFileSourceChoice('upstream', node)">
                  <b>＋</b>
                  <span>添加</span>
                </button>
                <button
                  class="node-role-button media-role-button"
                  :class="{ selected: Boolean(roleForNode(node)) }"
                  :title="roleForNode(node) ? `当前角色：${roleForNode(node)?.name}` : '选择角色'"
                  @click.stop="openRoleManager(node)"
                >
                  选择角色
                </button>
                <div class="generation-controls">
                  <CustomSelect
                    class="node-model-select"
                    :model-value="serviceForNode(node).id"
                    :aria-label="`选择${serviceKindLabel(nodeServiceKind(node))}模型`"
                    :options="channelsFor(nodeServiceKind(node)).map((channel) => ({ value: channel.id, label: modelChannelLabel(channel) }))"
                    @update:model-value="setNodeModelChannel(node, $event)"
                  />
                  <button
                    class="run-button generation-action"
                    :class="{ running: node.status === 'running' || imageVariationRunningIds.includes(node.id) }"
                    @click.stop="handleGenerationAction(node)"
                  >
                    <span class="generation-sparkle" aria-hidden="true">✦</span>
                    <span>{{ node.status === 'running' || imageVariationRunningIds.includes(node.id) ? '生成中…' : '生成' }}</span>
                  </button>
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

            <div v-if="node.kind === 'text' || node.kind === 'config'" class="node-foot">
              <span class="node-input-count">{{ activeInputCount(node.id) }} 个输入</span>
              <button class="node-add-file-button" @click.stop="openFileSourceChoice('upstream', node)">
                <b>＋</b>
                <span>添加</span>
              </button>
              <button
                v-if="node.kind === 'text'"
                class="text-expand-editor-button"
                title="在弹窗中放大编辑提示词"
                @click.stop="openExpandedTextEditor(node)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"></path>
                </svg>
                放大编辑
              </button>
              <div v-if="node.kind !== 'config'" class="generation-controls">
                <CustomSelect
                  class="node-model-select"
                  :model-value="serviceForNode(node).id"
                  :aria-label="`选择${serviceOptions.find((item) => item.kind === nodeServiceKind(node))?.label}模型`"
                  @pointerdown.stop
                  @click.stop
                  :options="channelsFor(nodeServiceKind(node)).map((channel) => ({ value: channel.id, label: modelChannelLabel(channel) }))"
                  @update:model-value="setNodeModelChannel(node, $event)"
                />
                <button
                  class="run-button generation-action"
                  :class="{ running: node.status === 'running' }"
                  @click.stop="handleGenerationAction(node)"
                >
                  <span class="generation-sparkle" aria-hidden="true">✦</span>
                  <span>{{ node.status === 'running' ? '生成中…' : '生成' }}</span>
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
          <template v-if="selectedNode.kind === 'text'">
            <div class="text-prompt-save-wrap selection-prompt-save">
              <button
                :class="{ active: textPromptSaveNodeId === selectedNode.id }"
                :disabled="!selectedNode.content.trim() && !selectedNode.resultText?.trim()"
                @click.stop="toggleTextPromptSaveMenu(selectedNode)"
              >保存提示词</button>
              <div
                v-if="textPromptSaveNodeId === selectedNode.id"
                class="text-prompt-save-menu"
                @click.stop
                @pointerdown.stop
              >
                <button :disabled="!selectedNode.content.trim()" @click="saveTextPromptVersion(selectedNode, 'before')">
                  <b>生成前</b><span>保存输入区内容</span>
                </button>
                <button :disabled="!selectedNode.resultText?.trim()" @click="saveTextPromptVersion(selectedNode, 'after')">
                  <b>生成后</b><span>保存 AI 生成结果</span>
                </button>
              </div>
            </div>
            <button @click.stop="openPromptLibrary(selectedNode)">我的提示词</button>
          </template>
          <template v-else-if="selectedNode.kind === 'image'">
            <template v-if="selectedNode.url">
              <button @click.stop="zoomedImage = selectedNode">查看大图</button>
              <button @click.stop="openImageUpscale(selectedNode)">放大分辨率</button>
              <button @click.stop="downloadImage(selectedNode)">下载</button>
              <button @click.stop="saveNodeAsAsset(selectedNode)">存资产</button>
            </template>
            <button @click.stop="openFileSourceChoice('replace', selectedNode)">替换图片</button>
            <button v-if="selectedNode.url" class="accent" @click.stop="reversePrompt(selectedNode)">反推提示词</button>
          </template>
          <template v-else-if="selectedNode.kind === 'video' || selectedNode.kind === 'audio'">
            <button @click.stop="saveNodeAsAsset(selectedNode)">存资产</button>
            <button @click.stop="openFileSourceChoice('replace', selectedNode)">替换文件</button>
          </template>
          <button v-if="selectedNode.kind === 'config'" @click.stop="connectTo(selectedNode.id)">连接</button>
          <button class="danger" @click="deleteSelected">删除</button>
        </div>
        <div v-else-if="selectedEdgeData" class="edge-inspector" @pointerdown.stop>
          <div>
            <b>{{ edgeEndpointLabel(selectedEdgeData, 'source') }} → {{ edgeEndpointLabel(selectedEdgeData, 'target') }}</b>
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
          <button class="arrange-view-button" title="自动整理卡片" aria-label="自动整理卡片" @click="autoArrangeNodes">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="6" height="5" rx="1"></rect><rect x="15" y="3" width="6" height="5" rx="1"></rect><rect x="15" y="16" width="6" height="5" rx="1"></rect><path d="M9 7.5h3a3 3 0 0 1 3 3v8M12 10.5h3"></path></svg>
          </button>
          <button class="danger" title="清空画布" @click="clearCanvas">⌫</button>
        </div>
      </section>
    </main>

    <Transition name="fade">
      <div v-if="showFileSourceChoice" class="modal-backdrop file-source-backdrop" @mousedown.self="showFileSourceChoice = false">
        <section class="file-source-modal" @mousedown.stop>
          <header>
            <div><h2>选择文件来源</h2><p>从电脑上传，或使用资产库中已保存的文件</p></div>
            <button aria-label="关闭" @click="showFileSourceChoice = false">×</button>
          </header>
          <div class="file-source-options">
            <button @click="chooseLocalFileSource">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"></path><path d="M5 13v6h14v-6"></path></svg>
              <b>本地文件</b><span>从电脑选择文件</span>
            </button>
            <button @click="chooseAssetLibrarySource">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2-2h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"></path><path d="m6 16 4-4 3 3 2-2 3 3"></path></svg>
              <b>资产库</b><span>选择已保存的媒体资产</span>
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div
        v-if="expandedTextEditorNode"
        class="modal-backdrop text-expanded-editor-backdrop"
        @mousedown.self="closeExpandedTextEditor"
      >
        <section class="text-expanded-editor-modal" role="dialog" aria-modal="true" aria-labelledby="text-expanded-editor-title" @mousedown.stop>
          <header>
            <div>
              <h2 id="text-expanded-editor-title">编辑提示词</h2>
              <p>{{ expandedTextEditorNode.title }} · 与节点输入区实时同步</p>
            </div>
            <button class="close" aria-label="关闭放大编辑" @click="closeExpandedTextEditor">×</button>
          </header>
          <div class="text-expanded-editor-body" @wheel.stop>
            <NodePromptEditor
              v-model="expandedTextEditorNode.content"
              :placeholder="nodePlaceholder(expandedTextEditorNode)"
              :upstream="upstreamFor(expandedTextEditorNode.id)"
              @change="markNodeChanged(expandedTextEditorNode)"
            />
          </div>
          <footer>
            <span>弹窗与节点使用同一份内容，关闭后不会丢失修改。</span>
            <button @click="closeExpandedTextEditor">完成</button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="imageUpscaleNode" class="modal-backdrop image-upscale-backdrop" @mousedown.self="closeImageUpscale">
        <section class="image-upscale-modal" role="dialog" aria-modal="true" aria-labelledby="image-upscale-title" @mousedown.stop>
          <header>
            <div>
              <h2 id="image-upscale-title">放大图片分辨率</h2>
              <p>{{ imageUpscaleNode.title }}</p>
            </div>
            <button class="close" :disabled="imageUpscaleDraft.running" aria-label="关闭图片放大" @click="closeImageUpscale">×</button>
          </header>
          <div class="image-upscale-body">
            <div class="image-upscale-preview">
              <img v-if="imageUpscaleNode.url" :src="imageUpscaleNode.url" :alt="imageUpscaleNode.title" />
              <div>
                <span>原图</span>
                <b v-if="!imageUpscaleDraft.loading">{{ imageUpscaleDraft.sourceWidth }} × {{ imageUpscaleDraft.sourceHeight }}</b>
                <b v-else>读取中…</b>
              </div>
              <i>→</i>
              <div>
                <span>输出</span>
                <b>{{ imageUpscaleOutputSize.width }} × {{ imageUpscaleOutputSize.height }}</b>
              </div>
            </div>

            <section>
              <h3>目标分辨率</h3>
              <div class="image-upscale-targets">
                <button
                  v-for="target in IMAGE_UPSCALE_TARGETS"
                  :key="target"
                  :class="{ active: imageUpscaleDraft.targetLongEdge === target }"
                  :disabled="target <= Math.max(imageUpscaleDraft.sourceWidth, imageUpscaleDraft.sourceHeight)"
                  @click="imageUpscaleDraft.targetLongEdge = target"
                >
                  {{ target / 1024 }}K
                  <small>最长边 {{ target }} px</small>
                </button>
              </div>
            </section>

            <section>
              <h3>插值方式</h3>
              <div class="image-upscale-algorithms">
                <button :class="{ active: imageUpscaleDraft.algorithm === 'high' }" @click="imageUpscaleDraft.algorithm = 'high'">
                  <b>高清插值</b><span>分阶段放大，适合照片与生成图</span>
                </button>
                <button :class="{ active: imageUpscaleDraft.algorithm === 'bilinear' }" @click="imageUpscaleDraft.algorithm = 'bilinear'">
                  <b>双线性</b><span>平滑缩放，速度更快</span>
                </button>
                <button :class="{ active: imageUpscaleDraft.algorithm === 'nearest' }" @click="imageUpscaleDraft.algorithm = 'nearest'">
                  <b>最近邻</b><span>保留硬边，适合像素图</span>
                </button>
              </div>
            </section>
            <p v-if="Math.max(imageUpscaleDraft.sourceWidth, imageUpscaleDraft.sourceHeight) >= 4096" class="image-upscale-warning">
              原图最长边已达到 4096 px，当前本地放大上限为 4K。
            </p>
          </div>
          <footer>
            <span>本次操作全部在浏览器本地处理，不读取上游节点，不需要API Key</span>
            <button class="ghost" :disabled="imageUpscaleDraft.running" @click="closeImageUpscale">取消</button>
            <button
              class="primary"
              :disabled="imageUpscaleDraft.loading || imageUpscaleDraft.running || imageUpscaleDraft.targetLongEdge <= Math.max(imageUpscaleDraft.sourceWidth, imageUpscaleDraft.sourceHeight)"
              @click="createUpscaledImageNode"
            >
              {{ imageUpscaleDraft.running ? '放大中…' : '生成放大图' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>

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
      <div v-if="roleManagerNode" class="modal-backdrop role-manager-backdrop" @mousedown.self="closeRoleManager">
        <section class="role-manager-modal" @mousedown.stop>
          <header>
            <div>
              <h2>角色管理</h2>
              <p>为“{{ roleManagerNode.title }}”选择生成时使用的角色</p>
            </div>
            <button
              class="role-create-button"
              :disabled="canvasRoles.length >= MAX_CANVAS_ROLES"
              @click="startCreateRole"
            >
              ＋ 创建角色
            </button>
            <button class="close" aria-label="关闭角色管理" @click="closeRoleManager">×</button>
          </header>

          <div class="role-manager-body">
            <div class="role-count">已创建 {{ canvasRoles.length }}/{{ MAX_CANVAS_ROLES }}</div>
            <form v-if="showCreateRole" class="role-create-form" @submit.prevent="saveCreatedRole">
              <label>
                角色名称
                <input
                  v-model="roleDraft.name"
                  maxlength="60"
                  placeholder="例如：顶尖商业视觉艺术总监"
                  autofocus
                />
              </label>
              <label>
                系统提示词
                <textarea
                  v-model="roleDraft.systemPrompt"
                  maxlength="12000"
                  placeholder="在此输入系统提示词，例如：你是一位..."
                ></textarea>
              </label>
              <div class="role-form-actions">
                <button type="button" class="ghost" @click="showCreateRole = false">取消</button>
                <button type="submit" class="primary">保存角色</button>
              </div>
            </form>

            <div v-if="canvasRoles.length" class="role-list">
              <article
                v-for="role in canvasRoles"
                :key="role.id"
                class="role-list-item"
                :class="{ selected: roleManagerNode.roleId === role.id }"
              >
                <div>
                  <b>{{ role.name }}</b>
                  <p>{{ role.systemPrompt }}</p>
                </div>
                <span v-if="roleManagerNode.roleId === role.id">当前角色</span>
                <button v-else @click="selectRoleForCurrentNode(role)">选择</button>
                <button
                  class="role-delete-button"
                  :aria-label="`删除角色 ${role.name}`"
                  title="删除角色"
                  @click="deleteCanvasRole(role)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V4.5h6V7M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path>
                  </svg>
                </button>
              </article>
            </div>
            <div v-else-if="!showCreateRole" class="role-empty">
              <b>还没有角色</b>
              <p>点击右上角“创建角色”，保存后即可在这里选择。</p>
            </div>
          </div>

          <footer>
            <button
              v-if="roleManagerNode.roleId"
              class="role-clear-button"
              @click="clearRoleForCurrentNode"
            >
              不使用角色
            </button>
            <button class="ghost" @click="closeRoleManager">关闭</button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div
        v-if="promptLibraryNode"
        class="modal-backdrop role-manager-backdrop"
        @mousedown.self="closePromptLibrary"
      >
        <section class="role-manager-modal prompt-library-modal" :class="{ 'library-view': promptManagerView === 'library' }" @mousedown.stop>
          <header>
            <div>
              <h2>{{ promptManagerView === 'mine' ? '我的提示词' : '提示词库' }}</h2>
              <p>{{ promptManagerView === 'mine' ? '管理本地保存的提示词' : '搜索公开提示词，点击卡片写入当前节点' }} · {{ promptLibraryNode.title }}</p>
            </div>
            <button
              v-if="promptManagerView === 'mine'"
              class="role-create-button"
              :disabled="savedPrompts.length >= MAX_SAVED_PROMPTS"
              @click="startCreatePrompt"
            >
              ＋ 添加提示词
            </button>
            <button
              class="role-create-button prompt-library-switch"
              @click="promptManagerView === 'mine' ? openPublicPromptLibrary() : returnToMyPrompts()"
            >
              {{ promptManagerView === 'mine' ? '提示词库' : '我的提示词' }}
            </button>
            <button class="close" aria-label="关闭我的提示词" @click="closePromptLibrary">×</button>
          </header>

          <div class="role-manager-body">
            <template v-if="promptManagerView === 'mine'">
            <div class="role-count">已保存 {{ savedPrompts.length }}/{{ MAX_SAVED_PROMPTS }}</div>
            <form v-if="showCreatePrompt" class="role-create-form prompt-create-form" @submit.prevent="saveCreatedPrompt">
              <label>
                类型标签
                <CustomSelect v-model="promptCreateDraft.kind" aria-label="类型标签" :options="promptKindOptions" />
              </label>
              <label>
                提示词内容
                <textarea
                  v-model="promptCreateDraft.text"
                  maxlength="32000"
                  placeholder="在此输入要保存的提示词"
                  autofocus
                ></textarea>
              </label>
              <div class="role-form-actions">
                <button type="button" class="ghost" @click="cancelCreatePrompt">取消</button>
                <button type="submit" class="primary">保存提示词</button>
              </div>
            </form>
            <div v-if="savedPrompts.length" class="role-list prompt-list">
              <article
                v-for="prompt in savedPrompts"
                :key="prompt.id"
                class="role-list-item prompt-list-item"
                tabindex="0"
                title="点击使用这条提示词"
                @click="editingPromptId !== prompt.id && selectSavedPrompt(prompt)"
                @keydown.enter.prevent="editingPromptId !== prompt.id && selectSavedPrompt(prompt)"
              >
                <template v-if="editingPromptId === prompt.id">
                  <div class="prompt-edit-form" @click.stop @keydown.stop>
                    <CustomSelect v-model="promptEditDraft.kind" aria-label="提示词类型" :options="promptKindOptions" />
                    <textarea v-model="promptEditDraft.text" maxlength="32000" aria-label="修改提示词"></textarea>
                    <div>
                      <button @click="cancelEditSavedPrompt">取消</button>
                      <button class="primary" @click="saveEditedPrompt(prompt)">保存修改</button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div>
                    <span class="prompt-kind-tag" :class="`kind-${prompt.kind}`">
                      {{ serviceKindLabel(prompt.kind) }}
                    </span>
                    <p>{{ prompt.text }}</p>
                  </div>
                  <button title="修改提示词" @click.stop="startEditSavedPrompt(prompt)">修改</button>
                  <button
                    class="role-delete-button"
                    aria-label="删除提示词"
                    title="删除提示词"
                    @click.stop="deleteSavedPrompt(prompt)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 7h14M9 7V4.5h6V7M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path>
                    </svg>
                  </button>
                </template>
              </article>
            </div>
            <div v-else-if="!showCreatePrompt" class="role-empty">
              <b>还没有保存的提示词</b>
              <p>在媒体输入区填写内容后，点击右上角“保存当前提示词”。</p>
            </div>
            </template>
            <template v-else>
              <div class="public-prompt-toolbar">
                <label class="public-prompt-search">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>
                  <input
                    v-model="publicPromptQuery"
                    placeholder="搜索标题、提示词、作者或标签"
                    @input="publicPromptVisibleLimit = 36"
                  />
                </label>
                <CustomSelect
                  v-model="publicPromptSourceId"
                  aria-label="提示词来源"
                  :options="publicPromptSourceOptions"
                  @change="publicPromptCategory = 'all'; publicPromptVisibleLimit = 36; publicPromptCategoriesExpanded = false"
                />
                <button title="重新加载提示词库" @click="loadPublicPromptLibrary(true)">↻</button>
              </div>
              <div class="public-prompt-category-wrap">
                <div class="public-prompt-categories" :class="{ expanded: publicPromptCategoriesExpanded }">
                  <button :class="{ active: publicPromptCategory === 'all' }" @click="publicPromptCategory = 'all'; publicPromptVisibleLimit = 36">全部</button>
                  <button
                    v-for="category in publicPromptCategories"
                    :key="category.name"
                    :class="{ active: publicPromptCategory === category.name }"
                    @click="publicPromptCategory = category.name; publicPromptVisibleLimit = 36"
                  >
                    {{ category.name }} <span>{{ category.count }}</span>
                  </button>
                </div>
                <button
                  v-if="publicPromptCategories.length > 6"
                  class="public-prompt-category-toggle"
                  :class="{ expanded: publicPromptCategoriesExpanded }"
                  :aria-expanded="publicPromptCategoriesExpanded"
                  :title="publicPromptCategoriesExpanded ? '收起标签' : '展开全部标签'"
                  @click="publicPromptCategoriesExpanded = !publicPromptCategoriesExpanded"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
              </div>
              <div v-if="publicPromptError" class="public-prompt-notice">{{ publicPromptError }}</div>
              <div v-if="publicPromptLoading && !publicPrompts.length" class="public-prompt-loading">
                <i></i><span>正在加载提示词库…</span>
              </div>
              <div v-else-if="visiblePublicPrompts.length" class="public-prompt-grid">
                <article
                  v-for="prompt in visiblePublicPrompts"
                  :key="`${prompt.sourceId}:${prompt.id}`"
                  class="public-prompt-card"
                  tabindex="0"
                  @click="selectPublicPrompt(prompt)"
                  @keydown.enter.prevent="selectPublicPrompt(prompt)"
                >
                  <div class="public-prompt-cover">
                    <img v-if="prompt.coverUrl" :src="prompt.coverUrl" alt="" loading="lazy" referrerpolicy="no-referrer" />
                    <span v-else>Prompt</span>
                    <i>{{ prompt.imageMode === 'edit' ? '图像编辑' : '图像生成' }}</i>
                    <button
                      class="public-prompt-view"
                      type="button"
                      title="查看提示词和参考图片详情"
                      aria-label="查看提示词详情"
                      @click.stop="openPublicPromptDetail(prompt)"
                      @keydown.enter.stop.prevent="openPublicPromptDetail(prompt)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg>
                    </button>
                  </div>
                  <div class="public-prompt-card-body">
                    <b>{{ prompt.title }}</b>
                    <p>{{ prompt.description || prompt.prompt }}</p>
                    <div class="public-prompt-tags">
                      <span v-for="tag in prompt.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
                    </div>
                    <small>{{ publicPromptSources.find((source) => source.id === prompt.sourceId)?.name || prompt.sourceId }}<template v-if="prompt.author"> · {{ prompt.author }}</template></small>
                  </div>
                </article>
              </div>
              <div v-else-if="!publicPromptLoading" class="role-empty public-prompt-empty">
                <b>没有匹配的提示词</b>
                <p>尝试更换关键词、来源或分类。</p>
              </div>
              <button
                v-if="filteredPublicPrompts.length > publicPromptVisibleLimit"
                class="public-prompt-more"
                @click="publicPromptVisibleLimit += 36"
              >
                加载更多（{{ visiblePublicPrompts.length }}/{{ filteredPublicPrompts.length }}）
              </button>
            </template>
          </div>

          <footer>
            <button class="ghost" @click="closePromptLibrary">关闭</button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div
        v-if="publicPromptDetail"
        class="modal-backdrop public-prompt-detail-backdrop"
        @mousedown.self="publicPromptDetail = null"
      >
        <section class="public-prompt-detail-modal" @mousedown.stop>
          <header>
            <div>
              <h2>{{ publicPromptDetail.title }}</h2>
              <p>{{ publicPromptSources.find((source) => source.id === publicPromptDetail?.sourceId)?.name || publicPromptDetail.sourceId }}<template v-if="publicPromptDetail.author"> · {{ publicPromptDetail.author }}</template></p>
            </div>
            <button class="close" aria-label="关闭详情" @click="publicPromptDetail = null">×</button>
          </header>
          <div class="public-prompt-detail-body">
            <section v-if="publicPromptImages(publicPromptDetail).length" class="public-prompt-detail-images">
              <h3>参考图片</h3>
              <div>
                <a
                  v-for="(imageUrl, index) in publicPromptImages(publicPromptDetail)"
                  :key="imageUrl"
                  :href="imageUrl"
                  target="_blank"
                  rel="noreferrer"
                  :title="`打开参考图片 ${index + 1}`"
                >
                  <img :src="imageUrl" :alt="`${publicPromptDetail.title} · 参考图片 ${index + 1}`" referrerpolicy="no-referrer" />
                </a>
              </div>
            </section>
            <section class="public-prompt-detail-copy">
              <h3>提示词</h3>
              <p>{{ publicPromptDetail.prompt }}</p>
              <template v-if="publicPromptDetail.description">
                <h3>说明</h3>
                <p>{{ publicPromptDetail.description }}</p>
              </template>
              <template v-if="publicPromptDetail.promptHint">
                <h3>输入提示</h3>
                <p>{{ publicPromptDetail.promptHint }}</p>
              </template>
              <div
                v-if="publicPromptDetail.imageModel || publicPromptDetail.createdAt || publicPromptDetail.updatedAt || publicPromptDetail.community || publicPromptDetail.usageCount !== null || publicPromptDetail.viewCount !== null || publicPromptDetail.voteCount !== null"
                class="public-prompt-detail-meta"
              >
                <span v-if="publicPromptDetail.imageModel">模型 · {{ publicPromptDetail.imageModel }}</span>
                <span v-if="publicPromptDetail.createdAt">日期 · {{ publicPromptDetail.createdAt }}</span>
                <span v-if="publicPromptDetail.updatedAt">更新 · {{ publicPromptDetail.updatedAt }}</span>
                <span v-if="publicPromptDetail.community">分类来源 · {{ publicPromptDetail.community }}</span>
                <span v-if="publicPromptDetail.usageCount !== null">使用 · {{ publicPromptDetail.usageCount.toLocaleString() }}</span>
                <span v-if="publicPromptDetail.viewCount !== null">浏览 · {{ publicPromptDetail.viewCount.toLocaleString() }}</span>
                <span v-if="publicPromptDetail.voteCount !== null">投票 · {{ publicPromptDetail.voteCount.toLocaleString() }}</span>
              </div>
              <div v-if="publicPromptDetail.tags.length" class="public-prompt-tags public-prompt-detail-tags">
                <span v-for="tag in publicPromptDetail.tags" :key="tag">{{ tag }}</span>
              </div>
            </section>
          </div>
          <footer>
            <a v-if="publicPromptDetail.authorUrl" :href="publicPromptDetail.authorUrl" target="_blank" rel="noreferrer">作者主页</a>
            <a v-if="publicPromptDetail.sourceUrl" :href="publicPromptDetail.sourceUrl" target="_blank" rel="noreferrer">查看来源</a>
            <button class="ghost" @click="publicPromptDetail = null">关闭</button>
            <button @click="selectPublicPrompt(publicPromptDetail)">使用此提示词</button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div
        v-if="showShortcutHelp"
        class="modal-backdrop shortcut-help-backdrop"
        @mousedown.self="showShortcutHelp = false"
      >
        <section class="shortcut-help-modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title" @mousedown.stop>
          <header>
            <div>
              <h2 id="shortcut-help-title">快捷键</h2>
              <p>画布中当前可用的键盘操作</p>
            </div>
            <button class="close" aria-label="关闭快捷键" @click="showShortcutHelp = false">×</button>
          </header>
          <div class="shortcut-help-content">
            <section v-for="group in shortcutGroups" :key="group.title" class="shortcut-group">
              <h3>{{ group.title }}</h3>
              <div v-for="item in group.items" :key="`${group.title}-${item.label}`" class="shortcut-row">
                <span>{{ item.label }}</span>
                <div class="shortcut-keys">
                  <kbd v-for="keyName in item.keys" :key="keyName">{{ keyName }}</kbd>
                </div>
              </div>
            </section>
          </div>
          <footer><button @click="showShortcutHelp = false">知道了</button></footer>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div
        v-if="scriptEditorKind && scriptEditorChannel"
        class="modal-backdrop model-script-backdrop"
        @mousedown.self="closeModelScriptEditor"
      >
        <section class="model-script-modal" role="dialog" aria-modal="true" aria-labelledby="model-script-title" @mousedown.stop>
          <header>
            <div>
              <h2 id="model-script-title">{{ serviceKindLabel(scriptEditorKind) }}调用脚本 · {{ scriptEditorChannel.name }}</h2>
              <p>{{ scriptEditorChannel.model }} · 脚本为空时使用系统默认调用方式</p>
            </div>
            <button class="close" aria-label="关闭调用脚本" @click="closeModelScriptEditor">×</button>
          </header>
          <div class="model-script-body">
            <aside>
              <section>
                <h3>返回要求</h3>
                <p>{{ scriptReturnRequirement(scriptEditorKind) }}</p>
              </section>
              <section>
                <h3>可用变量</h3>
                <button
                  v-for="variable in scriptVariables"
                  :key="variable[0]"
                  type="button"
                  @click="scriptDraft += `${scriptDraft ? '\n' : ''}${variable[0]}`"
                >
                  <span><code>{{ variable[0] }}</code><small>{{ variable[1] }}</small></span>
                  <p>{{ variable[2] }}</p>
                </button>
              </section>
            </aside>
            <div class="model-script-editor">
              <CodeEditor
                v-model="scriptDraft"
                placeholder="在此输入 JavaScript 异步函数体，最后必须 return 结果…"
              />
            </div>
          </div>
          <footer>
            <div>
              <button @click="scriptDraft = defaultScriptTemplate(scriptEditorKind)">插入 OpenAI 模板</button>
              <button class="danger-link" @click="scriptDraft = ''">恢复默认调用</button>
            </div>
            <span>脚本仅保存在当前浏览器，并在所选模型发起生成时执行。</span>
            <button class="ghost" @click="closeModelScriptEditor">取消</button>
            <button class="primary" @click="saveModelScript">保存脚本</button>
          </footer>
        </section>
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
                <label v-if="activeServiceKind === 'text'">推理强度
                  <CustomSelect
                    v-model="activeService.reasoningEffort"
                    aria-label="文本模型推理强度"
                    :options="reasoningEffortOptions"
                  />
                  <small class="setting-field-hint">“自动”不发送推理强度；低、中、高、极高会作为独立参数传给支持推理的文本模型。</small>
                </label>
                <div class="security-note">🔒 每个模型的 API Key 相互独立，仅保存在当前浏览器会话中。节点运行时会使用节点下拉框所选模型的地址、密钥和参数。</div>
                <div class="model-service-actions">
                  <button class="secondary" :disabled="activeConnectionTest.status === 'testing'" @click="testProviderConnection(activeServiceKind, activeService.id)">
                    {{ activeConnectionTest.status === 'testing' ? '测试中…' : `测试 ${activeService.name}` }}
                  </button>
                  <button
                    class="secondary model-script-button"
                    :class="{ ready: Boolean(activeService.script.trim()) }"
                    @click="openModelScriptEditor(activeServiceKind, activeService)"
                  >
                    {{ activeService.script.trim() ? '调用脚本 · 已配置' : '调用脚本' }}
                  </button>
                </div>
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

              <template v-else-if="activeSetting === '提示词来源'">
                <div class="section-title">
                  <div><h3>提示词来源</h3><p>管理提示词库从哪些公开 JSON 地址拉取内容</p></div>
                  <span class="provider-status">● {{ publicPromptSources.filter((source) => source.enabled).length }} 个已启用</span>
                </div>
                <div class="prompt-source-actions">
                  <button class="secondary" :disabled="publicPromptSources.length >= 20" @click="addPromptSource()">＋ 添加来源</button>
                </div>
                <div class="prompt-source-list">
                  <article
                    v-for="source in publicPromptSources"
                    :key="source.id"
                    class="prompt-source-card"
                    :class="{ collapsed: isPromptSourceCollapsed(source.id) }"
                  >
                    <header>
                      <div>
                        <button
                          class="prompt-source-collapse-button"
                          :title="isPromptSourceCollapsed(source.id) ? '展开来源配置' : '收起来源配置'"
                          :aria-label="isPromptSourceCollapsed(source.id) ? `展开 ${source.name || '未命名来源'} 的配置` : `收起 ${source.name || '未命名来源'} 的配置`"
                          :aria-expanded="!isPromptSourceCollapsed(source.id)"
                          @click="togglePromptSourceCollapsed(source.id)"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"></path></svg>
                        </button>
                        <b>{{ source.name || '未命名来源' }}</b>
                        <span :class="source.builtIn ? 'built-in' : 'custom'">{{ source.builtIn ? '内置' : '自定义' }}</span>
                      </div>
                      <ToggleRow v-model="source.enabled" title="启用" text="参与提示词库拉取" />
                    </header>
                    <div v-if="!isPromptSourceCollapsed(source.id)" class="prompt-source-config-fields">
                      <label>来源名称<input v-model="source.name" maxlength="60" placeholder="例如：我的提示词库" /></label>
                      <label>JSON URL<input v-model="source.url" type="url" spellcheck="false" placeholder="https://raw.githubusercontent.com/.../prompts.json" @input="clearPromptSourceTest(source.id)" /></label>
                      <label>项目主页（可选）<input v-model="source.homepage" type="url" spellcheck="false" placeholder="https://github.com/owner/repository" /></label>
                      <ToggleRow
                        v-model="source.autoMap"
                        title="自动映射字段"
                        text="识别不同项目的字段并转换为内部提示词格式"
                        @update:model-value="clearPromptSourceTest(source.id)"
                      />
                    </div>
                    <div class="prompt-source-card-actions">
                      <button class="secondary" :disabled="promptSourceTestState(source.id).status === 'testing'" @click="testPromptSource(source)">
                        {{ promptSourceTestState(source.id).status === 'testing' ? '拉取中…' : '测试拉取' }}
                      </button>
                      <a v-if="source.homepage" :href="source.homepage" target="_blank" rel="noreferrer">查看项目</a>
                      <button v-if="!source.builtIn" class="danger-link" @click="removePromptSource(source)">删除</button>
                    </div>
                    <div
                      v-if="promptSourceTestState(source.id).message"
                      class="connection-result"
                      :class="promptSourceTestState(source.id).status"
                    >
                      {{ promptSourceTestState(source.id).message }}
                    </div>
                  </article>
                </div>
                <div class="security-note">提示词来源仅保存名称和公开 URL，不需要 API Key。关闭来源后，它不会参与下次提示词库刷新。</div>
                <div class="section-reset"><button @click="resetPromptSources">恢复默认来源</button></div>
              </template>

              <template v-else-if="activeSetting === '系统提示词'">
                <div class="section-title"><div><h3>系统提示词</h3><p>定义 AI 在所有工作流中的身份与行为边界</p></div></div>
                <label>全局系统提示词<textarea v-model="settings.systemPrompt" class="large-textarea"></textarea></label>
                <div class="prompt-card"><b>提示词层级</b><p>全局系统提示词 → 节点级指令 → 用户输入</p></div>
                <label>工具确认策略
                  <CustomSelect v-model="settings.confirmPolicy" aria-label="工具确认策略" :options="confirmPolicyOptions" />
                </label>
                <div class="section-reset">
                  <button @click="resetSystemPromptSettings">恢复默认</button>
                </div>
              </template>

              <template v-else-if="activeSetting === '画布'">
                <div class="section-title"><div><h3>画布偏好</h3><p>调整网格、缩放与自动保存</p></div></div>
                <label>背景样式<CustomSelect v-model="settings.grid" aria-label="背景样式" :options="gridOptions" /></label>
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
