# Task Plan: 媒体节点生成输入区

## Goal
图片、视频、音频节点单击后在节点下方展开可输入的生成区域；原节点底部的添加、模型和生成操作全部迁入该区域，输入文字作为新的生成提示词。

## Current Phase
Phase 4

## Phases

### Phase 1: 现状检查
- [x] 检查三类媒体节点模板和生成函数
- [x] 检查现有图片修改面板及点击外部收起逻辑
- [x] 确定统一状态结构和交互边界
- **Status:** complete

### Phase 2: 实现
- [x] 增加统一媒体生成输入区状态
- [x] 单击图片、视频、音频节点展开输入区
- [x] 将添加、模型选择、生成按钮迁入输入区
- [x] 输入提示词同步到当前节点并用于生成
- [x] 处理拖拽、设置和播放器点击冲突
- **Status:** complete

### Phase 3: 验证与文档
- [x] 更新操作手册
- [x] TypeScript 与生产构建通过
- [x] 页面验证三类媒体节点布局和展开行为
- **Status:** complete

### Phase 4: 交付
- [x] 汇总行为和限制
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用统一的 `mediaPromptNodeId` | 三种媒体交互一致且同一时间只展开一个输入区 |
| 媒体输入仍写入 `node.content` | 直接复用现有上下文构建和生成快照逻辑 |
| 有图图片生成继续创建右侧结果 | 保留原图，符合既有图片修改约定 |
| 外部完整点击收起，拖动不收起 | 延续项目已有图片编辑器交互 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 合并补丁未找到 `buildConfiguredImagePrompt` 的完整上下文 | 同时加入占位清理和图片提示词 | 拆分为两个更小的精确补丁 |
| PowerShell 把 `rg` 模式中的 `||` 解释为命令运算符 | 最终行号查询 | 拆成不含管道运算符的固定字符串查询 |
