export interface Category {
  id: string
  name: string
  user_id: string
  created_at: string
}

export interface Todo {
  id: string
  title: string
  completed: boolean
  category_id: string | null
  user_id: string
  created_at: string
}

export interface TodoWithCategory extends Todo {
  category: Category | null
}
