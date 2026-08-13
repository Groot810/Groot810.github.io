# Progress Log

## 2026-08-07 Configurable prompt sources
- Added a “提示词来源” section to Configuration Center, modeled on Infinite Canvas’s `{ id, name, url, homepage, enabled, builtIn }` registry.
- The six existing registry sources are preserved as built-ins; users can enable/disable them, edit public URLs, add up to 20 custom sources, delete custom entries, and restore defaults.
- Added a real fetch test with timeout, HTTP/JSON/schema-specific errors, recognized prompt count, and automatic invalidation after URL edits.
- Added a one-click real example for `glidea/banana-prompt-quicker` using its raw GitHub `prompts.json` endpoint.
- Extended normalization for raw Banana fields (`preview`, `reference_image_urls`, `mode`, `category`, `sub_category`) and Dublin Core-style `prompt_text`/title/description fields.
- The prompt library now loads only enabled configured sources, rebuilds its source filter dynamically, and invalidates cached in-memory results when source configuration changes.
- Source configuration persists in localStorage without secrets and is reset by the existing local-data cleanup flow.
- Type-check and production build pass. Browser test fetched the real GitHub JSON and recognized 323 usable prompts; the temporary custom source was deleted afterward and no console warnings/errors remained.
- Follow-up: removed the built-in real-example panel and button; newly added blank sources now appear at the top of the list. Rebuilt successfully.

## 2026-08-07 Smooth wheel and pinch zoom
- Normalized wheel deltas from pixel, line, and page delta modes into a common pixel scale and capped outlier input.
- Coalesced zoom input into one `requestAnimationFrame` update per frame and reduced exponential sensitivity from `0.01` to `0.0015`.
- Preserved pointer-centered zoom math and the existing 35%–200% limits; pending animation work is cancelled on component teardown.
- Production build passed. Browser verification showed two equal small inputs moving zoom smoothly from 42.55% to 43.32% to 44.11%; the viewport and input mode were restored exactly afterward, with no console warnings/errors.

## 2026-08-07 Moving-group stacking
- Split selected-group positioning from transforms so its toolbar can participate in the canvas root stacking order at z-index 100.
- Group backgrounds now use translucent dark gray at z-index 0; overlapping frames alpha-composite into progressively lighter regions.
- Edges remain at z-index 1, ordinary cards at z-index 2, and cards belonging to the actively moved selection temporarily rise to z-index 20.
- Moving a group by either its frame or one of its grouped cards applies the same elevated-card state and clears it on pointer-up/cancel.
- Production build passed. Browser-computed styles confirmed frame `auto`, toolbar `100`, background `0`, edges `1`, and cards `2`; no console warnings/errors.

## 2026-08-07 Group cleanup and node clipboard
- Changed grid snapping to default off and added a one-time local-settings migration so existing installations receive the new default once without preventing later user choices from persisting.
- Re-grouping nodes now repairs their former group endpoints; a former group with one remaining node is automatically dissolved and its group edges become ordinary node edges.
- Added canvas-local Ctrl/Cmd+C and Ctrl/Cmd+V shortcuts. Pasting remaps node IDs, group IDs, internal edges, and internal `@` mentions, offsets each paste, and selects the new copies.
- Partial copying of a group does not create an invalid one-node group; only complete selected groups retain group structure.
- Type-check and production build pass.

## 2026-08-07 Grid snapping and group layering
- Implemented real grid snapping for single-node and grouped-node dragging, using 24px dot spacing or 28px line-grid spacing according to the active background.
- Node corner resizing now snaps the actively dragged edges to the same grid while respecting minimum dimensions.
- Moved group backgrounds to z-index 0, edge interaction/rendering to z-index 1, and cards to z-index 2 so the dark group plate cannot cover other cards or connections.
- Production build passed. Browser drag verification landed a node at exact 28px-grid coordinates, then the test movement was undone; no console warnings/errors were reported.

## 2026-08-07 First-class group edges
- Started group-edge data model and ungrouping implementation.
- Added optional group endpoints plus helpers that expand one visual group edge into semantic node pairs.
- Saved groups now persist and draw one curve per group endpoint instead of writing a separate visible edge to every member.
- Generation context, compatibility state, stale/highlight behavior, ordering, deletion, auto-arrange, templates, duplication, and imports resolve group endpoints consistently.
- Grouping consolidates external node edges onto the frame; “解除分组” converts those endpoints back to ordinary member edges without deleting dependencies.
- Solid dark-gray frames render at z-index 1 and cards at z-index 2, so media and controls remain fully visible.
- Type-check and production build pass. Browser checks confirmed the dark background, visible cards, working “解除分组” toggle, frame-bound edge paths, and no console warnings/errors.
- All temporary browser mutations were undone after verification.

## 2026-08-07 Draggable group frames
- Started implementing draggable selection frames, click-only clearing, and persistent solid group frames.
- Added derived persisted-group bounds, frame-area group dragging, node capture selection, and click-only outside clearing.
- Type-check and production build pass.
- Saved groups now render continuously as solid dark-gray frames; selecting them switches to the highlighted grouped frame with the toolbar and ports.
- Selection/group frame blank areas now drag every contained node through one shared drag snapshot.
- Canvas panning preserves the current selection; an unmoved outside click clears it on pointer-up.
- Grouped node articles select their complete group during capture, including clicks originating in child media/editor areas.
- Local page reported no console warnings or errors; the isolated test tab was closed.

## 2026-08-07 Selection toolbar
- Started implementation of duplicate, persistent grouping, and selected-only arrange actions.
- Added the selection-frame toolbar and implemented selected-node duplication with internal edge and `@` mention remapping.
- Refactored data-flow arrangement to accept a node subset and added selected-only arrangement.
- Added common `groupId` assignment and group-aware multi-node dragging.
- Type-check and production build pass; opened an isolated local tab for non-destructive interaction testing.
- Browser test confirmed the toolbar and all three buttons appear for a two-node selection.
- “创建副本” increased node count from 9 to 11 and selected both new copies; the temporary change was undone.
- Group IDs are preserved by canvas persistence and template shells, then remapped when templates are instantiated.
- The temporary browser test tab was closed; no test copies were left on the canvas.

## 2026-08-07 Multi-node selection
- Started implementation plan for Ctrl/Cmd marquee selection and transient group connection ports.
- Added canvas-coordinate marquee state, live rectangle intersection selection, and multi-selection bounds.
- Added batch connection expansion with duplicate, missing-node, self-link, and cycle skipping.
- Added group-output connection state and virtual draft-line origin.
- Type-check and production build pass.
- Browser test confirmed Ctrl-drag selected three intersecting nodes and rendered one group frame with both group ports.
- Added pointer-cancel cleanup for node and group connection drags so interrupted drags cannot leave a live draft connection.
- Prevented a selection frame from being connected back to itself, avoiding accidental all-to-all internal edges.
- Final TypeScript check and Vite production build pass.

## 2026-08-07
- Started canvas media IndexedDB migration and empty-audio-node UI work.
- Created a dedicated migration plan before changing persistence code.
- Added IndexedDB schema v2 with a `canvas-media` Blob store and runtime object-URL hydration.
- Canvas saves now remove runtime media URLs when an `assetId` exists; legacy URL canvases migrate automatically.
- ZIP export/import v2 maps `assetId` references to files in `file/`.
- Empty audio nodes now offer local/asset upload and microphone recording; playback UI appears after media exists.
- `vue-tsc --build` and Vite production build pass.
- Browser verification confirmed existing-audio playback UI, empty-audio actions, `alloy`/`mp3` defaults, and the local/asset source modal.
- Browser console contains no warnings or errors after reload.
- Recording now remains in an `上传中` state until its Blob finishes writing to IndexedDB, then reveals playback controls.
- Audio generation settings now default to `alloy`, `mp3`, `1×`, and `自然`; speed and instructions are included in `/audio/speech` requests.
- Re-ran type-check/build and browser-verified the new defaults; removed the temporary test node afterward.
- Added 1080p and 4K video output options; request dimensions now use 1080 or 2160 as the short-edge resolution according to aspect ratio.
- Removed the duplicate play/pause action from the header Play menu and replaced playback speed buttons with a six-step slider.
- Replaced generation-speed buttons with the same six-step slider and expanded request speed values to 0.5–2×.
- Type-check and production build pass; browser console remains clean.
- Recording completion now gates the player behind an explicit IndexedDB upload state and renders `上传中` for at least 500 ms.
- Recorded elapsed time is stored on the node and used when MediaRecorder WebM metadata reports an invalid or missing duration.
- Volume control now exposes the `声音` tooltip and closes automatically when the pointer leaves the complete volume control area.
- Type-check and production build pass after the recording fixes.
- Recorded audio nodes now show `重新录制` below the main play control; legacy recordings are recognized from their saved local-recording metadata.
- Removed the hover outline from `.audio-preview.editable` while retaining video hover feedback.
- Fixed template instances by remapping every `@[node:old-id]` token to the newly generated node ID alongside edge remapping.
- Type-check and production build pass after these changes.
- Restyled all native selects with a unified dark glass surface, embedded chevron, purple focus ring, disabled state, and dark option menu colors.
- Unified hover, selected, pressed, and keyboard-focus feedback across ratio, resolution, template, asset, service, and model-channel option groups.
- Production build and browser computed-style verification pass; no console warnings or errors.

## 2026-08-05
- 启动模板中心分组与提示词标签折叠改造。
- 已确认现有画布模板、公开提示词库代码位置。
- 已确定采用一级“我的模板/模板库”加二级“画布模板/提示词模板”的结构。
- 既有画布模板存储键保持不变，提示词模板独立持久化。
- 初版曾采用独立提示词模板存储，现已按反馈改为直接复用“我的提示词”的 100 条记录。
- 使用提示词模板时优先写入类型匹配的选中节点，否则自动创建对应类型节点。
- 已增加文本、图片、视频、音频四类内置提示词模板。
- 已完成模板中心一级“我的模板/模板库”和二级“画布模板/提示词模板”界面。
- 已完成公开提示词标签单行折叠、向下展开和收起按钮。
- `npm.cmd run build` 通过。
- 浏览器已验证四个模板分区、提示词模板创建、保存、使用和删除。
- 浏览器已验证标签默认折叠，点击箭头后 `aria-expanded` 与展开样式正确变化。
- 所有临时测试节点和临时提示词模板均已清理。
- 清理测试数据时误触清空画布，已立刻撤销完整恢复；随后精确删除临时节点并手动保存，重载后确认画布保留原 10 个节点。
- 根据反馈移除独立提示词模板存储；“我的模板 → 提示词模板”现直接展示并操作“我的提示词”的保存记录。
# 2026-08-13 图片节点本地放大
- 图片节点无文件时，选中工具栏仅显示“替换图片”和“删除”。
- 有文件时显示“查看大图”、新“放大”、下载、存资产、替换图片、反推提示词与删除。
- 新增 1K/2K/4K 放大弹窗，支持高清插值、双线性与最近邻；浏览器本地处理，不调用模型。
- 输出作为原图右侧的新图片节点写入 IndexedDB，并自动建立原图到结果图的有向连线。
- `npm.cmd run build` 通过；本地页面刷新后空图片工具栏验证通过，控制台无错误或警告。
