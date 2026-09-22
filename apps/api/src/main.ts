import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module.js';
import { assertLocalStorageNotInProduction } from './storage/dev-local-storage.js';

assertLocalStorageNotInProduction();

if (!process.env.AUTH_JWT_SECRET) {
  throw new Error(
    'AUTH_JWT_SECRET is not set — required to sign/verify login sessions. Set it in .env before starting the API.',
  );
}

// Attachments (requisition/invoice files) travel as base64 in a JSON body
// rather than multipart — Express's default json limit (100kb) would
// reject anything but the smallest scanned document, so it's raised here.
const JSON_BODY_LIMIT = '10mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // The web app runs on a different port in local dev; there's no
  // production deployment yet to scope this down to a real origin list.
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
