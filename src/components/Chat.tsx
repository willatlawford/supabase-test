import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useChat } from '../hooks/useChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'

export function Chat() {
  const { user, session } = useAuth()
  const { messages, sendMessage, isLoading, clearMessages } = useChat({
    userId: user?.id ?? '',
    accessToken: session?.access_token ?? ''
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-700">Chat with Claude</h2>
        <button
          onClick={clearMessages}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear chat
        </button>
      </div>

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
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}
