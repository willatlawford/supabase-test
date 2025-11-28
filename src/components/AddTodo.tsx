import { useState } from 'react'
import { CategorySelect } from './CategorySelect'
import type { Category } from '../types/database'

interface AddTodoProps {
  categories: Category[]
  onAdd: (title: string, categoryId: string | null) => void
}

export function AddTodo({ categories, onAdd }: AddTodoProps) {
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), categoryId)
    setTitle('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a new todo..."
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <CategorySelect
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Add
      </button>
    </form>
  )
}
