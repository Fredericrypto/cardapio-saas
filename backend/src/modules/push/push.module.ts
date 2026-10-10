import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './push-subscription.entity';
import { Customer } from '../customers/customer.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';

// Standalone, igual CashbackModule — quem precisa mandar notificação
// (OrdersModule, TablesModule) importa esse módulo, nunca o contrário.
@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription, Customer])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
