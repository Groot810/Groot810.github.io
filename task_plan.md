# Task Plan: 我的模板保存与使用

## Goal
在“我的模板”中保存当前画布的全部节点、位置、尺寸和连线，最多保存 10 个；模板卡片悬浮时展示简易缩略图，并可将模板副本追加到当前画布。

## Current Phase
Phase 4

## Phases

### Phase 1: 数据与交互检查
- [x] 定位节点、连线、视口、撤销和本地持久化结构
- [x] 检查现有模板面板与样式
- **Status:** complete

### Phase 2: 实现
- [x] 添加模板类型、本地持久化和 10 个上限
- [x] 实现“导入模板”保存当前画布
- [x] 实现悬浮缩略图
- [x] 实现“使用模板”追加节点与连线并重建 ID
- **Status:** complete

### Phase 3: 文档与验证
- [x] 更新操作手册
- [x] 运行类型检查和生产构建
- [x] 检查模板面板关键交互与样式
- **Status:** complete

### Phase 4: 交付
- [x] 汇总实现与验证结果
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 模板保存在浏览器 localStorage | 与现有画布本地保存方式一致 |
| 使用模板时追加到当前视口，不覆盖现有内容 | 符合“再放在当前画布”，也避免丢失用户当前工作 |
| 新节点和连线全部重建 ID | 防止和当前画布已有 ID 冲突 |
| 缩略图用节点矩形与有向连线绘制 | 简洁、无需保存额外图片，始终与模板结构一致 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 从工作区根目录读取计划文件失败 | 1 | 确认计划文件位于 `infinite` 项目目录 |
| PowerShell 执行策略阻止 `npm.ps1` | 1 | 改用 `npm.cmd run build`，构建通过 |
