import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashbackSettings } from './cashback-settings.entity';
import { CashbackLedgerEntry } from './cashback-ledger-entry.entity';
import { CashbackConsumption } from './cashback-consumption.entity';
import { Location } from '../locations/location.entity';
import { CashbackService } from './cashback.service';
import { CashbackController } from './cashback.controller';

// Módulo intencionalmente SEM dependência de OrdersModule/TablesModule/
// LoyaltyModule — é o contrário: são eles que importam CashbackModule
// (pra ganhar/gastar cashback nos pontos certos do fluxo). Mantê-lo sem
// dependências evita qualquer risco de import circular entre os quatro.
@Module({
  imports: [TypeOrmModule.forFeature([CashbackSettings, CashbackLedgerEntry, CashbackConsumption, Location])],
  controllers: [CashbackController],
  providers: [CashbackService],
  exports: [CashbackService],
})
export class CashbackModule {}
