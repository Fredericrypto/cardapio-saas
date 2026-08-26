import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/order.entity';
import { TableSession } from '../tables/table-session.entity';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, TableSession])],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
