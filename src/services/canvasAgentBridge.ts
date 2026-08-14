export type CanvasAgentCommand = {
  id: string
  action: string
  payload?: Record<string, unknown>
}

type CanvasAgentBridgeOptions = {
  getState: () => Record<string, unknown>
  handleCommand: (command: CanvasAgentCommand) => Promise<unknown> | unknown
  endpoint?: string
  intervalMs?: number
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:43128'

export function startCanvasAgentBridge(options: CanvasAgentBridgeOptions) {
  const endpoint = options.endpoint || DEFAULT_ENDPOINT
  const sessionId = crypto.randomUUID()
  let stopped = false
  let timer = 0
  let running = false

  async function request(path: string, init?: RequestInit) {
    return fetch(`${endpoint}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    })
  }

  async function sendResult(command: CanvasAgentCommand, ok: boolean, result: unknown) {
    try {
      await request(`/v1/results/${encodeURIComponent(command.id)}`, {
        method: 'POST',
        body: JSON.stringify(ok ? { ok, result } : { ok, error: String(result) }),
      })
    } catch {
      // The local Agent may have stopped between command execution and acknowledgement.
    }
  }

  async function tick() {
    if (stopped || running) return
    running = true
    try {
      await request('/v1/state', {
        method: 'POST',
        body: JSON.stringify({ sessionId, state: options.getState() }),
      })
      const response = await request(`/v1/commands?sessionId=${encodeURIComponent(sessionId)}`)
      if (!response.ok) return
      const commands = (await response.json()) as CanvasAgentCommand[]
      for (const command of commands) {
        try {
          await sendResult(command, true, await options.handleCommand(command))
        } catch (error) {
          await sendResult(command, false, error instanceof Error ? error.message : error)
        }
      }
    } catch {
      // Codex is optional: a missing local Agent must never affect normal canvas use.
    } finally {
      running = false
    }
  }

  void tick()
  timer = window.setInterval(() => void tick(), options.intervalMs || 900)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}
