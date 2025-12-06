console.log('Starting server.js...');

import http from 'http';
import { WebSocketServer } from 'ws';

console.log('Basic imports loaded');

// Lazy-load heavy dependencies only when needed
let agentModules = null;

async function loadAgentModules() {
  if (agentModules) return agentModules;

  console.log('Loading agent modules...');
  const { query, tool, createSdkMcpServer } = await import('@anthropic-ai/claude-agent-sdk');
  const { createClient } = await import('@supabase/supabase-js');
  const { z } = await import('zod');
  console.log('Agent modules loaded');

  agentModules = { query, tool, createSdkMcpServer, createClient, z };
  return agentModules;
}

async function createMcpServer(db, userId) {
  const { tool, createSdkMcpServer, z } = await loadAgentModules();

  const listTodos = tool(
    'ListTodos',
    'List all todos for the current user, optionally filtered by category or completion status',
    {
      categoryId: z.string().optional().describe('Filter by category ID'),
      completed: z.boolean().optional().describe('Filter by completion status')
    },
    async (args) => {
      try {
        let q = db.from('todos').select('*, categories(name)');
        if (args.categoryId) q = q.eq('category_id', args.categoryId);
        if (args.completed !== undefined) q = q.eq('completed', args.completed);
        const { data, error } = await q.order('created_at', { ascending: false });

        if (error) {
          return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Exception: ${err}` }], isError: true };
      }
    }
  );

  const addTodo = tool(
    'AddTodo',
    'Create a new todo item for the current user',
    {
      title: z.string().describe('The todo title'),
      categoryId: z.string().optional().describe('Optional category ID')
    },
    async (args) => {
      const { data, error } = await db
        .from('todos')
        .insert({
          title: args.title,
          category_id: args.categoryId,
          user_id: userId
        })
        .select()
        .single();

      if (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Created todo: ${JSON.stringify(data)}` }] };
    }
  );

  const deleteTodo = tool(
    'DeleteTodo',
    'Delete a todo by its ID (only works for current user\'s todos)',
    {
      id: z.string().describe('The todo ID to delete')
    },
    async (args) => {
      const { error } = await db.from('todos').delete().eq('id', args.id);

      if (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Deleted todo ${args.id}` }] };
    }
  );

  const toggleTodo = tool(
    'ToggleTodo',
    'Toggle the completion status of a todo (only works for current user\'s todos)',
    {
      id: z.string().describe('The todo ID'),
      completed: z.boolean().describe('The new completion status')
    },
    async (args) => {
      const { data, error } = await db
        .from('todos')
        .update({ completed: args.completed })
        .eq('id', args.id)
        .select()
        .single();

      if (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Updated todo: ${JSON.stringify(data)}` }] };
    }
  );

  return createSdkMcpServer({
    name: 'todos',
    version: '1.0.0',
    tools: [listTodos, addTodo, deleteTodo, toggleTodo]
  });
}

// Extract text content from assistant message
function extractContent(msg) {
  if (typeof msg.message.content === 'string') {
    return msg.message.content;
  }
  return msg.message.content
    .map(block => ('text' in block ? block.text : ''))
    .join('');
}

// Create HTTP server (for health checks)
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('WebSocket connection established');

  // Extract token and userId from query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const accessToken = url.searchParams.get('token');
  const userId = url.searchParams.get('userId');

  console.log('Connection from user:', userId);

  // State for this connection
  let todoMcpServer = null;
  let userSupabase = null;
  let queryStarted = false;
  let queryEnded = false;

  // Message queue for streaming input pattern
  const messageQueue = [];
  let resolveNext = null;

  // Helper to safely send messages
  const safeSend = (data) => {
    try {
      if (ws.readyState === 1) { // WebSocket.OPEN
        const msg = JSON.stringify(data);
        console.log('Sending to client:', msg);
        ws.send(msg);
      } else {
        console.log('WebSocket not open, state:', ws.readyState);
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Send ready message immediately
  safeSend({ type: 'ready' });

  // AsyncGenerator that yields messages from the queue
  async function* messageGenerator() {
    while (!queryEnded && ws.readyState === 1) {
      if (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        console.log('Yielding message to agent:', msg);
        yield msg;
      } else {
        // Wait for next message
        await new Promise(resolve => { resolveNext = resolve; });
      }
    }
  }

  // Start the streaming query session
  async function startQuerySession() {
    if (queryStarted) return;
    queryStarted = true;

    console.log('Starting streaming query session...');

    const { query } = await loadAgentModules();

    try {
      const result = query({
        prompt: messageGenerator(),
        options: {
          model: 'claude-sonnet-4-20250514',
          systemPrompt: `You are a helpful assistant that can manage todos for the current user.
Use the ListTodos, AddTodo, DeleteTodo, and ToggleTodo tools to help users manage their tasks.
When listing todos, present them in a readable format.
Respond concisely and helpfully.`,
          mcpServers: {
            todos: todoMcpServer
          },
          allowedTools: [
            'mcp__todos__ListTodos',
            'mcp__todos__AddTodo',
            'mcp__todos__DeleteTodo',
            'mcp__todos__ToggleTodo',
            "Skill", "Read", "Write", "Edit", "WebSearch"
          ],
          maxTurns: 100
        }
      });

      // Process responses as they stream in
      for await (const msg of result) {
        console.log('Agent message:', msg.type, msg.subtype || '');

        if (msg.type === 'assistant') {
          // Check for tool_use blocks in the message content
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                console.log('Sending tool_use:', block.name);
                safeSend({
                  type: 'tool_use',
                  toolName: block.name,
                  toolInput: block.input
                });
              } else if (block.type === 'text' && block.text) {
                console.log('Sending assistant response:', block.text.substring(0, 100) + '...');
                safeSend({
                  type: 'assistant_message',
                  content: block.text
                });
              }
            }
          } else if (typeof content === 'string' && content) {
            console.log('Sending assistant response:', content.substring(0, 100) + '...');
            safeSend({
              type: 'assistant_message',
              content: content
            });
          }
        }

        // Check for slash command output in user messages
        if (msg.type === 'user') {
          const content = msg.message?.content;
          if (typeof content === 'string') {
            const match = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
            if (match) {
              console.log('Sending slash_output');
              safeSend({
                type: 'slash_output',
                content: match[1].trim()
              });
            }
          }
        }

        if (msg.type === 'result') {
          console.log('Query result received');
        }
      }

      console.log('Query session ended normally');
    } catch (err) {
      console.error('Query session error:', err);
      safeSend({
        type: 'error',
        message: err.message || 'Query session error'
      });
    } finally {
      queryEnded = true;
    }
  }

  // Handle incoming WebSocket messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received from client:', message);

      if (message.type === 'user_message' && message.content) {
        // Initialize on first message
        if (!todoMcpServer) {
          if (!accessToken || !userId) {
            safeSend({
              type: 'error',
              message: 'Not authenticated - missing token or userId'
            });
            return;
          }

          console.log('Initializing Supabase client...');
          const { createClient } = await loadAgentModules();
          userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          });

          console.log('Initializing MCP server...');
          todoMcpServer = await createMcpServer(userSupabase, userId);
          console.log('MCP server initialized');
        }

        // Queue the message for the generator
        messageQueue.push({
          type: 'user',
          message: {
            role: 'user',
            content: message.content
          }
        });

        // Wake up the generator if it's waiting
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }

        // Start the query session if not started
        if (!queryStarted) {
          startQuerySession();
        }
      }
    } catch (err) {
      console.error('Message parsing error:', err);
      safeSend({
        type: 'error',
        message: 'Invalid message format'
      });
    }
  });

  ws.on('close', (code, reason) => {
    console.log('WebSocket closed, code:', code, 'reason:', reason?.toString());
    queryEnded = true;
    // Wake up generator so it can exit
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });

  // Keep connection alive with ping/pong and app-level heartbeat
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.ping();
      // Also send app-level heartbeat so client can detect stale connection
      safeSend({ type: 'heartbeat' });
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  ws.on('pong', () => {
    // Connection is alive
  });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  console.log('WebSocket endpoint: /ws');
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
