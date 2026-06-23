import './load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './shared/errors/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors();
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
