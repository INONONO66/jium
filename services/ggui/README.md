# Jium GGUI Runtime

This service owns the current `ggui serve` runtime configuration for Jium. It is intentionally isolated from the product app so GGUI can remain a rendering/runtime dependency today and a replaceable reference later.

## Contents

```txt
ggui.json     Jium app identity, generation model, and theme
package.json   start scripts for `ggui serve --mcp-only`
```

## Running standalone

```bash
pnpm --filter @jium/ggui start
# MCP endpoint: http://localhost:6781/mcp
```

Set `PORT=NNNN` to override the port. The agent discovers this service through `GGUI_MCP_URL`, defaulting to `http://localhost:6781/mcp`.
