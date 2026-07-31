# Findings & Decisions

## Requirements
- “我的模板”增加“导入模板”。
- 导入模板会保存当前画布所有控件的位置、尺寸、内容和连线定位。
- 最多保存 10 个模板。
- 鼠标悬浮模板卡片时显示简易缩略图。
- 每个模板提供“使用模板”，把保存的节点和连线放入当前画布。

## Technical Findings
- 节点由 `CanvasNode[]` 保存，包含坐标、宽高、内容和节点配置。
- 连线由 `Edge[]` 保存，包含 source、target、order、enabled 和 handle 信息。
- `checkpoint()` 可在应用模板前记录撤销点。
- 当前视口使用 `viewport.x/y/zoom`；可由画布可视区域中心计算模板追加位置。
- 现有 `cloneSnapshot()` 已使用 JSON 深拷贝，可沿用相同策略复制模板数据。
- 画布和配置已使用 localStorage，模板可采用独立存储键，避免混入单个画布记录。

## Implementation Decisions
| Decision | Rationale |
|----------|-----------|
| 空画布不允许导入模板 | 避免产生无内容模板 |
| 模板名称基于当前画布名和顺序生成 | 无需增加额外阻塞式命名流程 |
| 使用模板以模板包围盒中心对齐当前视口中心 | 保持原相对布局，同时让新增内容立即可见 |
| 模板预览动态生成 SVG | 不增加截图文件或额外存储体积 |
| localStorage 写入失败时保留内存状态回滚 | 图片 Data URL 可能触发浏览器存储配额限制 |

## Resources
- `src/App.vue`
- `src/assets/main.css`
- `操作手册.md`
