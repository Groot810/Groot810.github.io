---
name: canvas
description: 操作当前 ecshopx-canvas，读取节点与选区、创建或修改节点、建立有向连线、定位节点并触发生成。
---

# ecshopx-canvas

当用户要理解或操作当前画布时，使用 `ecshopx-canvas` MCP 工具，不要求用户复制画布 JSON。

## 工作顺序

1. 修改画布前先调用 `canvas_get_state`；用户提到“选中的内容”时先调用 `canvas_get_selection`。
2. 单个节点用 `canvas_create_node` 创建；批量修改、移动、删除或选择使用 `canvas_apply_ops`。
3. 使用 `canvas_connect_nodes` 建立 `source → target` 有向数据依赖，不创建重复、自连接或循环依赖。
4. 触发生成前确认目标节点及其直接上游输入，再调用 `canvas_run_node`。
5. 需要让用户看到目标节点时调用 `canvas_focus_node`。

## 数据与安全

- 画布状态不会向 MCP 返回 API Key、Base URL 或媒体文件正文，只返回节点文字、结构和是否包含媒体。
- 不在没有用户要求时删除节点或触发付费生成。
- 媒体节点的真实文件仍保留在浏览器 IndexedDB 中，Codex 只操作节点关系和生成指令。
- 页面未连接时，提示用户保持 ecshopx-canvas 页面打开；不要让用户手动填写本地 Agent token。

## 布局建议

- 工作流默认由左到右排列，上游节点在左、生成节点在右。
- 同层节点由上到下留出间距，避免覆盖已有节点。
- 文本节点适合保存提示词与说明；图片、视频、音频节点分别作为对应多模态输入或结果。
