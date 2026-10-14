import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderDeliveryIntelligence } from './order-delivery-intelligence.entity';
import { OSRMService } from './osrm.service';
import { SIODEngineService } from './siod-engine.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderDeliveryIntelligence])],
  providers: [OSRMService, SIODEngineService],
  exports: [SIODEngineService, OSRMService],
})
export class SiodModule {}
