import 'dotenv/config'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { createTodoTools } from './tools'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Create MCP server with todo tools
const todoMcpServer = createTodoTools(supabase)

// Map client session IDs to Claude SDK session IDs
const sessionMap = new Map<string, string>()

async function handleUserMessage(channel: RealtimeChannel, payload: { clientSessionId: string; message: string }) {
  const { clientSessionId, message } = payload
  const sdkSessionId = sessionMap.get(clientSessionId)

  console.log(`[${clientSessionId}] Received: ${message}`)
  console.log(`[${clientSessionId}] SDK Session: ${sdkSessionId || 'new'}`)

  try {
    const result = query({
      prompt: message,
      options: {
        model: 'claude-sonnet-4-20250514',
        systemPrompt: `You are a helpful assistant that can manage todos.
Use the ListTodos, AddTodo, DeleteTodo, and ToggleTodo tools to help users manage their tasks.
When listing todos, present them in a readable format.
Respond concisely and helpfully.`,
        mcpServers: {
          todos: todoMcpServer
        },
        // Allow specific MCP tools
        allowedTools: [
          'mcp__todos__ListTodos',
          'mcp__todos__AddTodo',
          'mcp__todos__DeleteTodo',
          'mcp__todos__ToggleTodo'
        ],
        ...(sdkSessionId && { resume: sdkSessionId })
      }
    })

    let fullContent = ''

    for await (const msg of result) {
      // Log all messages for debugging
      console.log(`[${clientSessionId}] MSG:`, msg.type, msg.subtype || '', JSON.stringify(msg).slice(0, 200))

      // Capture SDK session ID from init message
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionMap.set(clientSessionId, msg.session_id)
        console.log(`[${clientSessionId}] New SDK session: ${msg.session_id}`)
      }

      // Stream assistant messages
      if (msg.type === 'assistant') {
        const content = typeof msg.message.content === 'string'
          ? msg.message.content
          : msg.message.content.map(block => 'text' in block ? block.text : '').join('')

        fullContent = content

        await channel.send({
          type: 'broadcast',
          event: 'assistant_message',
          payload: { clientSessionId, content, done: false }
        })
      }
    }

    // Send done signal
    await channel.send({
      type: 'broadcast',
      event: 'assistant_message',
      payload: { clientSessionId, content: fullContent, done: true }
    })

    console.log(`[${clientSessionId}] Response sent`)
  } catch (error) {
    console.error(`[${clientSessionId}] Error:`, error)
    await channel.send({
      type: 'broadcast',
      event: 'assistant_message',
      payload: { clientSessionId, content: 'Sorry, an error occurred.', done: true, error: true }
    })
  }
}

async function main() {
  console.log('Starting chat server...')
  console.log(`Connecting to Supabase at ${SUPABASE_URL}`)

  const channel = supabase.channel('chat', {
    config: { broadcast: { self: false } }
  })

  channel.on('broadcast', { event: 'user_message' }, async ({ payload }) => {
    await handleUserMessage(channel, payload)
  })

  channel.subscribe((status) => {
    console.log(`Channel status: ${status}`)
    if (status === 'SUBSCRIBED') {
      console.log('Chat server ready! Listening for messages...')
    }
  })

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('Shutting down...')
    channel.unsubscribe()
    process.exit(0)
  })
}

main()
