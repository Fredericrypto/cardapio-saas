import { Module } from '@nestjs/common';
import { TenantCacheService } from './tenant-cache.service';
import { TenantCacheController } from './tenant-cache.controller';

// Importe este módulo em cada módulo que usa o cache (Orders, Tables, Products):
// módulos são singletons, então todos compartilham a MESMA instância.
@Module({
  controllers: [TenantCacheController],
  providers: [TenantCacheService],
  exports: [TenantCacheService],
})
export class TenantCacheModule {}
