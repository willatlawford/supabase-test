import { useState, useCallback, useRef } from 'react'
import { useChannel, type ChannelMessage } from './useChannel'

export interface PromptMessage {
  id: string
  type: 'assistant_message' | 'tool_use' | 'slash_output' | 'error'
  content: string
  timestamp: Date
  toolName?: string
  toolInput?: Record<string, unknown>
}

interface UsePromptOptions {
  accessToken: string
  workerUrl?: string
}

export function usePrompt({
  accessToken,
  workerUrl = 'http://localhost:8789'
}: UsePromptOptions) {
  const [messages, setMessages] = useState<PromptMessage[]>([])
  const [promptError, setPromptError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null)

  const runningRef = useRef(false)

  // Handle incoming messages from the channel
  const handleMessage = useCallback((msg: ChannelMessage) => {
    if (msg.type === 'ready') {
      // Agent is ready, nothing to display
      return
    }

    if (msg.type === 'complete') {
      // Handled by onComplete callback
      return
    }

    // Add message to display
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      type: msg.type as PromptMessage['type'],
      content: msg.content || '',
      timestamp: new Date(),
      toolName: msg.toolName,
      toolInput: msg.toolInput
    }])
  }, [])

  const handleReady = useCallback(() => {
    console.log('Prompt agent ready')
    setPromptError(null)
  }, [])

  const handleComplete = useCallback(() => {
    console.log('Prompt completed')
    setIsRunning(false)
    setIsComplete(true)
    runningRef.current = false
  }, [])

  const handleError = useCallback((message: string) => {
    setPromptError(message)
    setIsRunning(false)
    runningRef.current = false
  }, [])

  const {
    state: connectionState,
    error: channelError,
    connect: connectChannel,
    disconnect
  } = useChannel({
    onMessage: handleMessage,
    onReady: handleReady,
    onComplete: handleComplete,
    onError: handleError
  })

  const runPrompt = useCallback(async (prompt: string) => {
    if (!accessToken) {
      setPromptError('Not authenticated')
      return
    }

    if (runningRef.current) {
      setPromptError('A prompt is already running')
      return
    }

    // Generate new session ID for this prompt run
    const newSessionId = crypto.randomUUID()
    setMessages([])
    setIsRunning(true)
    setIsComplete(false)
    setPromptError(null)
    setCurrentPrompt(prompt)
    runningRef.current = true

    try {
      // Start sandbox with prompt
      console.log('Starting prompt session:', newSessionId)
      const response = await fetch(`${workerUrl}/api/agent/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          sessionId: newSessionId,
          prompt
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to start prompt')
      }

      console.log('Prompt session started, connecting to channel...')

      // Connect to channel to receive messages
      await connectChannel(newSessionId)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to run prompt'
      setPromptError(message)
      setIsRunning(false)
      runningRef.current = false
    }
  }, [accessToken, workerUrl, connectChannel])

  const reset = useCallback(() => {
    disconnect()
    setMessages([])
    setPromptError(null)
    setIsRunning(false)
    setIsComplete(false)
    setCurrentPrompt(null)
    runningRef.current = false
  }, [disconnect])

  return {
    messages,
    runPrompt,
    reset,
    isRunning,
    isComplete,
    currentPrompt,
    error: promptError || channelError,
    connectionState
  }
}
