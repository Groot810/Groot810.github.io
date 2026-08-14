# ecshopx-canvas Codex Plugin

This plugin connects Codex to ecshopx-canvas through a local-only MCP and HTTP bridge.

It provides tools for reading canvas state and selection, creating or updating nodes, connecting directed workflows, focusing nodes, and triggering generation. API keys and media file bodies are not exposed through the bridge.

The canvas page polls `http://127.0.0.1:43128`; the MCP server is started automatically by Codex when the plugin loads.
