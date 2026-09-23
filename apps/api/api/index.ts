import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/create-app.js';

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

// Cached at module scope so a warm container reuses the same Nest app
// (and its Prisma connection) across invocations instead of re-bootstrapping
// on every request — cold starts still pay this cost once.
let cachedHandler: RequestHandler | undefined;

async function getHandler(): Promise<RequestHandler> {
  if (!cachedHandler) {
    const app = await createApp();
    await app.init();
    // The underlying Express instance is itself a valid (req, res) request
    // listener — no serverless-http/API-Gateway adapter needed for
    // Vercel's Node.js runtime, which calls functions with plain
    // req/res objects rather than Lambda-style events.
    cachedHandler = app.getHttpAdapter().getInstance();
  }
  return cachedHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const requestHandler = await getHandler();
  requestHandler(req, res);
}
