import { useState, useRef, useCallback, useEffect } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface UseChatOptions {
  accessToken: string
  /** Cloudflare Worker URL - defaults to localhost for development */
  workerUrl?: string
}

interface ServerMessage {
  type: 'ready' | 'session_init' | 'assistant_message' | 'error' | 'status'
  sessionId?: string
  content?: string
  message?: string
  status?: string
}

/**
 * Chat hook using WebSocket connection to Cloudflare Worker + Container.
 * Maintains persistent connection for two-way communication with the agent.
 */
export function useChat({
  accessToken,
  workerUrl = 'http://localhost:8789'
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

  const wsRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | undefined>(undefined)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)

  // Handle server messages
  const handleServerMessage = useCallback((data: ServerMessage) => {
    console.log('handleServerMessage:', data.type, data)

    switch (data.type) {
      case 'status':
        // Status updates during container startup
        console.log('Status:', data.status)
        break

      case 'ready':
        // Agent is ready to receive messages
        console.log('Agent ready')
        setConnectionState('connected')
        setError(null) // Clear any previous errors
        break

      case 'session_init':
        console.log('Session init:', data.sessionId)
        sessionIdRef.current = data.sessionId
        break

      case 'assistant_message':
        console.log('Assistant message received:', data.content?.substring(0, 100))
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: data.content || '',
          timestamp: new Date()
        }])
        break

      case 'error':
        console.log('Error received:', data.message)
        setError(data.message || 'Unknown error')
        break

      default:
        console.log('Unknown message type:', data.type)
    }
  }, [])

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect without an access token
    if (!accessToken) {
      console.log('No access token, skipping connection')
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return

    setConnectionState('connecting')
    setError(null)

    // Convert http(s) to ws(s) and add token as query param
    const wsUrl = workerUrl.replace(/^http/, 'ws')
    const url = new URL('/ws', wsUrl)
    url.searchParams.set('token', accessToken)

    const ws = new WebSocket(url.toString())

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0
      // Wait for 'ready' message from server to set connected state
    }

    ws.onmessage = (event) => {
      try {
        console.log('WebSocket received:', event.data)
        const data: ServerMessage = JSON.parse(event.data)
        handleServerMessage(data)
      } catch (e) {
        console.error('Failed to parse message:', e)
      }
    }

    ws.onerror = () => {
      // Only log error on first attempt to reduce spam
      if (reconnectAttemptsRef.current === 0) {
        console.log('WebSocket connection error - container may be starting')
      }
      // Don't set error during reconnection attempts - it's expected
    }

    ws.onclose = (event) => {
      setConnectionState('disconnected')
      wsRef.current = null

      // Auto-reconnect with exponential backoff (unless clean close)
      if (event.code !== 1000) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
        reconnectAttemptsRef.current++
        setConnectionState('reconnecting')

        // Only log reconnect attempts occasionally to reduce spam
        if (reconnectAttemptsRef.current <= 3 || reconnectAttemptsRef.current % 5 === 0) {
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`)
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }
    }

    wsRef.current = ws
  }, [accessToken, workerUrl, handleServerMessage])

  // Send message - allows multiple messages while waiting for responses
  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected')
      return
    }

    setError(null)

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])

    // Send to server (agent will queue and process)
    wsRef.current.send(JSON.stringify({
      type: 'user_message',
      content: content.trim()
    }))
  }, [])

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect')
      wsRef.current = null
    }
    setConnectionState('disconnected')
  }, [])

  // Connect when accessToken becomes available, cleanup on unmount
  useEffect(() => {
    if (accessToken) {
      connect()
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting')
        wsRef.current = null
      }
    }
  }, [accessToken, connect])

  return {
    messages,
    sendMessage,
    clearMessages,
    error,
    connectionState,
    connect,
    disconnect
  }
}
