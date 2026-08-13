# Task Plan: 图片节点本地放大

## Goal
根据图片节点是否有文件精简工具栏，并实现与 canvas.best 相同思路的本地图片分辨率放大：高清插值、双线性、最近邻；结果创建在原图右侧并自动连线，原图不覆盖。

## Phases
- [completed] 审计图片工具栏、媒体持久化与节点创建逻辑。
- [completed] 增加放大参数、三种 Canvas 插值算法和尺寸校验。
- [completed] 增加放大弹窗与空/非空图片工具栏规则。
- [completed] 创建右侧结果节点、保存媒体并连接原图。
- [completed] 类型检查、构建并刷新本地页面。

## Decisions
- “查看大图”保留原放大预览行为；新“放大”专指提升图片像素尺寸。
- 插值全部在浏览器本地执行，不调用模型、不使用提示词。
- 长边目标提供 1K、2K、4K，最大 4096px，保持原图比例。
- 输出使用 PNG，新节点继承原图生成提示词，原图不被覆盖。

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| PowerShell 禁止执行 npm.ps1 | 1 | 改用 npm.cmd run build，类型检查与构建通过。 |
