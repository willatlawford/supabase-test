import { useState } from 'react'
import type { Category } from '../types/database'

interface CategoryManagerProps {
  categories: Category[]
  onAdd: (name: string) => void
  onDelete: (id: string) => void
}

export function CategoryManager({ categories, onAdd, onDelete }: CategoryManagerProps) {
  const [name, setName] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
      >
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Manage Categories
      </button>

      {isOpen && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg">
          <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New category name..."
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Add
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <span
                key={category.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-sm"
              >
                {category.name}
                <button
                  onClick={() => onDelete(category.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
