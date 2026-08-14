#!/usr/bin/env node
import http from 'node:http'
import readline from 'node:readline'

const PORT = Number(process.env.ECSHOPX_CANVAS_AGENT_PORT || 43128)
const state = { sessionId: '', canvas: null, updatedAt: 0 }
const commands = []
const pending = new Map()

function allowedOrigin(request) {
  const origin = request.headers.origin || ''
  if (!origin) return '*'
  if (origin === 'https://groot810.github.io') return origin
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return origin
  return ''
}

function sendJson(request, response, status, value) {
  const origin = allowedOrigin(request)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${PORT}`)
  if (!allowedOrigin(request)) return sendJson(request, response, 403, { error: 'Origin not allowed' })
  if (request.method === 'OPTIONS') return sendJson(request, response, 204, null)
  try {
    if (request.method === 'GET' && url.pathname === '/v1/status') {
      return sendJson(request, response, 200, { connected: Date.now() - state.updatedAt < 4000, updatedAt: state.updatedAt })
    }
    if (request.method === 'POST' && url.pathname === '/v1/state') {
      const body = await readJson(request)
      state.sessionId = String(body.sessionId || '')
      state.canvas = body.state || null
      state.updatedAt = Date.now()
      return sendJson(request, response, 200, { ok: true })
    }
    if (request.method === 'GET' && url.pathname === '/v1/commands') {
      const sessionId = url.searchParams.get('sessionId') || ''
      if (state.sessionId && sessionId !== state.sessionId) return sendJson(request, response, 409, [])
      return sendJson(request, response, 200, commands.splice(0, commands.length))
    }
    if (request.method === 'POST' && url.pathname.startsWith('/v1/results/')) {
      const id = decodeURIComponent(url.pathname.slice('/v1/results/'.length))
      const waiter = pending.get(id)
      if (!waiter) return sendJson(request, response, 404, { error: 'Unknown command' })
      const body = await readJson(request)
      pending.delete(id)
      clearTimeout(waiter.timer)
      body.ok ? waiter.resolve(body.result) : waiter.reject(new Error(body.error || 'Canvas command failed'))
      return sendJson(request, response, 200, { ok: true })
    }
    sendJson(request, response, 404, { error: 'Not found' })
  } catch (error) {
    sendJson(request, response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.on('error', (error) => {
  process.stderr.write(`[ecshopx-canvas] Local Agent failed: ${error.message}\n`)
})
server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`[ecshopx-canvas] Local Agent listening on http://127.0.0.1:${PORT}\n`)
})

function requireCanvas() {
  if (!state.canvas || Date.now() - state.updatedAt > 5000) {
    throw new Error('未连接画布。请打开 ecshopx-canvas 网页，并保持页面处于运行状态。')
  }
  return state.canvas
}

function queueCommand(action, payload = {}) {
  requireCanvas()
  const id = `command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  commands.push({ id, action, payload })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('画布操作超时，请确认网页仍然打开。'))
    }, 30000)
    pending.set(id, { resolve, reject, timer })
  })
}

const toolDefinitions = [
  { name: 'canvas_get_state', description: '读取当前画布、节点、连线、选区和视口。媒体只返回是否存在，不返回文件正文。', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'canvas_get_selection', description: '读取当前选中的节点和连线。', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'canvas_create_node', description: '在当前画布创建文本、图片、视频或音频节点。', inputSchema: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['text', 'image', 'video', 'audio'] }, title: { type: 'string' }, content: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } } } },
  { name: 'canvas_connect_nodes', description: '创建 source 到 target 的有向数据连线。', inputSchema: { type: 'object', required: ['source', 'target'], properties: { source: { type: 'string' }, target: { type: 'string' } } } },
  { name: 'canvas_apply_ops', description: '批量更新、移动、删除或选择节点。', inputSchema: { type: 'object', required: ['operations'], properties: { operations: { type: 'array', items: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['update_node', 'delete_nodes', 'select_nodes', 'set_viewport'] }, id: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, patch: { type: 'object' }, x: { type: 'number' }, y: { type: 'number' }, zoom: { type: 'number' } } } } } } },
  { name: 'canvas_focus_node', description: '将画布视角移动到指定节点并选中它。', inputSchema: { type: 'object', required: ['nodeId'], properties: { nodeId: { type: 'string' } } } },
  { name: 'canvas_run_node', description: '触发指定节点的生成操作；使用节点当前模型和上游输入。', inputSchema: { type: 'object', required: ['nodeId'], properties: { nodeId: { type: 'string' } } } },
]

async function callTool(name, args) {
  const canvas = requireCanvas()
  if (name === 'canvas_get_state') return canvas
  if (name === 'canvas_get_selection') {
    return { selectedNodeIds: canvas.selection?.nodeIds || [], selectedEdgeId: canvas.selection?.edgeId || null, nodes: (canvas.nodes || []).filter((node) => (canvas.selection?.nodeIds || []).includes(node.id)) }
  }
  const actionByTool = {
    canvas_create_node: 'create_node', canvas_connect_nodes: 'connect_nodes', canvas_apply_ops: 'apply_ops',
    canvas_focus_node: 'focus_node', canvas_run_node: 'run_node',
  }
  const action = actionByTool[name]
  if (!action) throw new Error(`Unknown tool: ${name}`)
  return queueCommand(action, args || {})
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

async function handleMessage(message) {
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) return
  try {
    if (message.method === 'initialize') {
      return writeMessage({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ecshopx-canvas', version: '0.1.0' } } })
    }
    if (message.method === 'tools/list') {
      return writeMessage({ jsonrpc: '2.0', id: message.id, result: { tools: toolDefinitions } })
    }
    if (message.method === 'tools/call') {
      const result = await callTool(message.params?.name, message.params?.arguments || {})
      return writeMessage({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: { result } } })
    }
    writeMessage({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })
  } catch (error) {
    writeMessage({ jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] } })
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
lines.on('line', (line) => {
  if (!line.trim()) return
  try { void handleMessage(JSON.parse(line)) }
  catch (error) { process.stderr.write(`[ecshopx-canvas] Invalid MCP message: ${error.message}\n`) }
})
lines.on('close', () => server.close(() => process.exit(0)))
