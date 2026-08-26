import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantTable } from './restaurant-table.entity';
import { TableSession } from './table-session.entity';
import { WaiterCall } from './waiter-call.entity';
import { Order } from '../orders/order.entity';
import { Location } from '../locations/location.entity';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { CashbackModule } from '../cashback/cashback.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RestaurantTable, TableSession, WaiterCall, Order, Location]),
    CashbackModule,
    PushModule,
  ],
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
