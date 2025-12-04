import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Category } from '../types/database'

export function useCategories() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!user
  })

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('categories')
        .insert({ name, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  })

  return {
    categories,
    loading: isLoading,
    addCategory: (name: string) => addMutation.mutate(name),
    deleteCategory: (id: string) => deleteMutation.mutate(id),
    refetch: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  }
}
