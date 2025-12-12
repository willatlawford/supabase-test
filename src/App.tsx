import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import { TodosPage } from './pages/TodosPage'
import { ChatPage } from './pages/ChatPage'
import { PromptPage } from './pages/PromptPage'
import { Auth } from './components/Auth'

function App() {
  const { user, session, loading: authLoading, signOut } = useAuth()
  useRealtimeSync(user?.id) // Sync external DB changes (e.g., from chat agent)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!user || !session) {
    return <Auth />
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Supabase App</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="flex gap-1 mb-6 bg-gray-200 p-1 rounded-lg">
          <NavLink
            to="/todos"
            className={({ isActive }) =>
              `flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors text-center ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`
            }
          >
            Todos
          </NavLink>
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors text-center ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`
            }
          >
            Chat
          </NavLink>
          <NavLink
            to="/prompt"
            className={({ isActive }) =>
              `flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors text-center ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`
            }
          >
            Prompt
          </NavLink>
        </nav>

        {/* Route content */}
        <Routes>
          <Route path="/" element={<Navigate to="/todos" replace />} />
          <Route path="/todos" element={<TodosPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/prompt" element={<PromptPage />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
