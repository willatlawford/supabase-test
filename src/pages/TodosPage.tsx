import { useState } from 'react'
import { useTodos } from '../hooks/useTodos'
import { useCategories } from '../hooks/useCategories'
import { TodoList } from '../components/TodoList'
import { AddTodo } from '../components/AddTodo'
import { CategoryManager } from '../components/CategoryManager'
import { CategorySelect } from '../components/CategorySelect'

export function TodosPage() {
  const { todos, loading: todosLoading, addTodo, toggleTodo, deleteTodo } = useTodos()
  const { categories, loading: categoriesLoading, addCategory, deleteCategory } = useCategories()
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const loading = todosLoading || categoriesLoading

  return (
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
  )
}
