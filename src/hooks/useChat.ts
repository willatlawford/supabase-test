import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const clientSessionId = useRef(crypto.randomUUID())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pendingMessageRef = useRef<string | null>(null)

  useEffect(() => {
    const channel = supabase.channel('chat', {
      config: { broadcast: { self: false } }
    })

    channel.on('broadcast', { event: 'assistant_message' }, ({ payload }) => {
      // Only process messages for this session
      if (payload.clientSessionId !== clientSessionId.current) return

      if (payload.done) {
        // Message complete
        setIsLoading(false)
        pendingMessageRef.current = null

        // Update or add the final message
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg.id === 'pending') {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, id: crypto.randomUUID(), content: payload.content }
            ]
          }
          return prev
        })
      } else {
        // Streaming update
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg.id === 'pending') {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: payload.content }
            ]
          } else {
            // Add new pending message
            return [
              ...prev,
              {
                id: 'pending',
                role: 'assistant',
                content: payload.content,
                timestamp: new Date()
              }
            ]
          }
        })
      }
    })

    channel.subscribe((status) => {
      console.log('Chat channel status:', status)
    })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    // Send to server via broadcast
    await channelRef.current?.send({
      type: 'broadcast',
      event: 'user_message',
      payload: {
        clientSessionId: clientSessionId.current,
        message: content.trim()
      }
    })
  }, [isLoading])

  const clearMessages = useCallback(() => {
    setMessages([])
    // Generate new session ID to start fresh
    clientSessionId.current = crypto.randomUUID()
  }, [])

  return { messages, sendMessage, isLoading, clearMessages }
}
