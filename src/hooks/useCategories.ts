import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category } from '../types/database'

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    setLoading(true)
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
    } else {
      setCategories(data || [])
    }
    setLoading(false)
  }

  async function addCategory(name: string) {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .select()
      .single()

    if (error) {
      console.error('Error adding category:', error)
      return null
    }
    setCategories([...categories, data])
    return data
  }

  async function deleteCategory(id: string) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting category:', error)
      return false
    }
    setCategories(categories.filter(c => c.id !== id))
    return true
  }

  return { categories, loading, addCategory, deleteCategory, refetch: fetchCategories }
}
