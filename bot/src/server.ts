import Fastify from 'fastify';
import { runAgent } from './agent.js';
import type { LlmConfig } from './llm.js';

const PORT = Number(process.env.PORT || 3002);

// Everything this container is allowed to know. No database, no session secret,
// no OAuth credentials — see bot/src/mcp-client.ts for why.
const llm: LlmConfig = {
  baseUrl: required('LLM_BASE_URL'),
  model: required('LLM_MODEL'),
  headers: {
    ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
    ...(process.env.CF_ACCESS_CLIENT_ID
      ? {
          'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
          'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET ?? '',
        }
      : {}),
  },
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

app.get('/health', async () => ({ status: 'ok', model: llm.model }));

/**
 * One chat exchange, streamed as SSE.
 *
 * Called only by the main app, which has already authenticated the session and
 * minted the short-lived MCP key passed in the body. This service is not
 * exposed publicly and does not know what a user session is.
 */
app.post('/chat', async (request, reply) => {
  const body = request.body as {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    locale?: string;
    mcpUrl?: string;
    apiKey?: string;
  };

  if (!Array.isArray(body?.messages) || !body.mcpUrl || !body.apiKey) {
    return reply.status(400).send({ error: 'messages, mcpUrl and apiKey are required' });
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Belt and braces for any proxy that buffers by default; nginx is also
    // configured with proxy_buffering off on this path.
    'X-Accel-Buffering': 'no',
  });

  const controller = new AbortController();
  reply.raw.on('close', () => controller.abort());

  try {
    for await (const event of runAgent(llm, {
      messages: body.messages,
      locale: body.locale || 'uk',
      mcpUrl: body.mcpUrl,
      apiKey: body.apiKey,
    }, controller.signal)) {
      if (reply.raw.writableEnded) break;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    request.log.error({ err }, 'chat exchange failed');
    if (!reply.raw.writableEnded) {
      const detail = err instanceof Error ? err.message : String(err);
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', code: 'unknown', detail })}\n\n`);
    }
  } finally {
    if (!reply.raw.writableEnded) reply.raw.end();
  }
});

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info({ model: llm.model, baseUrl: llm.baseUrl }, 'bot listening');
});
