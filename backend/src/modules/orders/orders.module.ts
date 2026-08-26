import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from '../products/product.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { Customer } from '../customers/customer.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DeliveryModule } from '../delivery/delivery.module';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { TablesModule } from '../tables/tables.module';
import { CashbackModule } from '../cashback/cashback.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, Tenant, Location, Customer]),
    DeliveryModule,
    CustomersModule,
    PaymentsModule,
    PromotionsModule,
    TablesModule,
    CashbackModule,
    PushModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
