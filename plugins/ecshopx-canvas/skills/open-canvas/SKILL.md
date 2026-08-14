---
name: open-canvas
description: 打开并连接 ecshopx-canvas 在线版或本地开发版。用户要求打开、连接、进入或使用 ecshopx-canvas 时使用。
---

# Open ecshopx-canvas

## 默认在线版

打开：

```text
https://groot810.github.io/ecshopx-canvas/
```

插件的 MCP 进程会同时在 `127.0.0.1:43128` 启动本地桥接服务。网页会自动探测该地址，不需要用户复制 URL 或 token。

## 本地开发版

用户明确要求本地项目时，在项目目录运行：

```bash
pnpm dev
```

然后打开 Vite 输出的本地地址，通常为：

```text
http://127.0.0.1:5173/
```

如果用户当前已经打开 `http://127.0.0.1:4173/`，直接复用该页面。

## 连接检查

打开页面后调用 `canvas_get_state`。能返回画布名称、节点和连线即表示连接成功；如果提示未连接，等待约一秒后重试一次，并确认网页仍保持打开。
