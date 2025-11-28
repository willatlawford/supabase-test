import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Todo } from '../types/database'

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTodos()
  }, [])

  async function fetchTodos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching todos:', error)
    } else {
      setTodos(data || [])
    }
    setLoading(false)
  }

  async function addTodo(title: string, categoryId: string | null) {
    const { data, error } = await supabase
      .from('todos')
      .insert({ title, category_id: categoryId })
      .select()
      .single()

    if (error) {
      console.error('Error adding todo:', error)
      return null
    }
    setTodos([data, ...todos])
    return data
  }

  async function toggleTodo(id: string, completed: boolean) {
    const { error } = await supabase
      .from('todos')
      .update({ completed })
      .eq('id', id)

    if (error) {
      console.error('Error toggling todo:', error)
      return false
    }
    setTodos(todos.map(t => t.id === id ? { ...t, completed } : t))
    return true
  }

  async function deleteTodo(id: string) {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting todo:', error)
      return false
    }
    setTodos(todos.filter(t => t.id !== id))
    return true
  }

  return { todos, loading, addTodo, toggleTodo, deleteTodo, refetch: fetchTodos }
}
