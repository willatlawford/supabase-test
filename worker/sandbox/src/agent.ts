// Unified agent script - handles both interactive and non-interactive modes
// Config passed via AGENT_CONFIG env var as JSON:
// { mode, sessionId, userId, accessToken, supabaseUrl, supabaseKey, prompt? }

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AgentChannel } from './channel.js';
import { createMcpServer } from './tools.js';
import {
  formatReady,
  formatAssistantMessage,
  formatToolUse,
  formatSlashOutput,
  formatError,
  formatComplete
} from './messages.js';

interface AgentConfig {
  mode: 'interactive' | 'non-interactive';
  sessionId: string;
  userId: string;
  accessToken: string;
  supabaseUrl: string;
  supabaseKey: string;
  prompt?: string; // Required for non-interactive mode
}

const config: AgentConfig = JSON.parse(process.env.AGENT_CONFIG!);

async function main() {
  const isInteractive = config.mode === 'interactive';
  console.log(`Starting ${config.mode} agent for session:`, config.sessionId);

  if (!isInteractive && !config.prompt) {
    console.error('Non-interactive mode requires a prompt');
    process.exit(1);
  }

  // Connect to Supabase channel
  const channel = new AgentChannel(
    config.supabaseUrl,
    config.supabaseKey,
    config.sessionId,
    config.accessToken
  );

  await channel.connect();
  console.log('Connected to channel:', config.sessionId);

  // Send ready message
  await channel.send(formatReady());

  // Create Supabase client for database operations
  const userSupabase = createClient(config.supabaseUrl, config.supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${config.accessToken}`
      }
    }
  });

  // Create MCP server with tools
  const mcpServer = await createMcpServer(userSupabase, config.userId, {
    tool,
    createSdkMcpServer,
    z
  });

  console.log(`Starting query with ${isInteractive ? 'messageGenerator' : 'static prompt'}...`);

  try {
    const result = query({
      prompt: isInteractive ? channel.messageGenerator() : config.prompt!,
      options: {
        model: 'claude-sonnet-4-20250514',
        systemPrompt: `You are a helpful assistant that can manage todos for the current user.
Use the ListTodos, AddTodo, DeleteTodo, and ToggleTodo tools to help users manage their tasks.
When listing todos, present them in a readable format.
Respond concisely and helpfully.`,
        mcpServers: {
          todos: mcpServer
        },
        allowedTools: [
          'mcp__todos__ListTodos',
          'mcp__todos__AddTodo',
          'mcp__todos__DeleteTodo',
          'mcp__todos__ToggleTodo',
          'Skill', 'Read', 'Write', 'Edit', 'WebSearch'
        ],
        maxTurns: 100
      }
    });

    // Process responses as they stream in
    for await (const msg of result) {
      console.log('Agent message:', msg.type, (msg as { subtype?: string }).subtype || '');

      if (msg.type === 'assistant') {
        const content = (msg as { message?: { content?: unknown } }).message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              console.log('Sending tool_use:', block.name);
              await channel.send(formatToolUse(block.name, block.input));
            } else if (block.type === 'text' && block.text) {
              console.log('Sending assistant message');
              await channel.send(formatAssistantMessage(block.text));
            }
          }
        } else if (typeof content === 'string' && content) {
          await channel.send(formatAssistantMessage(content));
        }
      }

      // Check for slash command output in user messages
      if (msg.type === 'user') {
        const content = (msg as { message?: { content?: unknown } }).message?.content;
        if (typeof content === 'string') {
          const match = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
          if (match) {
            console.log('Sending slash_output');
            await channel.send(formatSlashOutput(match[1].trim()));
          }
        }
      }

      if (msg.type === 'result') {
        console.log('Query result received');
      }
    }

    // Non-interactive mode: send completion and exit
    if (!isInteractive) {
      console.log('Query completed, sending complete message');
      await channel.send(formatComplete('success'));
    }

    console.log('Query session ended');
  } catch (err) {
    console.error('Query error:', err);
    await channel.send(formatError((err as Error).message || 'Query error'));
  } finally {
    await channel.disconnect();

    // Non-interactive mode exits after completion
    if (!isInteractive) {
      console.log('Agent finished, exiting');
      process.exit(0);
    }
  }
}

main().catch(err => {
  console.error('Agent error:', err);
  process.exit(1);
});
