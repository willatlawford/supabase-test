import { useState, useRef, useCallback, useEffect } from 'react'
import { useChannel, type ChannelMessage, type ChannelState } from './useChannel'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_use' | 'slash_output'
  content: string
  timestamp: Date
  toolName?: string
  toolInput?: Record<string, unknown>
}

export type ConnectionState = ChannelState

interface UseChatOptions {
  accessToken: string
  workerUrl?: string
}

export function useChat({
  accessToken,
  workerUrl = 'http://localhost:8789'
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatError, setChatError] = useState<string | null>(null)
  const [lostConnection, setLostConnection] = useState(false)
  const [sessionId] = useState(() => crypto.randomUUID())

  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasConnectedRef = useRef(false)
  const isConnectingRef = useRef(false)

  // Handle incoming messages from the channel
  const handleMessage = useCallback((msg: ChannelMessage) => {
    if (msg.type === 'assistant_message') {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: msg.content || '',
        timestamp: new Date()
      }])
    } else if (msg.type === 'tool_use') {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'tool_use',
        content: '',
        timestamp: new Date(),
        toolName: msg.toolName,
        toolInput: msg.toolInput
      }])
    } else if (msg.type === 'slash_output') {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'slash_output',
        content: msg.content || '',
        timestamp: new Date()
      }])
    } else if (msg.type === 'error') {
      setChatError(msg.message || msg.content || 'Unknown error')
    }
  }, [])

  const handleReady = useCallback(() => {
    console.log('Agent ready')
    setChatError(null)
    setLostConnection(false)
    wasConnectedRef.current = true
  }, [])

  const handleError = useCallback((message: string) => {
    setChatError(message)
  }, [])

  const {
    state: connectionState,
    error: channelError,
    connect: connectChannel,
    sendMessage: sendToChannel,
    disconnect
  } = useChannel({
    onMessage: handleMessage,
    onReady: handleReady,
    onError: handleError,
    readyTimeout: 30000
  })

  // Start keepalive interval
  const startKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current)
    }
    keepaliveRef.current = setInterval(async () => {
      try {
        await fetch(`${workerUrl}/api/agent/keepalive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ sessionId })
        })
      } catch (e) {
        console.log('Keepalive failed:', e)
      }
    }, 30000)
  }, [workerUrl, accessToken, sessionId])

  // Stop keepalive interval
  const stopKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current)
      keepaliveRef.current = null
    }
  }, [])

  // Connect: subscribe to channel FIRST, then start sandbox
  const connect = useCallback(async () => {
    if (!accessToken) return
    if (isConnectingRef.current) return

    isConnectingRef.current = true
    setLostConnection(false)
    setChatError(null)

    try {
      // 1. Subscribe to channel FIRST (so we don't miss 'ready' message)
      console.log('Subscribing to channel:', sessionId)
      await connectChannel(sessionId)

      // 2. THEN call worker to start sandbox
      console.log('Starting agent session:', sessionId)
      const response = await fetch(`${workerUrl}/api/agent/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ sessionId })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to start agent')
      }

      console.log('Agent session started')

      // 3. Start keepalive interval
      startKeepalive()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to connect'
      setChatError(message)
      // Only show "lost connection" if we were previously connected
      if (wasConnectedRef.current) {
        setLostConnection(true)
      }
    } finally {
      isConnectingRef.current = false
    }
  }, [accessToken, workerUrl, sessionId, connectChannel, startKeepalive])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return

    setChatError(null)

    // Add user message locally
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    }])

    // Send via channel
    const success = await sendToChannel(content.trim())
    if (!success) {
      setChatError('Failed to send message')
      return
    }

    // Send keepalive on every message
    try {
      await fetch(`${workerUrl}/api/agent/keepalive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ sessionId })
      })
    } catch (e) {
      console.log('Keepalive failed:', e)
    }
  }, [sendToChannel, workerUrl, accessToken, sessionId])

  const clearMessages = useCallback(() => {
    setMessages([])
    setChatError(null)
  }, [])

  // Detect lost connection - only if we were previously connected
  useEffect(() => {
    if (connectionState === 'disconnected' && wasConnectedRef.current && !isConnectingRef.current) {
      setLostConnection(true)
    }
  }, [connectionState])

  // Connect on mount
  useEffect(() => {
    if (accessToken) {
      connect()
    }

    return () => {
      stopKeepalive()
      disconnect()
      isConnectingRef.current = false  // Reset so reconnect works after strict mode remount
    }
  }, [accessToken, connect, disconnect, stopKeepalive])

  // Reconnect when tab becomes visible
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && accessToken && connectionState === 'disconnected') {
        connect()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [accessToken, connect, connectionState])

  return {
    messages,
    sendMessage,
    clearMessages,
    error: chatError || channelError,
    connectionState,
    lostConnection,
    connect
  }
}
