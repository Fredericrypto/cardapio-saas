import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './review.entity';
import { ReviewResponse } from './review-response.entity';
import { Order } from '../orders/order.entity';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';

// Standalone, sem depender de OrdersModule/TablesModule — só precisa do
// REPOSITÓRIO de Order (leitura, pra checar elegibilidade), não do
// OrdersService inteiro. Evita import circular e mantém o módulo leve.
@Module({
  imports: [TypeOrmModule.forFeature([Review, ReviewResponse, Order])],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
