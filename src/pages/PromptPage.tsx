import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { usePrompt } from '../hooks/usePrompt'
import { MessageList } from '../components/MessageList'

export function PromptPage() {
  const { session } = useAuth()
  const [promptText, setPromptText] = useState('')

  const {
    messages,
    runPrompt,
    reset,
    isRunning,
    isComplete,
    currentPrompt,
    error,
    connectionState
  } = usePrompt({
    accessToken: session?.access_token ?? '',
    workerUrl: import.meta.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8789'
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!promptText.trim() || isRunning) return
    runPrompt(promptText.trim())
  }

  const handleReset = () => {
    reset()
    setPromptText('')
  }

  // Connection status indicator
  const statusColor = isComplete
    ? 'bg-green-500'
    : isRunning
    ? 'bg-yellow-500'
    : 'bg-gray-400'

  const statusText = isComplete
    ? 'Complete'
    : isRunning
    ? connectionState === 'connected'
      ? 'Running...'
      : 'Starting...'
    : 'Ready'

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-700">Run Prompt</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            {statusText}
          </div>
        </div>
        {(isRunning || isComplete) && (
          <button
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            New prompt
          </button>
        )}
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Prompt input form - shown when not running */}
      {!isRunning && !isComplete && (
        <form onSubmit={handleSubmit} className="mb-4">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Enter your prompt... (e.g., 'List all my todos and add a new one called Buy groceries')"
            rows={4}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={isRunning}
          />
          <button
            type="submit"
            disabled={!promptText.trim() || isRunning}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Go
          </button>
        </form>
      )}

      {/* Show prompt and results when running or complete */}
      {(isRunning || isComplete) && (
        <>
          {/* Show the submitted prompt */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Your Prompt
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{currentPrompt}</p>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto bg-white rounded-lg border border-gray-200 p-4">
            <MessageList
              messages={messages}
              emptyMessage={isRunning ? 'Waiting for agent response...' : 'No messages'}
            />
          </div>

          {/* Completion indicator */}
          {isComplete && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Prompt completed successfully
            </div>
          )}
        </>
      )}

      {/* Initial state - no prompt submitted yet */}
      {!isRunning && !isComplete && messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="font-medium">Non-interactive Mode</p>
            <p className="text-sm mt-1">Enter a prompt and the agent will execute it autonomously.</p>
            <p className="text-sm">You'll see the progress but can't send additional messages.</p>
          </div>
        </div>
      )}
    </div>
  )
}
