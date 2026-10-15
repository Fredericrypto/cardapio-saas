import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { TenantCacheService } from './tenant-cache.service';

// Observabilidade do cache: acertos, erros, cargas no banco e JSON evitado.
// Só números agregados (sem dado de restaurante nem de cliente).
@Controller('internal/cache-stats')
export class TenantCacheController {
  constructor(private readonly cache: TenantCacheService) {}

  @RequirePermission('analytics:view')
  @SkipThrottle()
  @Get()
  stats() {
    return this.cache.snapshot();
  }
}
