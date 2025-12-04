import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useRealtimeSync(userId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log('[Realtime] todos changed:', payload.eventType)
          queryClient.invalidateQueries({ queryKey: ['todos'] })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log('[Realtime] categories changed:', payload.eventType)
          queryClient.invalidateQueries({ queryKey: ['categories'] })
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] subscription status:', status)
      })

    return () => {
      channel.unsubscribe()
    }
  }, [queryClient, userId])
}
