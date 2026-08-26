import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceiptRedemption } from './receipt-redemption.entity';
import { LoyaltyProgram } from './loyalty-program.entity';
import { LoyaltyStamp } from './loyalty-stamp.entity';
import { LoyaltyReward } from './loyalty-reward.entity';
import { Location } from '../locations/location.entity';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { OrdersModule } from '../orders/orders.module';
import { TablesModule } from '../tables/tables.module';
import { CashbackModule } from '../cashback/cashback.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReceiptRedemption, LoyaltyProgram, LoyaltyStamp, LoyaltyReward, Location]),
    OrdersModule,
    TablesModule,
    CashbackModule,
    PushModule,
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
