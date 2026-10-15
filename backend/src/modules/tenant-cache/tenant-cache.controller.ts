import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { imageTelemetry } from '../../common/utils/image-optimizer';
import { TenantCacheService } from './tenant-cache.service';

// Observabilidade do cache e das imagens: acertos, cargas reais do banco,
// invalidações, 304, alertas de regressão e economia dos uploads. Só números
// agregados (sem dado de restaurante nem de cliente).
@Controller('internal/cache-stats')
export class TenantCacheController {
  constructor(private readonly cache: TenantCacheService) {}

  @RequirePermission('analytics:view')
  @SkipThrottle()
  @Get()
  stats() {
    return { ...this.cache.snapshot(), images: imageTelemetry.snapshot() };
  }
}
