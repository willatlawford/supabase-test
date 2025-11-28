import { TodoItem } from './TodoItem'
import type { Todo, Category } from '../types/database'

interface TodoListProps {
  todos: Todo[]
  categories: Category[]
  filterCategory: string | null
  onToggle: (id: string, completed: boolean) => void
  onDelete: (id: string) => void
}

export function TodoList({ todos, categories, filterCategory, onToggle, onDelete }: TodoListProps) {
  const filteredTodos = filterCategory
    ? todos.filter((t) => t.category_id === filterCategory)
    : todos

  const getCategoryById = (id: string | null) =>
    categories.find((c) => c.id === id) || null

  if (filteredTodos.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No todos yet. Add one above!
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {filteredTodos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          category={getCategoryById(todo.category_id)}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
