import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Em dev, libera o frontend rodando em outra porta (Vite = 5173).
  // Em produção, troque '*' pela URL real do frontend (ex: Vercel).
  app.enableCors({
    origin: true, // reflete a origem da requisição — ok para dev; restrinja em produção
    credentials: true,
  });

  // Faz os DTOs com class-validator (RegisterDto, CreateProductDto, etc.)
  // realmente validarem e rejeitarem campos que não deveriam existir.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
