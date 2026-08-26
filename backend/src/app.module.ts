import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { LocationsModule } from './modules/locations/locations.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TablesModule } from './modules/tables/tables.module';
import { HistoryModule } from './modules/history/history.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { CashbackModule } from './modules/cashback/cashback.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { PushModule } from './modules/push/push.module';

import { Tenant } from './modules/tenants/tenant.entity';
import { Location } from './modules/locations/location.entity';
import { AdminUser } from './modules/auth/admin-user.entity';
import { Category } from './modules/categories/category.entity';
import { Product } from './modules/products/product.entity';
import { ProductOption } from './modules/products/product-option.entity';
import { ProductOptionValue } from './modules/products/product-option-value.entity';
import { Order } from './modules/orders/order.entity';
import { OrderItem } from './modules/orders/order-item.entity';
import { RestaurantTable } from './modules/tables/restaurant-table.entity';
import { TableSession } from './modules/tables/table-session.entity';
import { WaiterCall } from './modules/tables/waiter-call.entity';
import { Customer } from './modules/customers/customer.entity';
import { Promotion } from './modules/promotions/promotion.entity';
import { PromotionCustomerReset } from './modules/promotions/promotion-customer-reset.entity';
import { OrderPromotionDiscount } from './modules/promotions/order-promotion-discount.entity';
import { ReceiptRedemption } from './modules/loyalty/receipt-redemption.entity';
import { LoyaltyProgram } from './modules/loyalty/loyalty-program.entity';
import { LoyaltyStamp } from './modules/loyalty/loyalty-stamp.entity';
import { LoyaltyReward } from './modules/loyalty/loyalty-reward.entity';
import { CashbackSettings } from './modules/cashback/cashback-settings.entity';
import { CashbackLedgerEntry } from './modules/cashback/cashback-ledger-entry.entity';
import { CashbackConsumption } from './modules/cashback/cashback-consumption.entity';
import { Review } from './modules/reviews/review.entity';
import { ReviewResponse } from './modules/reviews/review-response.entity';
import { PushSubscription } from './modules/push/push-subscription.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // disponível em toda a aplicação sem reimportar
    }),
    ScheduleModule.forRoot(),
    // Limite padrão global: era 60 requisições/minuto por IP pro app
    // INTEIRO (admin + cardápio do cliente somados no mesmo balde).
    //
    // BUG REAL corrigido aqui: o painel admin sozinho já consome ~39
    // req/min só de polling (pedidos a cada 5s, chamados de garçom a
    // cada 4s, mesas ativas a cada 5s — ver DashboardDataContext). Em
    // dev, admin e cardápio do cliente rodam no mesmo `localhost`
    // (mesmo IP) — deixar o painel admin aberto numa aba já quase
    // esgotava o balde sozinho, e qualquer atividade normal no
    // cardápio (cada página busca o tenant por conta própria, sem
    // cache) estourava o limite e devolvia 429 em requisições
    // legítimas (foi o que causou o "login trava piscando" relatado:
    // não era loop de React, era o rate limit).
    //
    // Isso também é risco de produção, não só incômodo de dev: atrás
    // de um proxy/CDN, ou só com o restaurante tendo um dia
    // relativamente movimentado, várias pessoas podem aparecer com o
    // mesmo IP público pro backend — um balde de 60/min pro site
    // inteiro nunca foi generoso o bastante. Subido pra 300/min como
    // rede de segurança ampla; a defesa de verdade contra força bruta
    // continua sendo o @Throttle apertado (10/min) direto no
    // login/cadastro de cliente, em CustomersController — esse não
    // muda.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [
          Tenant,
          Location,
          AdminUser,
          Category,
          Product,
          ProductOption,
          ProductOptionValue,
          Order,
          OrderItem,
          RestaurantTable,
          TableSession,
          WaiterCall,
          Customer,
          Promotion,
          PromotionCustomerReset,
          OrderPromotionDiscount,
          ReceiptRedemption,
          LoyaltyProgram,
          LoyaltyStamp,
          LoyaltyReward,
          CashbackSettings,
          CashbackLedgerEntry,
          CashbackConsumption,
          Review,
          ReviewResponse,
          PushSubscription,
        ],
        synchronize: false, // NUNCA true em produção — schema controlado só por migrations
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    TenantsModule,
    LocationsModule,
    CategoriesModule,
    ProductsModule,
    OrdersModule,
    TablesModule,
    HistoryModule,
    GeocodingModule,
    DeliveryModule,
    CustomersModule,
    PromotionsModule,
    LoyaltyModule,
    CashbackModule,
    ReviewsModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
