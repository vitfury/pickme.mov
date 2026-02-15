import fs from 'node:fs';
import path from 'node:path';
import Fastify, { FastifyError, FastifyInstance } from 'fastify';
import pino from 'pino';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import authPlugin from './plugins/auth.js';
import { db, Database } from './db/index.js';

// Route imports
import authRoutes from './routes/auth.js';
import feedRoutes from './routes/feed.js';
import watchlistRoutes from './routes/watchlist.js';
import searchRoutes from './routes/search.js';
import filtersRoutes from './routes/filters.js';
import peopleRoutes from './routes/people.js';
import usersRoutes from './routes/users.js';
import onboardingRoutes from './routes/onboarding.js';
import contentRoutes from './routes/content.js';

declare module 'fastify' {
  interface FastifyRequest {
    db: Database;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  // Ensure logs directory exists
  const logDir = process.env.LOG_DIR || './logs';
  fs.mkdirSync(logDir, { recursive: true });

  const logLevel = process.env.LOG_LEVEL || 'info';
  const logFilePath = path.join(logDir, 'error.log');

  // Write errors to file + everything to stdout
  const loggerStream = pino.multistream([
    { level: logLevel as pino.Level, stream: process.stdout },
    { level: 'error', stream: pino.destination(logFilePath) },
  ]);

  const app = Fastify({
    logger: {
      level: logLevel,
      stream: loggerStream,
    } as any,
  });

  // Register CORS
  await app.register(cors, {
    origin: process.env.APP_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Register JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    sign: { expiresIn: '15m' },
  });

  // Register Cookie
  await app.register(cookie);

  // Register auth plugin
  await app.register(authPlugin);

  // Decorate request with db
  app.decorateRequest('db', null as unknown as Database);
  app.addHook('onRequest', async (request) => {
    request.db = db;
  });

  // Register routes under /api/v1
  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(feedRoutes, { prefix: '/feed' });
    await api.register(watchlistRoutes, { prefix: '/watchlist' });
    await api.register(searchRoutes, { prefix: '/search' });
    await api.register(filtersRoutes, { prefix: '/filters' });
    await api.register(peopleRoutes, { prefix: '/people' });
    await api.register(usersRoutes, { prefix: '/users' });
    await api.register(onboardingRoutes, { prefix: '/onboarding' });
    await api.register(contentRoutes, { prefix: '/content' });
  }, { prefix: '/api/v1' });

  // Global error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({
      err: error,
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query,
      userId: (request as any).userId || null,
    }, `[${request.method}] ${request.url} — ${error.message}`);

    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
      });
    }

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      ...(statusCode < 500 ? { message: error.message } : {}),
    });
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
