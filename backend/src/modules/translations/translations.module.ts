import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationsController } from './translations.controller';

@Module({
  controllers: [TranslationsController],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationsModule {}
