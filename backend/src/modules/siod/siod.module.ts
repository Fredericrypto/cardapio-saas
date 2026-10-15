import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderDeliveryIntelligence } from './order-delivery-intelligence.entity';
import { OSRMService } from './osrm.service';
import { SIODEngineService } from './siod-engine.service';
import { SiodController } from './siod.controller';
import { SiodInsightsService } from './siod-insights.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderDeliveryIntelligence])],
  controllers: [SiodController],
  providers: [OSRMService, SIODEngineService, SiodInsightsService],
  exports: [SIODEngineService, OSRMService],
})
export class SiodModule {}
