import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Customer } from './customer.entity';
import { CustomersAuthService } from './customers-auth.service';
import { CustomersController } from './customers.controller';
import { CustomerJwtStrategy } from './customer-jwt.strategy';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { StorageService } from '../../common/services/storage.service';

// Módulo do cliente final, isolado do AuthModule (admin) — ver o
// comentário de segurança no topo de customer-jwt.strategy.ts. Esse
// JwtModule.registerAsync é uma instância PRÓPRIA, assinando com
// CUSTOMER_JWT_SECRET (nunca JWT_SECRET). PassportModule também é uma
// instância própria: nomear a estratégia default aqui como 'customer-jwt'
// evita que ela seja usada acidentalmente onde JwtStrategy (admin) era
// esperada.
@Module({
  imports: [
    TypeOrmModule.forFeature([Customer]),
    PassportModule,
    GeocodingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('CUSTOMER_JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('CUSTOMER_JWT_EXPIRES_IN', '30d') as any,
        },
      }),
    }),
  ],
  controllers: [CustomersController],
  providers: [CustomersAuthService, CustomerJwtStrategy, StorageService],
  exports: [CustomersAuthService],
})
export class CustomersModule {}
