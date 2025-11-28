import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Todo } from '../types/database'

export function useTodos() {
  const queryClient = useQueryClient()

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: async (): Promise<Todo[]> => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }
  })

  const addMutation = useMutation({
    mutationFn: async ({ title, categoryId }: { title: string; categoryId: string | null }) => {
      const { data, error } = await supabase
        .from('todos')
        .insert({ title, category_id: categoryId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] })
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from('todos').update({ completed }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] })
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('todos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] })
  })

  return {
    todos,
    loading: isLoading,
    addTodo: (title: string, categoryId: string | null) => addMutation.mutate({ title, categoryId }),
    toggleTodo: (id: string, completed: boolean) => toggleMutation.mutate({ id, completed }),
    deleteTodo: (id: string) => deleteMutation.mutate(id),
    refetch: () => queryClient.invalidateQueries({ queryKey: ['todos'] })
  }
}
