import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Message types from agent
export interface ChannelMessage {
  type: 'ready' | 'assistant_message' | 'tool_use' | 'slash_output' | 'error' | 'complete'
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  timestamp?: number
  message?: string // for error type
  result?: string // for complete type
}

export type ChannelState = 'disconnected' | 'connecting' | 'connected'

interface UseChannelOptions {
  onMessage?: (message: ChannelMessage) => void
  onReady?: () => void
  onComplete?: () => void
  onError?: (message: string) => void
  readyTimeout?: number // Timeout in ms waiting for 'ready' message (default: 30000)
}

export function useChannel({
  onMessage,
  onReady,
  onComplete,
  onError,
  readyTimeout = 30000
}: UseChannelOptions) {
  const [state, setState] = useState<ChannelState>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const optionsRef = useRef({ onMessage, onReady, onComplete, onError })

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Keep callbacks up to date without triggering reconnects
  useEffect(() => {
    optionsRef.current = { onMessage, onReady, onComplete, onError }
  }, [onMessage, onReady, onComplete, onError])

  // Clear timeout helper
  const clearReadyTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Connect to a channel - channelName is passed at connection time
  const connect = useCallback((channelName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!channelName) {
        console.log('No channel name provided')
        reject(new Error('No channel name'))
        return
      }

      if (channelRef.current) {
        console.log('Already connected to channel')
        resolve()
        return
      }

      console.log('Connecting to channel:', channelName)
      setState('connecting')
      setError(null)
      clearReadyTimeout()

      const channel = supabase.channel(channelName, {
        config: { broadcast: { ack: true, self: false } }
      })

      channel.on('broadcast', { event: 'agent_message' }, (payload) => {
        const msg = payload.payload as ChannelMessage
        console.log('Received agent_message:', msg.type)

        if (msg.type === 'ready') {
          clearReadyTimeout()
          setState('connected')
          optionsRef.current.onReady?.()
        } else if (msg.type === 'complete') {
          optionsRef.current.onComplete?.()
        } else if (msg.type === 'error') {
          const errorMsg = msg.message || msg.content || 'Unknown error'
          setError(errorMsg)
          optionsRef.current.onError?.(errorMsg)
        }

        optionsRef.current.onMessage?.(msg)
      })

      channel.subscribe((status, err) => {
        console.log('Channel subscription status:', status, err || '', 'mounted:', mountedRef.current)

        // Ignore status changes if component unmounted (React strict mode)
        if (!mountedRef.current) {
          console.log('Ignoring status change - component unmounted')
          return
        }

        if (status === 'SUBSCRIBED') {
          console.log('Channel subscribed, waiting for agent ready...')
          // Start timeout for 'ready' message
          timeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return
            console.log('Timeout waiting for agent ready')
            setError('Connection timeout - agent did not respond')
            setState('disconnected')
            optionsRef.current.onError?.('Connection timeout - agent did not respond')
          }, readyTimeout)
          resolve()
        } else if (status === 'CHANNEL_ERROR') {
          const errorMsg = err?.message || 'Failed to connect to channel'
          console.error('Channel error:', errorMsg)
          setError(errorMsg)
          setState('disconnected')
          reject(new Error(errorMsg))
        } else if (status === 'CLOSED') {
          console.log('Channel closed')
          // Only treat as error if we weren't expecting it
          if (channelRef.current) {
            setError('Channel closed unexpectedly')
            setState('disconnected')
            reject(new Error('Channel closed'))
          }
        } else if (status === 'TIMED_OUT') {
          console.log('Channel subscription timed out')
          setError('Channel subscription timed out')
          setState('disconnected')
          reject(new Error('Channel subscription timed out'))
        }
      })

      channelRef.current = channel
    })
  }, [readyTimeout, clearReadyTimeout])

  const sendMessage = useCallback(async (content: string) => {
    if (!channelRef.current || state !== 'connected') {
      console.log('Cannot send message: not connected')
      setError('Not connected')
      return false
    }

    console.log('Sending user_message to channel')
    const result = await channelRef.current.send({
      type: 'broadcast',
      event: 'user_message',
      payload: { content }
    })

    return result === 'ok'
  }, [state])

  const disconnect = useCallback(() => {
    clearReadyTimeout()
    if (channelRef.current) {
      console.log('Disconnecting from channel')
      const channel = channelRef.current
      channelRef.current = null  // Clear ref first so CLOSED callback knows it's expected
      channel.unsubscribe()
    }
    setState('disconnected')
  }, [clearReadyTimeout])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearReadyTimeout()
      if (channelRef.current) {
        const channel = channelRef.current
        channelRef.current = null  // Clear ref first
        channel.unsubscribe()
      }
    }
  }, [clearReadyTimeout])

  return {
    state,
    error,
    connect,
    sendMessage,
    disconnect
  }
}
