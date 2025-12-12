import type { SupabaseClient } from '@supabase/supabase-js';
import type { z as ZodType } from 'zod';

// Types for the SDK modules passed in
interface SdkModules {
  tool: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<ToolResult>
  ) => unknown;
  createSdkMcpServer: (config: { name: string; version: string; tools: unknown[] }) => unknown;
  z: typeof ZodType;
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// MCP tool definitions for todo management
export async function createMcpServer(
  db: SupabaseClient,
  userId: string,
  modules: SdkModules
): Promise<unknown> {
  const { tool, createSdkMcpServer, z } = modules;

  const listTodos = tool(
    'ListTodos',
    'List all todos for the current user, optionally filtered by category or completion status',
    {
      categoryId: z.string().optional().describe('Filter by category ID'),
      completed: z.boolean().optional().describe('Filter by completion status')
    },
    async (args: { categoryId?: string; completed?: boolean }) => {
      try {
        let q = db.from('todos').select('*, categories(name)');
        if (args.categoryId) q = q.eq('category_id', args.categoryId);
        if (args.completed !== undefined) q = q.eq('completed', args.completed);
        const { data, error } = await q.order('created_at', { ascending: false });

        if (error) {
          return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Exception: ${err}` }], isError: true };
      }
    }
  );

  const addTodo = tool(
    'AddTodo',
    'Create a new todo item for the current user',
    {
      title: z.string().describe('The todo title'),
      categoryId: z.string().optional().describe('Optional category ID')
    },
    async (args: { title: string; categoryId?: string }) => {
      const { data, error } = await db
        .from('todos')
        .insert({
          title: args.title,
          category_id: args.categoryId,
          user_id: userId
        })
        .select()
        .single();

      if (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Created todo: ${JSON.stringify(data)}` }] };
    }
  );

  const deleteTodo = tool(
    'DeleteTodo',
    'Delete a todo by its ID (only works for current user\'s todos)',
    {
      id: z.string().describe('The todo ID to delete')
    },
    async (args: { id: string }) => {
      const { error } = await db.from('todos').delete().eq('id', args.id);

      if (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Deleted todo ${args.id}` }] };
    }
  );

  const toggleTodo = tool(
    'ToggleTodo',
    'Toggle the completion status of a todo (only works for current user\'s todos)',
    {
      id: z.string().describe('The todo ID'),
      completed: z.boolean().describe('The new completion status')
    },
    async (args: { id: string; completed: boolean }) => {
      const { data, error } = await db
        .from('todos')
        .update({ completed: args.completed })
        .eq('id', args.id)
        .select()
        .single();

      if (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Updated todo: ${JSON.stringify(data)}` }] };
    }
  );

  return createSdkMcpServer({
    name: 'todos',
    version: '1.0.0',
    tools: [listTodos, addTodo, deleteTodo, toggleTodo]
  });
}
