import { spawn } from 'node:child_process'
import readline from 'node:readline'

const port = 43129
const origin = 'http://127.0.0.1:4173'
const child = spawn(process.execPath, ['index.mjs'], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, ECSHOPX_CANVAS_AGENT_PORT: String(port) },
  stdio: ['pipe', 'pipe', 'pipe'],
})
const replies = new Map()
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  const message = JSON.parse(line)
  replies.get(message.id)?.(message)
  replies.delete(message.id)
})

const rpc = (message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`RPC timeout: ${message.method}`)), 5000)
  replies.set(message.id, (reply) => { clearTimeout(timer); resolve(reply) })
  child.stdin.write(`${JSON.stringify(message)}\n`)
})
const request = (path, init = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
  ...init,
  headers: { Origin: origin, 'Content-Type': 'application/json', ...(init.headers || {}) },
})

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Agent startup timeout')), 5000)
  child.stderr.on('data', (chunk) => {
    if (String(chunk).includes('listening')) { clearTimeout(timer); resolve() }
  })
})
await request('/v1/state', {
  method: 'POST',
  body: JSON.stringify({ sessionId: 'smoke', state: { canvas: { id: 'test', name: 'Smoke' }, nodes: [], edges: [], selection: { nodeIds: [] } } }),
})
const initialize = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
if (!initialize.result?.capabilities?.tools) throw new Error('Missing MCP tool capability')
const toolCall = rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'canvas_create_node', arguments: { kind: 'text', title: 'Smoke' } } })
await new Promise((resolve) => setTimeout(resolve, 30))
const commands = await (await request('/v1/commands?sessionId=smoke')).json()
if (commands[0]?.action !== 'create_node') throw new Error('Command was not queued')
await request(`/v1/results/${commands[0].id}`, { method: 'POST', body: JSON.stringify({ ok: true, result: { nodeId: 'node-smoke' } }) })
const result = await toolCall
if (result.result?.structuredContent?.result?.nodeId !== 'node-smoke') throw new Error('Command result was not returned to MCP')
child.stdin.end()
console.log('ecshopx-canvas Agent smoke test passed')
