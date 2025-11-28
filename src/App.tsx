import { useState } from 'react'
import { useTodos } from './hooks/useTodos'
import { useCategories } from './hooks/useCategories'
import { TodoList } from './components/TodoList'
import { AddTodo } from './components/AddTodo'
import { CategoryManager } from './components/CategoryManager'
import { CategorySelect } from './components/CategorySelect'
import { Chat } from './components/Chat'

type Tab = 'todos' | 'chat'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('todos')
  const { todos, loading: todosLoading, addTodo, toggleTodo, deleteTodo } = useTodos()
  const { categories, loading: categoriesLoading, addCategory, deleteCategory } = useCategories()
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const loading = todosLoading || categoriesLoading

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Supabase App</h1>

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
        ) : (
          <Chat />
        )}
      </div>
    </div>
  )
}

export default App
