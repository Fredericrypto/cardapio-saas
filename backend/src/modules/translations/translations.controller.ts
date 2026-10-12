import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SuggestTranslationDto } from './dto/suggest-translation.dto';
import { TranslationService } from './translation.service';

// Sugestão de tradução para o painel (prato e promoção). Só sugere: quem grava é
// o formulário do prato/promoção, e o admin pode revisar antes de salvar.
@Controller('translations')
export class TranslationsController {
  constructor(private readonly translations: TranslationService) {}

  @RequirePermission('menu:manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('suggest')
  suggestForProduct(@Body() dto: SuggestTranslationDto) {
    return this.translations.suggest(dto.texts, dto.targets);
  }

  @RequirePermission('promotions:manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('suggest/promotion')
  suggestForPromotion(@Body() dto: SuggestTranslationDto) {
    return this.translations.suggest(dto.texts, dto.targets);
  }
}
