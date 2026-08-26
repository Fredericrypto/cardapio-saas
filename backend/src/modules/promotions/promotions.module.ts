import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './promotion.entity';
import { PromotionCustomerReset } from './promotion-customer-reset.entity';
import { OrderPromotionDiscount } from './order-promotion-discount.entity';
import { Category } from '../categories/category.entity';
import { Product } from '../products/product.entity';
import { Location } from '../locations/location.entity';
import { Order } from '../orders/order.entity';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { CustomersModule } from '../customers/customers.module';
import { PushModule } from '../push/push.module';
import { StorageService } from '../../common/services/storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Promotion,
      PromotionCustomerReset,
      OrderPromotionDiscount,
      Category,
      Product,
      Location,
      Order,
    ]),
    CustomersModule,
    PushModule,
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, StorageService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
