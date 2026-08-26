import { Controller, Post, Delete, Body, Param, Get, UseGuards, ForbiddenException } from '@nestjs/common';
import { CustomerJwtAuthGuard } from '../customers/customer-jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { RequestCustomer } from '../../common/decorators/current-customer.decorator';
import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  // Chave pública VAPID — não é segredo (é literalmente feita pra ser
  // pública, o navegador usa ela pra criar a inscrição), por isso não
  // exige login nem tenant específico.
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('public/:tenantId/subscribe')
  async subscribe(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Body() dto: SubscribePushDto,
  ) {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
    await this.pushService.subscribe(tenantId, customer.customerId, dto);
    return { success: true };
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Delete('public/:tenantId/subscribe')
  async unsubscribe(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Body('endpoint') endpoint: string,
  ) {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
    await this.pushService.unsubscribe(customer.customerId, endpoint);
    return { success: true };
  }
}
