import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './review.entity';
import { ReviewResponse } from './review-response.entity';
import { Order } from '../orders/order.entity';
import { OrderItem } from '../orders/order-item.entity';
import { CustomersModule } from '../customers/customers.module';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';

// Standalone, sem depender de OrdersModule/TablesModule — só precisa dos
// REPOSITÓRIOS de Order/OrderItem (leitura, pra checar elegibilidade e
// montar nome/foto de item avaliado), não do OrdersService inteiro.
// Evita import circular e mantém o módulo leve. CustomersModule entra só
// pelo CustomerVerificationService (checagem real de selo verificado —
// nunca lê `customer.isVerified` cru, ver verification-signature.ts).
@Module({
  imports: [TypeOrmModule.forFeature([Review, ReviewResponse, Order, OrderItem]), CustomersModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
