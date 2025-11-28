export interface Category {
  id: string
  name: string
  created_at: string
}

export interface Todo {
  id: string
  title: string
  completed: boolean
  category_id: string | null
  created_at: string
}

export interface TodoWithCategory extends Todo {
  category: Category | null
}
