import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    userId: number;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('userId', 0);

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<{ sub: number; type: string }>();
      if (decoded.type !== 'access') {
        return reply.status(401).send({ error: 'Invalid token type' });
      }
      request.userId = decoded.sub;
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, { name: 'auth' });
