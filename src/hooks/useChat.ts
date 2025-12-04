import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface UseChatOptions {
  userId: string
  accessToken: string
}

export function useChat({ userId, accessToken }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const clientSessionId = useRef(crypto.randomUUID())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const connectChannelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!userId || !accessToken) return

    // Subscribe to user-specific channel
    const channel = supabase.channel(`chat:${userId}`, {
      config: { broadcast: { self: false } }
    })

    channel.on('broadcast', { event: 'assistant_message' }, ({ payload }) => {
      // Only process messages for this session
      if (payload.clientSessionId !== clientSessionId.current) return

      if (payload.done) {
        // Message complete
        setIsLoading(false)

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

    channel.subscribe(async (status) => {
      console.log(`Chat channel (chat:${userId}) status:`, status)

      if (status === 'SUBSCRIBED') {
        // Tell the server to subscribe to this user's channel
        const connectChannel = supabase.channel('chat:connect', {
          config: { broadcast: { self: false } }
        })

        connectChannel.subscribe(async (connectStatus) => {
          if (connectStatus === 'SUBSCRIBED') {
            await connectChannel.send({
              type: 'broadcast',
              event: 'connect',
              payload: { userId, accessToken }
            })
          }
        })

        connectChannelRef.current = connectChannel
      }
    })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      connectChannelRef.current?.unsubscribe()
    }
  }, [userId, accessToken])

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

    // Send to server via broadcast (include accessToken for verification)
    await channelRef.current?.send({
      type: 'broadcast',
      event: 'user_message',
      payload: {
        clientSessionId: clientSessionId.current,
        message: content.trim(),
        accessToken
      }
    })
  }, [isLoading, accessToken])

  const clearMessages = useCallback(() => {
    setMessages([])
    // Generate new session ID to start fresh
    clientSessionId.current = crypto.randomUUID()
  }, [])

  return { messages, sendMessage, isLoading, clearMessages }
}
