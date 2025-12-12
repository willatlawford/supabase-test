// Message types sent TO frontend (from agent)
export const MessageTypes = {
  READY: 'ready',
  ASSISTANT_MESSAGE: 'assistant_message',
  TOOL_USE: 'tool_use',
  SLASH_OUTPUT: 'slash_output',
  ERROR: 'error',
  COMPLETE: 'complete'
} as const;

// Message types received FROM frontend (to agent)
export const ClientMessageTypes = {
  USER_MESSAGE: 'user_message'
} as const;

export interface AgentMessage {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

// Format outgoing message with timestamp
export function formatMessage(type: string, data: Record<string, unknown> = {}): AgentMessage {
  return {
    type,
    timestamp: Date.now(),
    ...data
  };
}

// Format ready message
export function formatReady(): AgentMessage {
  return formatMessage(MessageTypes.READY);
}

// Format assistant response
export function formatAssistantMessage(content: string): AgentMessage {
  return formatMessage(MessageTypes.ASSISTANT_MESSAGE, { content });
}

// Format tool use
export function formatToolUse(toolName: string, toolInput: unknown): AgentMessage {
  return formatMessage(MessageTypes.TOOL_USE, { toolName, toolInput });
}

// Format slash command output
export function formatSlashOutput(content: string): AgentMessage {
  return formatMessage(MessageTypes.SLASH_OUTPUT, { content });
}

// Format error
export function formatError(message: string): AgentMessage {
  return formatMessage(MessageTypes.ERROR, { message });
}

// Format completion (for non-interactive mode)
export function formatComplete(result: string): AgentMessage {
  return formatMessage(MessageTypes.COMPLETE, { result });
}
