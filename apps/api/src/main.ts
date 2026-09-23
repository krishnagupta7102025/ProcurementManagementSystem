import { createApp } from './create-app.js';

async function bootstrap() {
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
