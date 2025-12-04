import 'dotenv/config'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { createUserTodoTools } from './tools'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

// Service client for channel management
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Map userId to SDK session ID (conversation persists per user)
const sessionMap = new Map<string, string>()

// Track active user channels
const userChannels = new Map<string, RealtimeChannel>()

/**
 * Verify JWT and extract user info
 */
async function verifyAndExtractUser(accessToken: string): Promise<{ userId: string } | null> {
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    })

    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) {
      console.error('Token verification failed:', error?.message)
      return null
    }
    return { userId: user.id }
  } catch (err) {
    console.error('Token verification exception:', err)
    return null
  }
}

/**
 * Process a user message (runs concurrently - not awaited)
 */
async function processUserMessage(
  channel: RealtimeChannel,
  userId: string,
  accessToken: string,
  payload: { clientSessionId: string; message: string }
) {
  const { clientSessionId, message } = payload
  const sdkSessionId = sessionMap.get(userId)

  console.log(`[User:${userId.slice(0, 8)}] Received: ${message}`)
  console.log(`[User:${userId.slice(0, 8)}] SDK Session: ${sdkSessionId || 'new'}`)

  try {
    // Create user-scoped MCP tools for this request
    const todoMcpServer = createUserTodoTools(accessToken, userId)

    const result = query({
      prompt: message,
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
          'mcp__todos__ToggleTodo'
        ],
        ...(sdkSessionId && { resume: sdkSessionId })
      }
    })

    let fullContent = ''

    for await (const msg of result) {
      // Capture SDK session ID from init message
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionMap.set(userId, msg.session_id)
        console.log(`[User:${userId.slice(0, 8)}] New SDK session: ${msg.session_id}`)
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

    console.log(`[User:${userId.slice(0, 8)}] Response complete`)
  } catch (error) {
    console.error(`[User:${userId.slice(0, 8)}] Error:`, error)
    await channel.send({
      type: 'broadcast',
      event: 'assistant_message',
      payload: { clientSessionId, content: 'Sorry, an error occurred.', done: true, error: true }
    })
  }
}

/**
 * Subscribe to a user's chat channel
 */
function subscribeToUserChannel(userId: string) {
  if (userChannels.has(userId)) {
    console.log(`[User:${userId.slice(0, 8)}] Already subscribed`)
    return userChannels.get(userId)!
  }

  console.log(`[User:${userId.slice(0, 8)}] Creating channel subscription`)

  const channel = supabase.channel(`chat:${userId}`, {
    config: { broadcast: { self: false } }
  })

  channel.on('broadcast', { event: 'user_message' }, async ({ payload }) => {
    const { accessToken, ...rest } = payload

    // Verify token matches the channel's user
    const userInfo = await verifyAndExtractUser(accessToken)
    if (!userInfo || userInfo.userId !== userId) {
      console.error(`[User:${userId.slice(0, 8)}] Invalid token for channel`)
      return
    }

    // Process message concurrently (don't await)
    processUserMessage(channel, userId, accessToken, rest)
  })

  channel.subscribe((status) => {
    console.log(`[chat:${userId.slice(0, 8)}] Status: ${status}`)
  })

  userChannels.set(userId, channel)
  return channel
}

async function main() {
  console.log('Starting multi-user chat server...')
  console.log(`Connecting to Supabase at ${SUPABASE_URL}`)

  // Master channel listens for user connection requests
  const masterChannel = supabase.channel('chat:connect', {
    config: { broadcast: { self: false } }
  })

  masterChannel.on('broadcast', { event: 'connect' }, async ({ payload }) => {
    const { userId, accessToken } = payload

    console.log(`Connection request from user: ${userId?.slice(0, 8)}...`)

    // Verify the token
    const userInfo = await verifyAndExtractUser(accessToken)
    if (!userInfo || userInfo.userId !== userId) {
      console.error('Invalid connection request - token mismatch')
      return
    }

    // Subscribe to the user's channel
    subscribeToUserChannel(userId)
  })

  masterChannel.subscribe((status) => {
    console.log(`Master channel status: ${status}`)
    if (status === 'SUBSCRIBED') {
      console.log('Chat server ready! Listening for user connections...')
    }
  })

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down...')
    masterChannel.unsubscribe()
    userChannels.forEach(ch => ch.unsubscribe())
    process.exit(0)
  })
}

main()
