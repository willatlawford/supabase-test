import { Container, getContainer } from '@cloudflare/containers';
import { createClient } from '@supabase/supabase-js';

interface Env {
  CONTAINER: DurableObjectNamespace<ChatContainer>;
  SESSION_STORAGE: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
}

export class ChatContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '5m';

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    // Set environment variables for the container
    this.envVars = {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    };
  }
}

/**
 * Verify JWT token and extract user info
 */
async function verifyToken(env: Env, token: string): Promise<{ userId: string } | null> {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { userId: user.id };
  } catch {
    return null;
  }
}

// CORS headers for frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { headers: corsHeaders });
    }

    // WebSocket endpoint - verify auth then forward to container
    if (url.pathname === '/ws') {
      console.log('WebSocket request received');

      // Check for WebSocket upgrade
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket upgrade', {
          status: 426,
          headers: corsHeaders
        });
      }

      // Extract token from query param
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response(JSON.stringify({ error: 'Missing token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verify token
      const userInfo = await verifyToken(env, token);
      if (!userInfo) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Authenticated user:', userInfo.userId);

      // Get user's container
      const container = getContainer(env.CONTAINER, userInfo.userId);

      // Wake up container with a health check first (prevents WebSocket timeout during cold start)
      console.log('Waking up container...');
      try {
        const healthCheck = new Request('http://localhost:8080/');
        const healthResponse = await container.fetch(healthCheck);
        console.log('Container health check:', healthResponse.status);
      } catch (e) {
        console.log('Container wake-up error (may be normal):', e);
      }

      // Add userId to the request URL so container can read it
      const containerUrl = new URL(request.url);
      containerUrl.searchParams.set('userId', userInfo.userId);
      const containerRequest = new Request(containerUrl.toString(), request);

      // Forward entire request to container (including WebSocket upgrade)
      console.log('Forwarding WebSocket to container...');
      return container.fetch(containerRequest);
    }

    return new Response('Chat Agent API - WebSocket /ws', { headers: corsHeaders });
  }
};
