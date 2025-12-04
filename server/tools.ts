import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

/**
 * Creates MCP tools with a user-scoped Supabase client.
 * RLS policies will automatically filter data by user_id.
 */
export function createUserTodoTools(accessToken: string, userId: string) {
  // Create Supabase client authenticated as the user
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  })

  const listTodos = tool(
    'ListTodos',
    'List all todos for the current user, optionally filtered by category or completion status',
    {
      categoryId: z.string().optional().describe('Filter by category ID'),
      completed: z.boolean().optional().describe('Filter by completion status')
    },
    async (args) => {
      console.log(`[ListTodos] User ${userId} called with args:`, args)
      try {
        let query = supabase.from('todos').select('*, categories(name)')
        if (args.categoryId) query = query.eq('category_id', args.categoryId)
        if (args.completed !== undefined) query = query.eq('completed', args.completed)
        const { data, error } = await query.order('created_at', { ascending: false })

        console.log(`[ListTodos] User ${userId} result:`, { count: data?.length, error })

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (err) {
        console.error(`[ListTodos] User ${userId} exception:`, err)
        return { content: [{ type: 'text' as const, text: `Exception: ${err}` }], isError: true }
      }
    }
  )

  const addTodo = tool(
    'AddTodo',
    'Create a new todo item for the current user',
    {
      title: z.string().describe('The todo title'),
      categoryId: z.string().optional().describe('Optional category ID')
    },
    async (args) => {
      console.log(`[AddTodo] User ${userId} creating:`, args.title)
      const { data, error } = await supabase
        .from('todos')
        .insert({
          title: args.title,
          category_id: args.categoryId,
          user_id: userId // Explicitly set user_id for RLS
        })
        .select()
        .single()

      if (error) {
        console.error(`[AddTodo] User ${userId} error:`, error)
        return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: `Created todo: ${JSON.stringify(data)}` }] }
    }
  )

  const deleteTodo = tool(
    'DeleteTodo',
    'Delete a todo by its ID (only works for current user\'s todos)',
    {
      id: z.string().describe('The todo ID to delete')
    },
    async (args) => {
      console.log(`[DeleteTodo] User ${userId} deleting:`, args.id)
      const { error } = await supabase.from('todos').delete().eq('id', args.id)

      if (error) {
        console.error(`[DeleteTodo] User ${userId} error:`, error)
        return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: `Deleted todo ${args.id}` }] }
    }
  )

  const toggleTodo = tool(
    'ToggleTodo',
    'Toggle the completion status of a todo (only works for current user\'s todos)',
    {
      id: z.string().describe('The todo ID'),
      completed: z.boolean().describe('The new completion status')
    },
    async (args) => {
      console.log(`[ToggleTodo] User ${userId} toggling:`, args.id, args.completed)
      const { data, error } = await supabase
        .from('todos')
        .update({ completed: args.completed })
        .eq('id', args.id)
        .select()
        .single()

      if (error) {
        console.error(`[ToggleTodo] User ${userId} error:`, error)
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
