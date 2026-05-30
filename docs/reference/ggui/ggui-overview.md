# Reference — ggui in one page

> ggui is **invisible infrastructure** for agentic UIs. The agent describes a UI
> in natural language; ggui generates and renders it; the user's interactions
> route back to the agent. You don't write UI, polling loops, or event handlers —
> **you build tools and a posture prompt.**

## The pieces (this monorepo)

| Service | Role |
| ------- | ---- |
| `apps/agent` | The LLM agent (your SDK). Connects to MCP servers; owns the chat loop. |
| `services/ggui`  | `ggui serve` — generates + serves the UI. Configured by `ggui.json`. |
| `services/*`| Your **domain tools** as MCP servers. |
| `apps/web`      | A Vite SPA that mounts renders via `<AppRenderer>` (`@ggui-ai/react`). |

## The loop

1. User prompts in `apps/web` → POSTs to `apps/agent`.
2. The agent has **no built-in tools** — only the MCP tools of the servers it
   connects to: `ggui_*` (render) + your domain tools.
3. It calls a domain tool for data, then **`ggui_render`**, describing the UI in
   natural language. `services/ggui` generates a React UI and returns it as an MCP
   **resource**; the agent backend reads it (`resources/read`) and inlines it.
4. `apps/web` mounts it with `<AppRenderer>`. The rendered iframe loads ggui's
   runtime bundle + a live channel **directly from `services/ggui`** (so ggui must
   be reachable from the browser — locally that's `localhost`; on a deploy it's
   ggui's public URL, see `theming.md`/deploy notes).
5. The user clicks something → the action is relayed back to the agent.
6. Next turn, the agent drains it with **`ggui_consume`**, calls the right tool,
   and `ggui_render`s an updated UI.

## What you actually build

- **Tools** — domain MCP servers (`docs/reference/ggui/writing-mcp-tools.md`).
- **A posture prompt** — `apps/agent/src/` system prompt; sets the agent's
  domain voice. The wire flow is taught by the tools' descriptions — don't
  restate it.
- **The look** — `ggui.json#theme` (`docs/reference/ggui/theming.md`). Zero UI code.
- Optionally **blueprints** (cached screens) and **gadgets** (browser libs) via
  `/blueprint` and `/gadget`.

## Read next
- `docs/reference/ggui/ggui-tools.md` — the `ggui_*` render tools (what the agent calls).
- `docs/reference/ggui/writing-mcp-tools.md` — author your own domain MCP.
- `docs/reference/ggui/ggui-json.md` — the ggui server config.
- `docs/reference/ggui/theming.md` — presets + custom DTCG themes.
