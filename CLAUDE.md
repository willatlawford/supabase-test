# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root directory)
```bash
npm run dev      # Start Vite dev server (localhost:5173)
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
```

### Cloudflare Worker (`/worker`)
```bash
cd worker && npm run dev   # Start worker + container (localhost:8789)
```
**Note**: Docker must be running for containers to work.

### Supabase
```bash
npx supabase start    # Start local Supabase (requires Docker)
npx supabase stop     # Stop local Supabase
npx supabase db reset # Reset database and rerun migrations
```

## Architecture

This is a todo app with an AI chat agent that can manage todos. It has four main parts:

1. **Frontend** (`/src`) - React + TanStack Query + Tailwind CSS v4
2. **Cloudflare Worker** (`/worker/src/index.ts`) - Auth verification, WebSocket forwarding
3. **Agent Container** (`/worker/sandbox/`) - Claude Agent SDK with MCP tools
4. **Database** (`/supabase`) - PostgreSQL via Supabase

### Chat Architecture

```
Frontend (React) <--WebSocket--> Cloudflare Worker <--WebSocket--> Container (Agent)
```

- **WebSocket connection** for bidirectional real-time chat
- **Per-user containers** - each authenticated user gets their own container instance
- **Container lifecycle** - sleeps after 5 minutes of inactivity, wakes on request
- **Stale detection** - frontend detects dead connections after 45s of no heartbeat
- **Manual reconnect** - user clicks button to reconnect (no auto-reconnect after disconnect)

### Key Files

#### Worker (`/worker`)
- `src/index.ts` - Cloudflare Worker entry, JWT auth via Supabase, WebSocket forwarding to container
- `sandbox/server.js` - Agent server with WebSocket, Claude Agent SDK, MCP tools
- `sandbox/package.json` - Container dependencies (claude-agent-sdk, ws, zod)
- `wrangler.jsonc` - Cloudflare configuration (containers, R2, durable objects)
- `Dockerfile` - Container image based on `cloudflare/sandbox`

#### Frontend (`/src`)
- `hooks/useChat.ts` - WebSocket connection management, stale detection, reconnection logic
- `components/Chat.tsx` - Chat UI with connection status indicator and reconnect banner
- `components/ChatInput.tsx` - Message input with loading/disabled states
- `hooks/useRealtimeSync.ts` - Postgres Changes listener for TanStack Query invalidation
- `hooks/useTodos.ts`, `hooks/useCategories.ts` - TanStack Query hooks for Supabase

### MCP Tools (defined in `worker/sandbox/server.js`)
- `ListTodos` - List todos with optional filters
- `AddTodo` - Create a new todo
- `DeleteTodo` - Delete a todo by ID
- `ToggleTodo` - Toggle completion status

## Important Notes

- **Zod version**: Container uses Zod v3 (required by Claude Agent SDK), not v4
- **Separate node_modules**: Frontend, worker, and sandbox have independent dependencies
- **Environment variables**: Worker needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`
