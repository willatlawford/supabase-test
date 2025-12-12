import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Required: Supabase Realtime expects globalThis.WebSocket in Node.js
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

interface UserMessage {
  content: string;
}

export class AgentChannel {
  private supabase: SupabaseClient;
  private channelName: string;
  private channel: RealtimeChannel | null = null;
  private messageQueue: UserMessage[] = [];
  private resolveNext: (() => void) | null = null;
  private connected = false;

  constructor(supabaseUrl: string, supabaseKey: string, channelName: string, accessToken: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    this.channelName = channelName;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.channel = this.supabase.channel(this.channelName, {
        config: { broadcast: { ack: true, self: false } }
      });

      // Listen for incoming messages from frontend
      this.channel.on('broadcast', { event: 'user_message' }, (payload) => {
        console.log('Received user_message:', payload.payload);
        this.messageQueue.push(payload.payload as UserMessage);
        if (this.resolveNext) {
          this.resolveNext();
          this.resolveNext = null;
        }
      });

      this.channel.subscribe((status, err) => {
        console.log('Channel status:', status);
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Failed to subscribe to channel: ' + (err?.message || 'unknown')));
        } else if (status === 'TIMED_OUT') {
          reject(new Error('Channel subscription timed out'));
        }
      });
    });
  }

  // Send message to frontend
  async send(message: Record<string, unknown>): Promise<unknown> {
    if (!this.channel || !this.connected) {
      throw new Error('Channel not connected');
    }
    console.log('Sending to channel:', message.type);
    return this.channel.send({
      type: 'broadcast',
      event: 'agent_message',
      payload: message
    });
  }

  // AsyncGenerator for interactive mode (messageGenerator pattern)
  async *messageGenerator(): AsyncGenerator<{ type: string; message: { role: string; content: string } }> {
    while (this.connected) {
      if (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()!;
        console.log('Yielding message to agent:', msg.content?.substring(0, 50));
        yield {
          type: 'user',
          message: {
            role: 'user',
            content: msg.content
          }
        };
      } else {
        // Wait for next message
        await new Promise<void>(resolve => { this.resolveNext = resolve; });
      }
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.resolveNext) {
      this.resolveNext();
      this.resolveNext = null;
    }
    if (this.channel) {
      await this.channel.unsubscribe();
    }
  }
}
