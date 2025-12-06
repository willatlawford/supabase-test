import type { ChatMessage as ChatMessageType } from '../hooks/useChat'

interface ChatMessageProps {
  message: ChatMessageType
}

function formatToolName(name: string): string {
  // Convert mcp__todos__ListTodos to "List Todos"
  const parts = name.split('__')
  const toolName = parts[parts.length - 1]
  // Insert space before capital letters
  return toolName.replace(/([A-Z])/g, ' $1').trim()
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isToolUse = message.role === 'tool_use'
  const isSlashOutput = message.role === 'slash_output'

  if (isToolUse) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-lg px-3 py-2 bg-purple-50 border border-purple-200 text-purple-900 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {formatToolName(message.toolName || 'Unknown Tool')}
          </div>
          {message.toolInput && Object.keys(message.toolInput).length > 0 && (
            <pre className="mt-1 text-xs text-purple-700 bg-purple-100 rounded p-1.5 overflow-x-auto">
              {JSON.stringify(message.toolInput, null, 2)}
            </pre>
          )}
          <p className="text-xs mt-1 text-purple-400">
            {message.timestamp.toLocaleTimeString()}
          </p>
        </div>
      </div>
    )
  }

  if (isSlashOutput) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-lg px-3 py-2 bg-teal-50 border border-teal-200 text-teal-900 text-sm">
          <div className="flex items-center gap-2 font-medium text-teal-700">
            <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Command Output
          </div>
          <pre className="mt-1 text-xs text-teal-800 bg-teal-100 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {message.content}
          </pre>
          <p className="text-xs mt-1 text-teal-400">
            {message.timestamp.toLocaleTimeString()}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <p className={`text-xs mt-1 ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
