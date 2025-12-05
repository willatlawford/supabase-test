import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useChat } from '../hooks/useChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'

export function Chat() {
  const { session } = useAuth()

  const { messages, sendMessage, clearMessages, error, connectionState } = useChat({
    accessToken: session?.access_token ?? '',
    workerUrl: import.meta.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8789'
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Connection status indicator
  const connectionStatusColor = {
    disconnected: 'bg-red-500',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    reconnecting: 'bg-yellow-500'
  }[connectionState]

  const connectionStatusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    reconnecting: 'Reconnecting...'
  }[connectionState]

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-700">Chat with Claude</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className={`w-2 h-2 rounded-full ${connectionStatusColor}`} />
            {connectionStatusText}
          </div>
        </div>
        <button
          onClick={clearMessages}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear chat
        </button>
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-white rounded-lg border border-gray-200 p-4 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            Start a conversation...
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput onSend={sendMessage} disabled={connectionState !== 'connected'} />
    </div>
  )
}
