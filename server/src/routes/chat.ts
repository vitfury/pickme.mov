import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { mintChatKey } from '../services/api-keys.js';

const BOT_URL = process.env.BOT_URL || 'http://bot:3002';

// The URL the *bot* uses to reach MCP — a container address, not the public one.
const MCP_INTERNAL_URL = process.env.MCP_INTERNAL_URL || 'http://app:3000/mcp';

// Enough to carry a conversation, small enough that a runaway client cannot
// push a megabyte of history through a slow local model.
const MAX_MESSAGES = 40;
const MAX_CHARS = 4000;

const bodySchema = z.object({
  messages: z
    .array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(MAX_CHARS),
    }))
    .min(1)
    .max(MAX_MESSAGES),
  locale: z.enum(['uk', 'en']).optional(),
});

export default async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  /**
   * Front door for the chat. The session is verified here, as on every other
   * route, and the bot container never sees it: it gets a key scoped to this
   * user that expires on its own, and nothing else.
   *
   * The bot's SSE stream is piped straight back to the browser. Fastify must
   * not touch the response once that starts, hence the hijack.
   */
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', message: parsed.error.message });
    }

    const apiKey = await mintChatKey(request.db, request.userId);

    const upstream = new AbortController();
    reply.raw.on('close', () => upstream.abort());

    let botResponse: Response;
    try {
      botResponse = await fetch(`${BOT_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: upstream.signal,
        body: JSON.stringify({
          messages: parsed.data.messages,
          locale: parsed.data.locale || 'uk',
          mcpUrl: MCP_INTERNAL_URL,
          apiKey,
        }),
      });
    } catch (err) {
      request.log.error({ err, route: 'POST /chat', userId: request.userId }, 'bot unreachable');
      return reply.status(503).send({ code: 'llm_unavailable' });
    }

    if (!botResponse.ok || !botResponse.body) {
      request.log.error(
        { status: botResponse.status, route: 'POST /chat', userId: request.userId },
        'bot rejected the exchange',
      );
      return reply.status(502).send({ code: 'llm_unavailable' });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const reader = botResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (reply.raw.writableEnded) break;
        reply.raw.write(value);
      }
    } catch (err) {
      if (!upstream.signal.aborted) {
        request.log.error({ err, route: 'POST /chat', userId: request.userId }, 'chat stream broke');
      }
    } finally {
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });
}
