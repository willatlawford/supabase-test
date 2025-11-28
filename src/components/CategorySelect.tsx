import type { Category } from '../types/database'

interface CategorySelectProps {
  categories: Category[]
  value: string | null
  onChange: (categoryId: string | null) => void
}

export function CategorySelect({ categories, value, onChange }: CategorySelectProps) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      <option value="">No category</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  )
}
