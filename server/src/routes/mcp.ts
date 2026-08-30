import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { verifyApiKey } from '../services/api-keys.js';
import { buildMcpServer } from '../mcp/server.js';

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, ...rest] = header.split(' ');
  if (scheme.toLowerCase() !== 'bearer' || rest.length === 0) return null;
  return rest.join(' ').trim() || null;
}

function unauthorized(reply: FastifyReply) {
  return reply
    .status(401)
    .header('WWW-Authenticate', 'Bearer realm="pickme.mov", error="invalid_token"')
    .send({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: provide a valid pickme.mov API key as a bearer token' },
      id: null,
    });
}

export default async function mcpRoutes(app: FastifyInstance) {
  // The transport speaks JSON-RPC over a single POST. Sessions are not used:
  // each request authenticates on its own and builds a server bound to that
  // user, so nothing is shared between requests or between users.
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearerToken(request);
    if (!token) return unauthorized(reply);

    const userId = await verifyApiKey(request.db, token);
    if (userId === null) {
      request.log.warn({ route: 'POST /mcp' }, 'MCP request with invalid API key');
      return unauthorized(reply);
    }

    const server = buildMcpServer(request.db, userId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      // Fastify must not also try to answer: the transport owns the response
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (err) {
      request.log.error({ err, route: 'POST /mcp', userId }, 'MCP request failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          }),
        );
      }
    }
  });

  // Stateless: there is no stream to resume and no session to delete
  const notAllowed = async (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(405).header('Allow', 'POST').send({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed: this MCP server is stateless, use POST' },
      id: null,
    });

  app.get('/', notAllowed);
  app.delete('/', notAllowed);
}
