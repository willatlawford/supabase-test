# Supabase Todo App with AI Chat Agent

A React + TypeScript todo application with an integrated AI chat agent that can manage your todos. Uses Supabase for storage/auth and Cloudflare Workers with Sandboxes for the AI agent.

## Features

- **Todo Management**: Create, complete, and delete todos with category support
- **Category System**: Organize todos by custom categories
- **AI Chat Agent**: Chat with Claude to manage your todos using natural language
- **Real-time Sync**: UI updates automatically when the agent modifies data
- **PR Preview Environments**: Full-stack ephemeral environments for each pull request

## Tech Stack

### Frontend (`/src`)
- React 18 + TypeScript
- Vite
- Tailwind CSS v4
- Supabase JS Client
- TanStack Query (React Query)

### Cloudflare Worker (`/worker`)
- Cloudflare Workers with Sandboxes (containerized agent execution)
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- MCP (Model Context Protocol) tools
- Supabase Realtime for bidirectional messaging

### Database (`/supabase`)
- Supabase (PostgreSQL)
- Row Level Security (RLS) for multi-user isolation
- Supabase Realtime for live updates
- Database branching for PR previews

## Architecture

```
Frontend (React) <--Supabase Realtime Channel--> Sandbox (Agent)
                           ^
                           |
              Worker (triggers sandbox, keepalive, timeout)
```

- **Supabase Realtime Channels** for bidirectional messaging between frontend and agent
- **Per-session sandboxes** - each chat session gets its own isolated container
- **Two modes**: Interactive (multi-turn chat) and Non-interactive (single prompt)

## Sandbox Architecture

The agent code runs inside Cloudflare Sandboxes (secure containers). To enable fast PR preview deployments, the sandbox scripts are **bundled at build time and injected at runtime**:

```
worker/sandbox/src/*.ts  →  prebuild (esbuild)  →  src/sandbox-bundle.json  →  worker bundle
                                                         ↓
                                               sandbox.writeFile() at runtime
```

### Why Runtime Script Injection?

When deploying PR preview environments, each PR needs its own isolated worker. However, if we baked the agent scripts into the Docker image:

1. **Each PR would need a unique container image** - slow to build and deploy
2. **Container class names would need to be unique per PR** - complex configuration
3. **Cloudflare's DO namespace binding** makes sharing containers across workers difficult

By injecting scripts at runtime instead:

- **Single shared container image** - only contains Node.js and npm dependencies
- **Same container class (`AgentSandbox`)** works across all environments
- **PR-specific code** is bundled into each worker and injected via `sandbox.writeFile()`
- **Faster deploys** - container image only rebuilds when dependencies change
- **Simpler CI/CD** - no need to manipulate class names or create unique images

The trade-off is a small overhead (~10KB) to write the script on each sandbox start, which is negligible compared to container cold-start times.

## Prerequisites

- Node.js 20+
- Docker (for local Supabase and Cloudflare Sandboxes)
- Anthropic API key
- Cloudflare account (for deployment)

## Local Development

### 1. Install Dependencies

```bash
# Frontend dependencies
npm install

# Worker dependencies
cd worker && npm install && cd ..
```

### 2. Start Supabase

```bash
npx supabase start
```

This will output connection details. Note the `API URL` and `anon key`.

### 3. Configure Environment

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_CLOUDFLARE_WORKER_URL=http://localhost:8787
```

Set worker secrets:

```bash
cd worker
echo "ANTHROPIC_API_KEY" | npx wrangler secret put ANTHROPIC_API_KEY
echo "http://127.0.0.1:54321" | npx wrangler secret put SUPABASE_URL
echo "<your-anon-key>" | npx wrangler secret put SUPABASE_ANON_KEY
```

### 4. Run the App

Start the worker (includes prebuild step):

```bash
cd worker && npm run dev
```

Start the frontend:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Worker: `http://localhost:8787`

## MCP Tools

The AI agent has access to these tools for managing todos:

| Tool | Description |
|------|-------------|
| `ListTodos` | List all todos, optionally filtered by category or completion status |
| `AddTodo` | Create a new todo with optional category |
| `DeleteTodo` | Delete a todo by ID |
| `ToggleTodo` | Mark a todo as complete or incomplete |

## Deployment

### GitHub Actions

The repo includes workflows for:

- **`deploy-dev.yml`** - Deploys to dev environment on push to `main`
- **`deploy-preview.yml`** - Creates ephemeral PR preview environments
- **`cleanup-preview.yml`** - Cleans up preview environments when PRs close

### PR Preview Environments

Each PR automatically gets:
- Isolated Supabase database branch (`pr-{number}`)
- Isolated R2 bucket (`chat-sessions-pr-{number}`)
- Dedicated worker deployment (`worker-pr-{number}`)

All resources are cleaned up when the PR is closed.

## Project Structure

```
.
├── src/                      # Frontend React app
│   ├── components/           # React components
│   ├── hooks/                # Custom hooks
│   └── pages/                # Page components
├── worker/                   # Cloudflare Worker
│   ├── src/index.ts          # Worker entry point
│   ├── sandbox/              # Agent code (TypeScript)
│   │   ├── src/agent.ts      # Unified agent (interactive + non-interactive)
│   │   ├── src/channel.ts    # Supabase Realtime communication
│   │   ├── src/messages.ts   # Message formatting
│   │   └── src/tools.ts      # MCP tool definitions
│   ├── scripts/              # Build scripts
│   │   └── bundle-sandbox.ts # Prebuild script (esbuild)
│   ├── Dockerfile            # Sandbox container (deps only)
│   └── wrangler.jsonc        # Cloudflare configuration
├── supabase/
│   └── migrations/           # Database migrations
└── .github/workflows/        # CI/CD pipelines
```

## Development Notes

- **Zod Version**: The Claude Agent SDK requires Zod v3 (not v4)
- **Prebuild Required**: Run `npm run prebuild` in `/worker` to generate `sandbox-bundle.json`
- **Docker Required**: Cloudflare Sandboxes require Docker for local development
- **Separate node_modules**: Frontend, worker, and sandbox have independent dependencies
