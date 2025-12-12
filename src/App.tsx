import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useTodos } from './hooks/useTodos'
import { useCategories } from './hooks/useCategories'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import { TodoList } from './components/TodoList'
import { AddTodo } from './components/AddTodo'
import { CategoryManager } from './components/CategoryManager'
import { CategorySelect } from './components/CategorySelect'
import { Chat } from './components/Chat'
import { PromptPage } from './pages/PromptPage'
import { Auth } from './components/Auth'

type Tab = 'todos' | 'chat' | 'prompt'

function App() {
  const { user, session, loading: authLoading, signOut } = useAuth()
  useRealtimeSync(user?.id) // Sync external DB changes (e.g., from chat agent)
  const [activeTab, setActiveTab] = useState<Tab>('todos')
  const { todos, loading: todosLoading, addTodo, toggleTodo, deleteTodo } = useTodos()
  const { categories, loading: categoriesLoading, addCategory, deleteCategory } = useCategories()
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const loading = todosLoading || categoriesLoading

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
        <div className="flex gap-1 mb-6 bg-gray-200 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('todos')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'todos'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'prompt'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Prompt
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'todos' ? (
          <>
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <AddTodo
                categories={categories}
                onAdd={(title, categoryId) => addTodo(title, categoryId)}
              />
            </div>

            <CategoryManager
              categories={categories}
              onAdd={addCategory}
              onDelete={deleteCategory}
            />

            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-600">Filter by:</span>
              <CategorySelect
                categories={categories}
                value={filterCategory}
                onChange={setFilterCategory}
              />
              {filterCategory && (
                <button
                  onClick={() => setFilterCategory(null)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : (
              <TodoList
                todos={todos}
                categories={categories}
                filterCategory={filterCategory}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
              />
            )}
          </>
        ) : activeTab === 'chat' ? (
          <Chat />
        ) : (
          <PromptPage />
        )}
      </div>
    </div>
  )
}

export default App
