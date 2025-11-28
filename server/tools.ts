import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createTodoTools(supabase: SupabaseClient) {
  const listTodos = tool(
    'ListTodos',
    'List all todos, optionally filtered by category or completion status',
    {
      categoryId: z.string().optional().describe('Filter by category ID'),
      completed: z.boolean().optional().describe('Filter by completion status')
    },
    async (args) => {
      console.log('[ListTodos] Called with args:', args)
      try {
        let query = supabase.from('todos').select('*, categories(name)')
        if (args.categoryId) query = query.eq('category_id', args.categoryId)
        if (args.completed !== undefined) query = query.eq('completed', args.completed)
        const { data, error } = await query.order('created_at', { ascending: false })

        console.log('[ListTodos] Result:', { data, error })

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (err) {
        console.error('[ListTodos] Exception:', err)
        return { content: [{ type: 'text' as const, text: `Exception: ${err}` }], isError: true }
      }
    }
  )

  const addTodo = tool(
    'AddTodo',
    'Create a new todo item',
    {
      title: z.string().describe('The todo title'),
      categoryId: z.string().optional().describe('Optional category ID')
    },
    async (args) => {
      const { data, error } = await supabase
        .from('todos')
        .insert({ title: args.title, category_id: args.categoryId })
        .select()
        .single()

      if (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: `Created todo: ${JSON.stringify(data)}` }] }
    }
  )

  const deleteTodo = tool(
    'DeleteTodo',
    'Delete a todo by its ID',
    {
      id: z.string().describe('The todo ID to delete')
    },
    async (args) => {
      const { error } = await supabase.from('todos').delete().eq('id', args.id)

      if (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: `Deleted todo ${args.id}` }] }
    }
  )

  const toggleTodo = tool(
    'ToggleTodo',
    'Toggle the completion status of a todo',
    {
      id: z.string().describe('The todo ID'),
      completed: z.boolean().describe('The new completion status')
    },
    async (args) => {
      const { data, error } = await supabase
        .from('todos')
        .update({ completed: args.completed })
        .eq('id', args.id)
        .select()
        .single()

      if (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: `Updated todo: ${JSON.stringify(data)}` }] }
    }
  )

  return createSdkMcpServer({
    name: 'todos',
    version: '1.0.0',
    tools: [listTodos, addTodo, deleteTodo, toggleTodo]
  })
}
