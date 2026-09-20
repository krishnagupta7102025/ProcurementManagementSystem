import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { assertDevAuthBypassNotInProduction } from './auth/dev-auth-bypass.js';

assertDevAuthBypassNotInProduction();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // The web app runs on a different port in local dev; there's no
  // production deployment yet to scope this down to a real origin list.
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
