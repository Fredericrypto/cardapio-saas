import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StorageService } from '../../common/services/storage.service';
import { BehavioralBadgeProvider } from './badges/behavioral-badge.provider';
import { ProductBadgesService } from './badges/product-badges.service';
import { TenantCacheModule } from '../tenant-cache/tenant-cache.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), TenantCacheModule],
  controllers: [ProductsController],
  providers: [ProductsService, StorageService, BehavioralBadgeProvider, ProductBadgesService],
  exports: [ProductsService],
})
export class ProductsModule {}
