# Jium Agent

`apps/agent` is the OpenAI Agents SDK backend for Jium. It receives prompts from `apps/web`, connects to MCP services by URL, and streams normalized responses back to the fullscreen shell.

## Role

The agent is an orchestrator, not a service implementation layer. It connects to:

```txt
GGUI_MCP_URL                 -> services/ggui
GGUI_API_GATEWAY_MCP_URL     -> services/api-gateway
GGUI_USER_CONTEXT_MCP_URL    -> services/user-context
```

Any environment variable matching `GGUI_<NAME>_MCP_URL` is registered as an MCP server named `<name>`, while `ggui` remains the fixed render endpoint.

## Running standalone

```bash
export OPENAI_API_KEY=sk-...
pnpm --filter @jium/agent start
# backend:       http://localhost:6791
# sandbox proxy: http://localhost:7791
```

The web app should point `VITE_AGENT_ENDPOINT_URL` at the backend URL.

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `6791` | Agent HTTP port |
| `SANDBOX_PROXY_PORT` | `7791` | Second-origin sandbox proxy port |
| `GGUI_MCP_URL` | `http://localhost:6781/mcp` | GGUI render MCP endpoint |
| `GGUI_API_GATEWAY_MCP_URL` | — | API Fuse + Swing domain tools |
| `GGUI_USER_CONTEXT_MCP_URL` | — | Ambient user context tools |
| `GGUI_MCP_BEARER` | `dev` | Authorization bearer for GGUI MCP requests |
| `OPENAI_MODEL` | `gpt-5.5-2026-04-23` | Agent model id |
| `SYSTEM_PROMPT` | default posture prompt | Override agent instructions; `none` disables |
| `OPENAI_API_KEY` | — | Required for real model calls |

## Boundaries

Do not import service internals here. Shared reusable code belongs in `packages/*`; service processes stay behind MCP/HTTP boundaries.
