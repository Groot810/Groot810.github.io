# Findings & Decisions

## Relevant Files
- `src/App.vue`
- `src/components/NodePromptEditor.vue`
- `src/assets/main.css`
- `操作手册.md`

## Current Findings
- 当前三类媒体节点本体下面统一渲染 `.node-foot`，其中包含“添加”、模型选择和“生成”。
- 文本节点通过 `NodePromptEditor` 编辑 `node.content`；生成函数 `runNode(node)` 已把 `node.content` 作为当前节点提示词。
- 生成图片单击时目前另有 `.image-edit-panel`，通过 `runImageVariation()` 保留原图并在右侧生成修改结果。
- 节点点击与拖拽共用 `startNodeDrag/endDrag`；当前只有生成图片预览会在未发生拖动时打开图片编辑器。
- 已有全局指针逻辑能做到“外部完整点击收起、拖动画布不收起”，可改为服务统一媒体输入区。

## Planned Interaction
- 新增单一活动状态 `mediaPromptNodeId`，同一时间只展开一个媒体生成输入区。
- 图片、视频、音频节点在未拖动的单击后展开；表单、播放器按钮、设置按钮保持原行为。
- 媒体节点本体不再渲染 `.node-foot`；新的绝对定位输入区包含 `NodePromptEditor`、添加、模型选择和生成。
- 有图片资源时继续走保留原图的变体生成；空图片、视频和音频继续复用 `runNode()`。

## Browser Verification Findings
- 生产构建刷新后，图片、视频、音频节点本体均不再出现“添加 / 模型 / 生成”底栏；文本节点底栏保持不变。
- 对可见音频节点执行真实单击后，节点下方出现统一输入区，且内部各有 1 个添加按钮、1 个模型选择和1 个生成按钮。
- 初次测试发现上传音频的文件元数据出现在输入框中；已增加媒体占位内容清理，并让生成图片优先恢复 `imagePrompt`。
- 图片请求构建器原先只整合上游内容，没有明确加入图片节点自己的输入；已增加“当前节点生成提示词”段落。
- 最终页面逐一验证图片、视频、音频：三者输入区标题正确，旧 `.node-foot` 数量均为 0，输入区内添加/模型/生成各 1 个。
- 从图片切到视频、再切到音频时只保留当前输入区；点击顶部外部区域后输入区数量归零。
- 上传音频和空图片打开后提示词为空，不再显示本地文件元数据。
