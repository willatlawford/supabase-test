import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useRealtimeSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, (payload) => {
        console.log('[Realtime] todos changed:', payload.eventType)
        queryClient.invalidateQueries({ queryKey: ['todos'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
        console.log('[Realtime] categories changed:', payload.eventType)
        queryClient.invalidateQueries({ queryKey: ['categories'] })
      })
      .subscribe((status) => {
        console.log('[Realtime] subscription status:', status)
      })

    return () => {
      channel.unsubscribe()
    }
  }, [queryClient])
}
