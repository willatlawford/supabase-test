import { Sandbox, getSandbox } from '@cloudflare/sandbox';
import { createClient } from '@supabase/supabase-js';
import sandboxBundle from './sandbox-bundle.json';

// Helper to inject agent script into sandbox
async function injectAgent(sandbox: ReturnType<typeof getSandbox>): Promise<void> {
  await sandbox.writeFile('/workspace/agent.js', sandboxBundle['agent.js']);
}

interface Env {
  SANDBOX: DurableObjectNamespace<AgentSandbox>;
  SESSION_STORAGE: R2Bucket;
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT?: string;
}

// Map to track prompt session timeouts (sessionId -> timeout handle)
const promptTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class AgentSandbox extends Sandbox<Env> {
  // sleepAfter is configured per-session via the startProcess call
  // Default to 1 minute for interactive sessions
  sleepAfter = '1m';
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

/**
 * Extract bearer token from Authorization header
 */
function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

// CORS headers for frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Transform localhost URLs for Docker container access
 * Inside Docker, localhost refers to the container, not the host
 */
function toDockerUrl(url: string): string {
  return url.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal');
}

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

    // === Agent API endpoints ===

    // POST /api/agent/start - Start interactive session
    if (url.pathname === '/api/agent/start' && request.method === 'POST') {
      const token = extractToken(request);
      if (!token) {
        return errorResponse('Missing authorization token', 401);
      }

      const userInfo = await verifyToken(env, token);
      if (!userInfo) {
        return errorResponse('Invalid token', 401);
      }

      let body: { sessionId?: string };
      try {
        body = await request.json();
      } catch {
        return errorResponse('Invalid JSON body');
      }

      if (!body.sessionId) {
        return errorResponse('Missing sessionId');
      }

      console.log('Starting interactive session:', body.sessionId, 'for user:', userInfo.userId);

      // Get sandbox instance for this session
      const sandbox = getSandbox(env.SANDBOX, body.sessionId);

      // Inject agent script into sandbox
      await injectAgent(sandbox);

      // Prepare config for the agent script
      // Transform localhost URLs for Docker container access
      const agentConfig = {
        mode: 'interactive' as const,
        sessionId: body.sessionId,
        userId: userInfo.userId,
        accessToken: token,
        supabaseUrl: toDockerUrl(env.SUPABASE_URL),
        supabaseKey: env.SUPABASE_ANON_KEY
      };

      // Start the interactive agent process
      let proc;
      try {
        proc = await sandbox.startProcess(
          'node /workspace/agent.js',
          {
            env: {
              AGENT_CONFIG: JSON.stringify(agentConfig),
              ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY
            }
          }
        );
        console.log('Started interactive agent process:', proc.id);
      } catch (startError) {
        console.error('Failed to start sandbox process:', startError);
        return errorResponse('Failed to start agent: ' + (startError as Error).message, 500);
      }

      return jsonResponse({
        status: 'started',
        channelName: body.sessionId,
        processId: proc.id
      });
    }

    // POST /api/agent/prompt - Start non-interactive prompt session
    if (url.pathname === '/api/agent/prompt' && request.method === 'POST') {
      const token = extractToken(request);
      if (!token) {
        return errorResponse('Missing authorization token', 401);
      }

      const userInfo = await verifyToken(env, token);
      if (!userInfo) {
        return errorResponse('Invalid token', 401);
      }

      let body: { sessionId?: string; prompt?: string };
      try {
        body = await request.json();
      } catch {
        return errorResponse('Invalid JSON body');
      }

      if (!body.sessionId) {
        return errorResponse('Missing sessionId');
      }

      if (!body.prompt) {
        return errorResponse('Missing prompt');
      }

      console.log('Starting prompt session:', body.sessionId, 'for user:', userInfo.userId);

      // Get sandbox instance for this session
      const sandbox = getSandbox(env.SANDBOX, body.sessionId);

      // Inject agent script into sandbox
      await injectAgent(sandbox);

      // Prepare config for the agent script
      // Transform localhost URLs for Docker container access
      const agentConfig = {
        mode: 'non-interactive' as const,
        sessionId: body.sessionId,
        userId: userInfo.userId,
        accessToken: token,
        supabaseUrl: toDockerUrl(env.SUPABASE_URL),
        supabaseKey: env.SUPABASE_ANON_KEY,
        prompt: body.prompt
      };

      // Start the prompt agent process
      let proc;
      try {
        proc = await sandbox.startProcess(
          'node /workspace/agent.js',
          {
            env: {
              AGENT_CONFIG: JSON.stringify(agentConfig),
              ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY
            }
          }
        );
        console.log('Started non-interactive agent process:', proc.id);
      } catch (startError) {
        console.error('Failed to start non-interactive sandbox process:', startError);
        return errorResponse('Failed to start prompt: ' + (startError as Error).message, 500);
      }

      // Set up timeout monitoring for prompt sessions
      // Subscribe to channel and destroy sandbox after 5 minutes of inactivity
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
      const channel = supabase.channel(body.sessionId, {
        config: { broadcast: { ack: false, self: false } }
      });

      let lastActivity = Date.now();

      // Listen for messages to reset timeout
      channel.on('broadcast', { event: 'agent_message' }, () => {
        lastActivity = Date.now();
      });

      channel.subscribe();

      // Check for timeout every minute
      const timeoutCheck = setInterval(async () => {
        const inactiveMs = Date.now() - lastActivity;
        if (inactiveMs >= PROMPT_TIMEOUT_MS) {
          console.log('Prompt session timeout, destroying sandbox:', body.sessionId);
          clearInterval(timeoutCheck);
          promptTimeouts.delete(body.sessionId!);
          await channel.unsubscribe();
          try {
            await sandbox.destroy();
          } catch (e) {
            console.log('Error destroying sandbox:', e);
          }
        }
      }, 60000);

      promptTimeouts.set(body.sessionId, timeoutCheck);

      return jsonResponse({
        status: 'started',
        channelName: body.sessionId,
        processId: proc.id
      });
    }

    // POST /api/agent/keepalive - Reset sleep timer for interactive session
    if (url.pathname === '/api/agent/keepalive' && request.method === 'POST') {
      const token = extractToken(request);
      if (!token) {
        return errorResponse('Missing authorization token', 401);
      }

      const userInfo = await verifyToken(env, token);
      if (!userInfo) {
        return errorResponse('Invalid token', 401);
      }

      let body: { sessionId?: string };
      try {
        body = await request.json();
      } catch {
        return errorResponse('Invalid JSON body');
      }

      if (!body.sessionId) {
        return errorResponse('Missing sessionId');
      }

      console.log('Keepalive for session:', body.sessionId);

      // Get sandbox and run a command to reset the sleep timer
      const sandbox = getSandbox(env.SANDBOX, body.sessionId);
      try {
        await sandbox.exec('echo keepalive');
      } catch (e) {
        // Sandbox may have already slept, which is fine
        console.log('Keepalive exec failed (sandbox may be asleep):', e);
      }

      return jsonResponse({ status: 'ok' });
    }

    // Serve static assets for all other routes (SPA fallback)
    // Try to fetch the exact path first, then fall back to index.html for SPA routing
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch {
      // Asset not found, continue to SPA fallback
    }

    // SPA fallback: serve index.html for client-side routing
    const indexRequest = new Request(new URL('/', request.url).toString(), request);
    return env.ASSETS.fetch(indexRequest);
  }
};
