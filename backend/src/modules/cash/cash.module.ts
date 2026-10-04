import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashTransaction } from './cash-transaction.entity';
import { CashController } from './cash.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CashTransaction])],
  controllers: [CashController],
})
export class CashModule {}
