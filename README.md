# ecshopx-canvas

基于 Vue 3、TypeScript 和 Vite 的本地优先节点式 AI 创作工作台。文本、图片、视频和音频节点通过有向连线传递真实上下文，可分别接入不同的 OpenAI 兼容模型服务。

> 项目仍在持续开发。当前适合本地创作、工作流验证和静态部署；正式公开服务前，建议增加服务端密钥代理、自动化测试与数据迁移机制。

## 快速导航

- [核心能力](#核心能力)
- [本地运行](#本地运行)
- [基本流程](#基本流程)
- [节点功能](#节点功能)
- [提示词角色与模板](#提示词角色与模板)
- [资产与本地存储](#资产与本地存储)
- [模型配置](#模型配置)
- [生成请求检查器](#生成请求检查器)
- [任务中心](#任务中心)
- [公开提示词库](#公开提示词库)
- [导入与导出](#导入与导出)
- [建议后续功能](#建议后续功能)

## 核心能力

- 无限画布：平移、缩放、小地图、吸附网格、自动整理和多选操作。
- 节点工作流：`A → B` 表示运行 B 时读取 A；未连接节点不会进入请求上下文。
- 多模态输入：文本框支持 `@` 引用已连接的文本、图片、视频和音频。
- 分组：框选多个节点后可整体移动、复制、整理、设为分组或解除分组。
- 独立模型渠道：文本、图片、视频和音频各支持最多 5 个服务配置与节点级选择。
- 本地资源管理：画布、模板、角色和提示词保存在浏览器；媒体文件存入 IndexedDB。
- 模板与资产：支持画布模板、提示词模板、公开模板库和用户资产库。

## 本地运行

要求 Node.js `^22.18.0` 或 `>=24.12.0`，推荐使用 pnpm。

```bash
pnpm install
pnpm dev
```

生产构建与预览：

```bash
pnpm build
pnpm preview
```

构建结果位于 `dist/`。Vite `base` 为 `./`，可用于静态托管、GitHub Pages 和桌面网页封装。

## 基本流程

1. 从左侧创建节点，或通过“添加”上传本地文件。
2. 从上游节点右侧端口连接到下游节点左侧端口。
3. 在下游节点输入任务、选择角色和模型。
4. 点击“生成”。系统只收集指向当前节点且已启用的直接上游。
5. 首次使用前，在“配置 → 模型服务”填写相应类型的 Base URL、API Key 和模型名称。

当前默认只读取一层直接上游，不递归展开整条链路。上游内容变化后，下游显示黄色状态点，但不会自动重新生成。

```text
上游节点 A ─┐
             ├─→ 目标节点 C ─→ 模型请求 ─→ 结果写回 C 或创建结果节点
上游节点 B ─┘
```

生成上下文会保留节点名称、节点类型和输入顺序，而不是把所有内容无边界地拼成一段文字。

## 画布操作

- 鼠标模式：滚轮围绕光标缩放；拖动画布空白处平移。
- 触控板模式：双指滑动平移；捏合连续缩放。
- 节点四角可调整大小；拖到视口边缘时画布会缓慢跟随移动。
- `Ctrl/Cmd + 拖动` 框选多个节点；点击外部取消选区。
- 底部工具栏提供撤销、重做、缩放、复位、自动整理和清空画布。
- 点击顶部画布名称可新建、切换、重命名、导入、导出或删除画布。

## 节点功能

### 文本

- 保存提示词、草稿和 AI 文本结果。
- 输入 `@` 可引用已经连接的资源；图片引用显示真实缩略图。
- AI 结果支持双击编辑，输入区与结果区之间的分割线可上下拖动。
- “放大编辑”会打开更大的编辑窗口并实时同步。
- “生图”会在右侧创建并连接图片节点，但不会自动生成。

### 图片

- 支持上传、替换、查看大图、下载、反推提示词和再次生成。
- 可设置自动比例、常用比例或自定义宽高，以及每次生成张数。
- 多张结果保留当前主图，并在右侧创建其余结果节点。
- “放大分辨率”在浏览器本地提供高清插值、双线性和最近邻三种算法，结果写入右侧新节点。
- 修改生成结果时会创建新节点，不覆盖原图。

### 视频

- 支持本地视频与异步视频生成。
- 可设置自动或自定义比例、1–15 秒时长，以及 480p、720p、1080p、4K 分辨率。
- 实际可用参数由所选模型服务决定。

### 音频

- 支持本地上传、录音和 `/audio/speech` 语音生成。
- 提供播放进度、音量、静音、重新录制和播放速度控制。
- 默认声音为 `alloy`、格式为 MP3；生成设置支持语速和生成指令。

单击图片、视频或音频节点会展开媒体生成输入区。输入文字只作为本次提示词；“添加”可创建新的上游文件节点并自动连接。

## 提示词、角色与模板

### 我的提示词

- 最多保存 100 条文本、图片、视频或音频提示词。
- 自动阻止正文完全相同的重复记录。
- 支持新增、重命名、修改、删除和类型调整。
- “我的模板 → 提示词模板”与这里使用同一份数据，可直接使用或跳转编辑。

### 角色

- 每个角色包含名称和系统提示词，最多 30 个。
- 角色只影响选择它的节点，不修改全局系统提示词。

### 画布模板

- 保存节点类型、标题、尺寸、位置、连线以及需要保留的输入提示词。
- 不保存用户上传或 AI 生成的媒体文件。
- 使用模板时会重新生成节点 ID，并同步修复内部 `@` 引用。

## 资产与本地存储

- 资产库支持图片、视频和音频，支持点击或拖放上传、搜索、使用和删除。
- 画布媒体以 Blob 存入 IndexedDB，画布 JSON 只保存资产 ID，避免大型 Base64 内容撑爆 localStorage。
- “配置 → 存储与隐私”显示 IndexedDB、localStorage、sessionStorage、站点总占用和浏览器配额。
- API Key 只保存在当前浏览器会话的 sessionStorage 中。
- 清理本地数据前请先导出需要保留的画布。

### 数据版本与迁移

- 当前画布和模板内容版本由 `schemaVersion` 标识；localStorage 集合使用 `{ schemaVersion, data }` 信封保存。
- 旧版无版本数据按 v1 读取，并通过逐版本迁移器升级后自动回写。
- ZIP 的 `version` 表示导出容器格式，`schemaVersion` 表示画布内容结构，两者独立升级。
- IndexedDB 使用数据库版本管理表结构，并在升级事务中为旧资产记录补齐版本。
- 如果数据版本高于当前应用支持的版本，应用会拒绝覆盖并显示错误，避免新版数据被旧程序破坏。

## 模型配置

每种媒体类型最多创建 5 个渠道。渠道可独立设置 Base URL、API Key、模型、温度、最大输出长度和调用脚本；文本渠道另支持推理强度：`auto`、`low`、`medium`、`high`、`xhigh`。

| 类型 | 默认 Base URL | 默认模型 |
|---|---|---|
| 文本 | `https://api.openai.com/v1` | `gpt-5.5` |
| 图片 | `https://api.openai.com/v1` | `gpt-image-2` |
| 视频 | `https://api.openai.com/v1` | `sora-2` |
| 音频 | `https://api.openai.com/v1` | `gpt-4o-mini-tts` |

Base URL 会原样使用，不会自动补 `/v1`。“测试模型”默认请求该地址的 `/models`；不支持模型列表接口的服务需要手动填写并确认模型名称。自定义调用脚本适合处理非标准端点、请求字段、鉴权头或返回结构。

## 生成请求检查器

每个节点的“生成”按钮旁有一个请求检查按钮。点击后只构建预览，不会调用模型，适合在正式生成前排查请求问题。

- 显示当前节点实际选择的渠道、模型、接口类型和请求地址。
- 按连线顺序列出所有启用的直接上游节点，并显示类型和预计字符数。
- 展示最终 `messages`、当前节点对应的请求体以及提示词和整个请求体的预计字符数。
- 媒体输入会区分“已附加”“仅以文字描述进入上下文”和“资源已断开”，避免把节点存在误认为文件已经发送。
- 对空提示词、无上游、截断、丢失附件和不兼容输入给出检查提示。
- API Key 和 `Authorization` 不会进入预览内容。

## 任务中心

左侧导航栏的“任务”集中记录文本、图片、视频和音频生成任务：

- 按“全部、运行中、成功、失败、已中断”筛选，运行中的任务会在导航按钮显示数量。
- 每条任务显示节点、媒体类型、渠道、模型、开始时间和实时或最终耗时。
- 每条任务标注所属画布；点击节点标题右侧的定位按钮，会打开对应画布并将视角居中到该节点。
- 失败任务显示可读错误；点击“原始 JSON”可像运行日志一样查看任务、画布、节点、模型、状态、起止时间、耗时和原始错误，并可复制 JSON。
- 已完成、失败和中断任务均可重试；重试使用节点当前内容、连接和模型配置。
- 用户主动停止的请求记为“已中断”，批量图片已经完成的结果仍会保留。
- 最近 50 条任务摘要保存在本地，超过上限会自动删除最旧记录；任务中心支持手动清除全部日志。页面刷新时仍未完成的任务会恢复为“已中断”。任务记录不保存 API Key、鉴权头或媒体正文。

## 公开提示词库

内置提示词库来自以下公开项目：

| 项目内名称 | 上游来源 |
|---|---|
| Banana Prompt Quicker | [glidea/banana-prompt-quicker](https://github.com/glidea/banana-prompt-quicker) |
| DavidWu GPT Image 2 | [davidwuw0811-boop/awesome-gpt-image2-prompts](https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts) |
| Awesome GPT Image | [ZeroLu/awesome-gpt-image](https://github.com/ZeroLu/awesome-gpt-image) |
| Awesome GPT-4o | [ImgEdify/Awesome-GPT4o-Image-Prompts](https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts) |
| YouMind GPT Image 2 | [YouMind-OpenLab/awesome-gpt-image-2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2) |
| YouMind Nano Banana Pro | [YouMind-OpenLab/awesome-nano-banana-pro-prompts](https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts) |

项目读取 [yukkcat/image-prompts 的统一 JSON](https://github.com/yukkcat/image-prompts/tree/main/dist/sources)，用于字段标准化、搜索、标签筛选和详情展示。该仓库只是格式转换与分发层；提示词、图片、作者署名及许可仍以各上游项目为准。使用或再分发前请检查相应许可证。

用户也可以在“配置 → 提示词来源”添加公开 JSON URL，并选择是否自动映射常见字段。

## 导入与导出

- 画布导出为 ZIP，根目录包含 `canvas.json`，`file/` 保存仍被节点引用的媒体文件。
- “导入画布”接受同结构 ZIP，并校验 JSON、节点、连线和媒体文件。
- 远程资源受跨域和链接有效期影响；无法下载时会保留原 URL 并记录跳过原因。

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl/Cmd + C` / `Ctrl/Cmd + V` | 复制、粘贴选中节点 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` | 重做 |
| `Ctrl/Cmd + S` | 保存画布 |
| `Ctrl/Cmd + 拖动` | 框选多个节点 |
| `Delete` / `Backspace` | 删除选中节点或连线 |
| `Ctrl/Cmd + Enter` | 完成 AI 结果文本编辑 |
| `Esc` | 取消连线或关闭当前输入面板 |

光标位于输入框、文本编辑器或媒体提示词区域时，`Backspace` 和 `Delete` 只编辑文字，不会删除节点。

## Codex 插件

安装插件后，用户可以直接用自然语言让 Codex 操作网页里的画布，例如创建节点、连接工作流、读取选区或触发生成。

> 只想自己在网页中拖动节点、上传文件和生成内容，不需要安装插件。需要使用 Codex、项目内置 Skill 或其他外部 Skill 操作画布时，必须安装插件并保持 Codex 运行。项目内置的 `canvas` 和 `open-canvas` Skill 会随插件一起安装，不需要单独下载或复制。

### 插件、Skill 和网页的关系

```text
用户向 Codex 提出要求
        ↓
Skill 告诉 Codex 应该怎样操作画布
        ↓
插件提供 MCP 工具和本地桥接服务
        ↓
ecshopx-canvas 网页执行创建、连接、修改或生成操作
```

- **网页**：显示画布，并执行节点编辑和模型生成；可以脱离 Codex 单独使用。
- **Skill**：是 Codex 的操作说明，不能被普通网页直接读取或执行。
- **插件**：负责把 Skill、MCP 工具和本地桥接一起安装到 Codex。
- **外部生图 Skill**：应安装在 Codex 中；如果它需要操作本画布，仍然要通过 `ecshopx-canvas` 插件提供的 MCP 工具。

### 第一次使用：在线画布

#### 第一步：下载插件项目

**方法一：使用 Git 下载**

先在终端进入希望保存项目的目录。例如想把项目放到 Windows 的“下载”文件夹：

```powershell
cd "$HOME\Downloads"
```

然后下载项目：

```bash
git clone https://github.com/Groot810/ecshopx-canvas.git
```

下载完成后，`git clone` 会在当前目录创建一个名为 `ecshopx-canvas` 的项目文件夹。继续运行下面的命令进入该文件夹：

```bash
cd ecshopx-canvas
```

**方法二：下载 ZIP**

1. 打开 [ecshopx-canvas GitHub 仓库](https://github.com/Groot810/ecshopx-canvas)；
2. 点击 `Code → Download ZIP`；
3. 下载完成后解压 ZIP；
4. 打开解压得到的项目文件夹；
5. 在文件夹空白处点击右键，选择“在终端中打开”。

如果终端已经打开，也可以用完整路径进入项目文件夹。例如：

```powershell
cd "C:\Users\你的用户名\Downloads\ecshopx-canvas"
```

路径中存在空格时必须保留双引号。进入正确目录后，运行下面的命令检查：

```powershell
dir
```

如果列表中能看到 `package.json`、`plugins` 和 `.agents`，说明终端已经位于正确的项目根目录。后面的插件安装命令都必须在这个目录中执行。

继续检查插件市场清单和插件清单是否真的存在：

```powershell
Test-Path ".agents\plugins\marketplace.json"
Test-Path "plugins\ecshopx-canvas\.codex-plugin\plugin.json"
```

两条命令都必须返回 `True`。如果返回 `False`，说明下载的项目版本不完整、下载了旧版本，或者项目维护者尚未把插件文件提交到 GitHub；此时不要继续执行安装命令。

#### 第二步：安装 Codex 插件

确保电脑已经安装 Codex 和 Node.js，然后在刚才的 `ecshopx-canvas` 文件夹中运行：

```bash
codex plugin marketplace add .
codex plugin add ecshopx-canvas@ecshopx-canvas-local
```

第一条命令只是把当前项目注册为一个插件市场源，不会直接安装插件。Codex 会读取：

```text
.agents/plugins/marketplace.json
```

然后第二条命令才会从这个市场源安装 `ecshopx-canvas` 插件。

看到安装成功提示后，关闭旧的 Codex 任务并新建一个任务。已经打开的旧任务不会自动加载新插件。

#### 第三步：打开画布网页

在浏览器中打开：

```text
https://groot810.github.io/ecshopx-canvas/
```

保持该网页打开。插件通过用户电脑上的 `127.0.0.1:43128` 与网页连接，不需要手动填写端口、地址或 Token。

#### 第四步：让 Codex 连接画布

在新建的 Codex 任务中输入：

```text
连接 ecshopx-canvas，读取当前画布
```

连接成功后，Codex 会返回当前画布名称、节点和连线。之后可以继续输入：

```text
在画布中创建一个标题为“产品资料”的文本节点
在产品资料右侧创建一个图片节点，并连接两者
读取当前选中的节点
把选中的节点整理为从左到右排列
定位到“产品资料”节点
运行右侧的图片节点
```

用户不需要记住 MCP 工具名，也不需要复制节点 JSON。直接描述想做什么即可。

### 第一次使用：本地开发版

如果不使用在线网页，需要在项目目录安装依赖并启动本地网页：


```bash
pnpm install
pnpm dev
```

打开终端显示的地址，例如 `http://127.0.0.1:5173/`。保持页面和开发服务器运行，然后在新 Codex 任务中输入：

```text
打开并连接本地 ecshopx-canvas
```

插件安装步骤与在线版相同，只是打开的画布地址不同。

### 日常使用顺序

以后插件不需要每天重复安装。每次使用按照下面的顺序即可：

1. 打开在线画布，或运行 `pnpm dev` 后打开本地画布；
2. 新建一个已经加载 `ecshopx-canvas` 插件的 Codex 任务；
3. 输入“连接 ecshopx-canvas，读取当前画布”；
4. 连接成功后，直接告诉 Codex 要创建、连接、修改、定位或运行哪些节点；
5. 使用期间保持画布网页打开。

### 插件能做什么

| 用户提出的要求 | 插件执行的操作 |
|---|---|
| “看看当前画布有什么” | 读取画布、节点、连线和选区 |
| “创建一个文本节点” | 新建文本、图片、视频或音频节点 |
| “把 A 连接到 B” | 建立 `A → B` 有向数据连线 |
| “修改、移动或删除这些节点” | 批量操作指定节点 |
| “帮我找到这个节点” | 选中节点并把视角移动过去 |
| “生成这个节点” | 按当前模型配置和直接上游输入触发生成 |

插件只传递画布结构和操作指令，不会向 MCP 返回 API Key、Base URL 或媒体文件正文。实际模型请求仍由网页按照用户配置发送。

### 更新插件

通过 Git 获取项目的用户，在项目目录运行：

```bash
git pull
codex plugin add ecshopx-canvas@ecshopx-canvas-local
```

下载 ZIP 的用户需要重新下载并覆盖旧项目，然后再次执行安装命令。更新后必须新建 Codex 任务。

### 不再使用插件

可以在 Codex 的插件管理界面中卸载 `ecshopx-canvas`。卸载插件不会删除浏览器中保存的画布、模板、提示词或资产。

### 连接失败排查

1. 确认画布网页处于打开状态；关闭网页后 Codex 无法操作画布。
2. 安装或更新插件后，新建 Codex 任务再连接，不要继续使用旧任务。
3. 等待一秒后再次输入“读取当前画布”，让网页完成第一次连接心跳。
4. 确认电脑没有其他程序占用 `43128` 端口。
5. 在线网页无法连接时，检查浏览器是否禁止网页访问本机回环地址。
6. 更换在线域名后，需要同步更新 Agent 的来源白名单，否则连接会返回 `403`。

如果安装市场源时出现下面的错误：

```text
does not contain a supported manifest
```

表示传给 `codex plugin marketplace add` 的目录中不存在 Codex 支持的市场清单。请确认：

1. 终端当前位于项目根目录，而不是 `plugins/ecshopx-canvas` 子目录；
2. `.agents/plugins/marketplace.json` 确实存在；
3. `plugins/ecshopx-canvas/.codex-plugin/plugin.json` 确实存在；
4. 从 GitHub 下载时使用的是包含插件文件的最新版本。

### 在线地址与自定义域名

GitHub Pages 的项目站点默认格式是：

```text
https://<GitHub 用户名>.github.io/<仓库名>/
```

不想在网址中显示 GitHub 用户名，可以选择：

- 给 GitHub Pages 绑定自己的域名，例如 `https://canvas.example.com/`；
- 部署到 Cloudflare Pages，使用类似 `https://ecshopx-canvas.pages.dev/` 的项目域名；
- 部署到其他静态托管平台，或给这些平台绑定自己的域名。


更换正式在线地址后，需要同步修改以下位置并重新构建、重新安装插件：

1. `plugins/ecshopx-canvas/.codex-plugin/plugin.json` 中的 `homepage`、`websiteURL`；
2. `plugins/ecshopx-canvas/skills/open-canvas/SKILL.md` 中的默认在线地址；
3. `plugins/ecshopx-canvas/agent/index.mjs` 中的 `allowedOrigin()` 来源白名单。

## 使用提醒

- 本项目由浏览器直接请求模型服务，服务端必须允许当前网页来源的跨域请求。
- “OpenAI 兼容”不代表支持所有多模态字段，具体能力以服务提供方为准。
- 批量生成会增加请求次数、耗时和费用；运行中再次点击“生成”可确认中断，已完成结果会保留。
