import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../auth/admin-user.entity';
import { Tenant } from '../tenants/tenant.entity';
import { InternalNotification } from './internal-notification.entity';
import { InternalNotificationRead } from './internal-notification-read.entity';
import { UserPushSubscription } from './user-push-subscription.entity';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalNotificationsService } from './internal-notifications.service';

// Isolado de propósito: NÃO importa o PushModule dos clientes.
@Module({
  imports: [
    TypeOrmModule.forFeature([InternalNotification, InternalNotificationRead, UserPushSubscription, AdminUser, Tenant]),
  ],
  controllers: [InternalNotificationsController],
  providers: [InternalNotificationsService],
  exports: [InternalNotificationsService],
})
export class InternalNotificationsModule {}
