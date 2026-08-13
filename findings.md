# Findings & Decisions

## 2026-08-07 Configurable prompt sources
- Infinite Canvas defines each source as `{ id, name, url, homepage, enabled, builtIn }` and ships six enabled registry sources backed by `https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/{id}.json`.
- Its source factory trims identifiers/text, defaults new entries to enabled, and distinguishes built-in sources from user additions.
- A directly usable real GitHub JSON endpoint is `https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json`. It is an array with fields including `title`, `preview`, `reference_image_urls`, `prompt`, `author`, `mode`, `category`, and `sub_category`.
- `RISE-UNIBAS/prompt-library` also exposes a real `prompts.json`, but its Dublin Core keys (`dcterms:title`, `prompt_text`, etc.) require a second schema adapter. Banana Prompt Quicker matches the project’s current image-prompt shape more closely and is the better default test URL.

## 2026-08-07 First-class group edges
- Solid group frames currently use `z-index:1`, while ordinary `.canvas-node` cards have no z-index; the frame can therefore cover cards. Cards need a higher base stacking level.
- Existing group connections expand immediately into many ordinary edges. Saved groups now require optional group endpoints on a single edge.
- All edge consumers must resolve group endpoints consistently: path drawing, selection highlighting, compatibility, incoming order, upstream context, deletion, templates, and ungrouping.
- `source` and `target` remain valid representative node IDs, allowing old template previews/import validation to keep working while group-aware helpers take precedence at runtime.

## 2026-08-07 Draggable group frames
- The current selection frame has `pointer-events:none`; its toolbar and ports opt back in. Frame-area dragging requires enabling pointer events on the frame while keeping it behind node cards.
- `startCanvasDrag()` currently clears selection on pointer-down. Clearing must move to pointer-up and only occur when the canvas pointer did not move.
- Persisted group visuals can be computed by grouping nodes with the same `groupId` and reusing rendered node dimensions.
- A capture-phase pointer handler on grouped node articles can select the complete group even when a child media/editor element stops bubbling.

## 2026-08-07 Selection toolbar
- Existing canvas persistence serializes node fields, so optional node `groupId` needs no separate group collection.
- Template instantiation already remaps node IDs and mention tokens; duplicate-selection logic can reuse the same pattern.
- Auto-arrange currently hardcodes `nodes.value`; it should be extracted into a subset function using only edges internal to that subset.
- `selectedNode` now resolves only for one selected node, so the new toolbar belongs inside the world-space selection frame rather than the fixed single-node action bar.
- `templateNodeShell()` explicitly whitelists fields, so `groupId` must be added there; template use must also remap group IDs to avoid merging a newly inserted template with existing canvas groups.

## 2026-08-07 Multi-node selection
- Requested interaction: hold Ctrl/Cmd and drag on empty canvas to select multiple nodes.
- A visual group frame must surround the selection and expose left input/right output ports.
- Frame connections must expand to real node edges; the frame itself must not enter generation context or persistence.
- Existing `selected: string[]`, `createConnection()`, cycle detection, and edge context logic are reusable, but pointer-state handling must distinguish canvas panning, marquee selection, node dragging, and connection dragging.
- `startCanvasDrag()` currently always clears selection and starts viewport panning; the modifier branch must run before that behavior.
- Existing connection drag stores only one `linkingFrom` node. Group output needs a transient list of source IDs plus a virtual draft origin at the selection frame's right port.
- `selectedNode` currently returns the first selected node even for multi-selection, so it must only resolve when exactly one node is selected.
- Node dimensions should use `renderedNodeSizes` with the model width/height fallback when calculating marquee intersection and the group frame.
- Because only one selection frame exists at a time, dragging its output back onto its own input must be rejected; otherwise expansion would accidentally create an all-to-all graph between selected nodes.

## 2026-08-07 Media migration
- The asset library already uses IndexedDB, but canvas node `url` values may still contain complete Data URLs and are persisted inside canvas JSON/localStorage.
- The migration must cover save/load, generated media, uploads/replacements, asset-library selection, ZIP export/import, deletion, and object URL cleanup.
- Empty audio nodes created from the left rail should not render playback controls until a media asset exists.
- Existing IndexedDB records store asset metadata plus a `url` string in one `assets` object store. A schema upgrade can add a dedicated canvas-media store containing `Blob` records without breaking the library.
- `saveNow()` currently serializes reactive nodes directly, and `applyCanvasPayload()` is synchronous; resolving `assetId` values therefore needs an async hydration pass after load/switch/import.
- ZIP export currently fetches `node.url`, while import converts packaged files back to Data URLs. Both paths must be changed to read/write IndexedDB blobs and preserve an `assetId` reference in imported canvas JSON.

## Relevant Files
- `src/App.vue`
- `src/assets/main.css`
- `README.md`

## Requirements
- 公开提示词标签默认只占一行，提供向下展开/收起。
- 我的模板：画布模板、提示词模板。
- 模板库：内置画布模板、内置提示词模板。
- 两类模板都需要可实际使用，不只是静态分类。

## Compatibility
- 现有画布模板存储键为 `infinite:canvas-templates`，继续沿用。
- 提示词模板直接复用 `infinite:saved-prompts`，不再建立第二套存储。

## Existing Implementation
- 模板侧栏现有一级页签为“我的模板 / 模板库”，其下目前只有画布模板列表。
- 画布模板已经具备导入当前画布、悬浮缩略图、双击重命名、使用和删除。
- 本地提示词已经具备文本、图片、视频、音频类型，可复用为提示词模板来源。
- 内置画布模板目前为“服装复刻”；可保留原数据并仅调整展示分组。
- 公开提示词标签目前横向滚动；需要新增展开状态与一行裁切容器。

## Chosen Interaction
- 一级页签继续为“我的模板 / 模板库”。
- 每个一级页签内部增加“画布模板 / 提示词模板”二级切换，避免四个大页签拥挤。
- 我的提示词模板从现有“我的提示词”集合导入，模板卡片支持使用、重命名、删除。
- 内置提示词模板提供可直接写入当前选中节点或新建文本节点的实际使用动作。

## Integration Points
- `loadLocal()` 是画布模板、角色和提示词的统一加载入口，提示词模板应在这里加载。
- `addNode()` 可复用节点默认尺寸；提示词模板在无选中节点时需要单独创建带模板正文的文本节点。
- `selectedNode` 可用于判断提示词模板写入目标；图片、视频、音频节点写入后应打开对应媒体提示词输入区。
# 2026-08-13 图片放大实现依据
- canvas.best 公开源码中的放大实现使用 Canvas 2D 重采样，没有提示词；算法枚举为 `high`、`bilinear`、`nearest`。
- “高清插值”采用分阶段倍增并在最后一步使用高质量平滑；双线性使用单次平滑缩放；最近邻关闭平滑。
- 当前项目已有 IndexedDB 媒体持久化 `assignCanvasMediaBlob()`，可直接保存放大输出并只在画布 JSON 中保留资产 ID。
