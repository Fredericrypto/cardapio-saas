import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { StorageService } from '../../common/services/storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), GeocodingModule],
  controllers: [TenantsController],
  providers: [TenantsService, StorageService],
  exports: [TenantsService],
})
export class TenantsModule {}
