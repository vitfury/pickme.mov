import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import oauth2 from '@fastify/oauth2';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema.js';

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance) {
  // Register Google OAuth2
  await app.register(oauth2, {
    name: 'googleOAuth2',
    scope: ['openid', 'profile', 'email'],
    credentials: {
      client: {
        id: process.env.GOOGLE_CLIENT_ID || '',
        secret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/google',
    callbackUri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/google/callback',
  });

  // GET /auth/google/callback
  app.get('/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = await (app as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      // Fetch user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });

      if (!response.ok) {
        return reply.status(401).send({ error: 'Failed to fetch user info from Google' });
      }

      const googleUser = (await response.json()) as {
        id: string;
        email: string;
        name: string;
        picture: string;
      };

      // Upsert user
      const existing = await request.db
        .select()
        .from(users)
        .where(eq(users.googleId, googleUser.id))
        .limit(1);

      let user;
      if (existing.length > 0) {
        user = existing[0];
        // Update avatar/name if changed
        await request.db
          .update(users)
          .set({
            displayName: googleUser.name,
            avatarUrl: googleUser.picture,
          })
          .where(eq(users.id, user.id));
      } else {
        const inserted = await request.db
          .insert(users)
          .values({
            googleId: googleUser.id,
            email: googleUser.email,
            displayName: googleUser.name,
            avatarUrl: googleUser.picture,
          })
          .returning();
        user = inserted[0];
      }

      // Generate tokens
      const accessToken = app.jwt.sign(
        { sub: user.id, type: 'access' },
        { expiresIn: '15m' },
      );
      const refreshToken = app.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '7d' },
      );

      // Redirect to frontend with tokens
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const params = new URLSearchParams({
        accessToken,
        refreshToken,
      });
      return reply.redirect(`${appUrl}/auth/callback?${params.toString()}`);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'OAuth callback failed' });
    }
  });

  // POST /auth/refresh
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshSchema.parse(request.body);

    try {
      const decoded = app.jwt.verify<{ sub: number; type: string }>(body.refreshToken);
      if (decoded.type !== 'refresh') {
        return reply.status(401).send({ error: 'Invalid token type' });
      }

      const accessToken = app.jwt.sign(
        { sub: decoded.sub, type: 'access' },
        { expiresIn: '15m' },
      );
      const refreshToken = app.jwt.sign(
        { sub: decoded.sub, type: 'refresh' },
        { expiresIn: '7d' },
      );

      return { accessToken, refreshToken };
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }
  });

  // POST /auth/dev-login (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const devLoginSchema = z.object({
      email: z.string().email().default('dev@pickme.mov'),
      displayName: z.string().min(1).default('Dev User'),
    });

    app.post('/dev-login', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { email, displayName } = devLoginSchema.parse(request.body);
        const devGoogleId = `dev-${email}`;

        // Upsert dev user
        const existing = await request.db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        let user;
        if (existing.length > 0) {
          user = existing[0];
          await request.db
            .update(users)
            .set({ displayName })
            .where(eq(users.id, user.id));
        } else {
          const inserted = await request.db
            .insert(users)
            .values({
              googleId: devGoogleId,
              email,
              displayName,
              avatarUrl: null,
            })
            .returning();
          user = inserted[0];
        }

        const accessToken = app.jwt.sign(
          { sub: user.id, type: 'access' },
          { expiresIn: '15m' },
        );
        const refreshToken = app.jwt.sign(
          { sub: user.id, type: 'refresh' },
          { expiresIn: '7d' },
        );

        return {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            locale: user.locale,
            theme: user.theme,
            onboardingCompleted: user.onboardingCompleted,
          },
        };
      } catch (err) {
        request.log.error({ err, route: 'POST /dev-login' }, 'Dev login failed');
        throw err;
      }
    });
  }

  // POST /auth/logout
  app.post('/logout', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // JWT tokens are stateless; client should discard tokens
      return reply.status(204).send();
    } catch (err) {
      request.log.error({ err, route: 'POST /logout' }, 'Logout failed');
      throw err;
    }
  });
}
