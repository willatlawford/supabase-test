# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root directory)
```bash
npm run dev      # Start Vite dev server (localhost:5173)
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
```

### Agent Server (`/server`)
```bash
cd server && npm run dev   # Start with hot reload (localhost:3001)
cd server && npm start     # Start without hot reload
```

### Supabase
```bash
npx supabase start    # Start local Supabase (requires Docker)
npx supabase stop     # Stop local Supabase
npx supabase db reset # Reset database and rerun migrations
```

## Architecture

This is a todo app with an AI chat agent that can manage todos. It has three main parts:

1. **Frontend** (`/src`) - React + TanStack Query + Tailwind CSS v4
2. **Agent Server** (`/server`) - Claude Agent SDK with MCP tools
3. **Database** (`/supabase`) - PostgreSQL via Supabase with Realtime

### Real-time Communication

- **Chat**: Uses Supabase Broadcast channel for bidirectional messaging between frontend and agent server
- **Data sync**: Supabase Postgres Changes events trigger TanStack Query invalidation

### Key Files

- `src/hooks/useChat.ts` - Chat state and Broadcast channel subscription
- `src/hooks/useRealtimeSync.ts` - Postgres Changes listener that invalidates TanStack Query
- `src/hooks/useTodos.ts`, `src/hooks/useCategories.ts` - TanStack Query hooks wrapping Supabase queries
- `server/index.ts` - Agent server entry, Claude SDK setup, Broadcast listener
- `server/tools.ts` - MCP tool definitions (ListTodos, AddTodo, DeleteTodo, ToggleTodo)

## Important Notes

- **Zod version**: Server uses Zod v3 (required by Claude Agent SDK), not v4
- **Separate node_modules**: Frontend and server have independent dependencies
