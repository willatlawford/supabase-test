import { useState, useRef, useCallback, useEffect } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_use' | 'slash_output'
  content: string
  timestamp: Date
  toolName?: string
  toolInput?: Record<string, unknown>
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

interface UseChatOptions {
  accessToken: string
  workerUrl?: string
}

interface ServerMessage {
  type: 'ready' | 'session_init' | 'assistant_message' | 'tool_use' | 'slash_output' | 'error' | 'status' | 'heartbeat'
  sessionId?: string
  content?: string
  message?: string
  status?: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

export function useChat({
  accessToken,
  workerUrl = 'http://localhost:8789'
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [lostConnection, setLostConnection] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const connect = useCallback(() => {
    if (!accessToken) return

    // Already have an active connection
    if (wsRef.current) {
      const state = wsRef.current.readyState
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return
    }

    setConnectionState('connecting')
    setError(null)
    setLostConnection(false)

    const wsUrl = workerUrl.replace(/^http/, 'ws')
    const url = new URL('/ws', wsUrl)
    url.searchParams.set('token', accessToken)

    const ws = new WebSocket(url.toString())
    wsRef.current = ws

    let lastActivity = Date.now()
    let wasEverConnected = false

    // Clear any existing stale check
    if (staleCheckRef.current) {
      clearInterval(staleCheckRef.current)
    }

    staleCheckRef.current = setInterval(() => {
      if (Date.now() - lastActivity > 45000) {
        console.log('Connection stale (no activity for 45s)')
        clearInterval(staleCheckRef.current!)
        staleCheckRef.current = null
        // Show banner immediately, don't wait for close event
        setConnectionState('disconnected')
        setLostConnection(true)
        ws.close(4000, 'Stale connection')
      }
    }, 10000)

    ws.onopen = () => {
      lastActivity = Date.now()
    }

    ws.onmessage = (event) => {
      lastActivity = Date.now()
      try {
        const data: ServerMessage = JSON.parse(event.data)

        switch (data.type) {
          case 'ready':
            console.log('Agent ready')
            wasEverConnected = true
            setConnectionState('connected')
            setError(null)
            break
          case 'assistant_message':
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: data.content || '',
              timestamp: new Date()
            }])
            break
          case 'tool_use':
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'tool_use',
              content: '',
              timestamp: new Date(),
              toolName: data.toolName,
              toolInput: data.toolInput
            }])
            break
          case 'slash_output':
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'slash_output',
              content: data.content || '',
              timestamp: new Date()
            }])
            break
          case 'error':
            setError(data.message || 'Unknown error')
            break
          case 'heartbeat':
          case 'status':
          case 'session_init':
            // Handled silently
            break
        }
      } catch (e) {
        console.error('Failed to parse message:', e)
      }
    }

    ws.onerror = () => {
      console.log('WebSocket error')
    }

    ws.onclose = (event) => {
      console.log(`WebSocket closed (code: ${event.code})`)

      // Only update state if this is still the current WebSocket
      if (wsRef.current === ws) {
        if (staleCheckRef.current) {
          clearInterval(staleCheckRef.current)
          staleCheckRef.current = null
        }
        wsRef.current = null
        setConnectionState('disconnected')

        // Show reconnect banner only if we were actually connected
        if (wasEverConnected) {
          setLostConnection(true)
        }
      }
    }
  }, [accessToken, workerUrl])

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected')
      return
    }

    setError(null)
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    }])

    wsRef.current.send(JSON.stringify({
      type: 'user_message',
      content: content.trim()
    }))
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  // Connect on mount
  useEffect(() => {
    if (accessToken) {
      connect()
    }

    return () => {
      if (staleCheckRef.current) {
        clearInterval(staleCheckRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting')
      }
    }
  }, [accessToken, connect])

  // Reconnect when tab becomes visible
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && accessToken) {
        connect()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [accessToken, connect])

  return {
    messages,
    sendMessage,
    clearMessages,
    error,
    connectionState,
    lostConnection,
    connect
  }
}
