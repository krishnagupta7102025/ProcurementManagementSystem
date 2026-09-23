import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module.js';
import { assertLocalStorageNotInProduction } from './storage/dev-local-storage.js';

// Attachments (requisition/invoice files) travel as base64 in a JSON body
// rather than multipart — Express's default json limit (100kb) would
// reject anything but the smallest scanned document, so it's raised here.
const JSON_BODY_LIMIT = '10mb';

/**
 * Shared bootstrap for both entry points: main.ts (local dev / Docker —
 * calls app.listen()) and api/index.ts (Vercel serverless function —
 * calls app.init() and serves requests directly, no listen()). Keeping
 * this one place means the two entry points can never drift apart on
 * global pipes/middleware/CORS.
 */
export async function createApp(): Promise<NestExpressApplication> {
  assertLocalStorageNotInProduction();

  if (!process.env.AUTH_JWT_SECRET) {
    throw new Error(
      'AUTH_JWT_SECRET is not set — required to sign/verify login sessions. Set it in .env before starting the API.',
    );
  }

  // Comma-separated list (e.g. the Vercel frontend's origin in production).
  // Unset in local dev, where any origin is fine — there's no real user
  // data on the line and the web app's port can vary.
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map((o) => o.trim());

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors({ origin: allowedOrigins ?? true, credentials: true });
  return app;
}
