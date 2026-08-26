import { Body, Controller, Param, Post } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DeliveryQuoteDto } from './dto/delivery-quote.dto';

// Rota PÚBLICA: o cliente final usa isso pra ver a taxa de entrega ANTES
// de confirmar o pedido, sem precisar estar logado. A criação do pedido em
// si (OrdersService.create) recalcula tudo de novo de forma independente —
// nunca confia num valor de taxa enviado pelo cliente. Sempre em relação
// a uma LOJA específica (o cliente já escolheu qual antes de chegar aqui).
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post('quote/public/:locationId')
  async quote(@Param('locationId') locationId: string, @Body() dto: DeliveryQuoteDto) {
    return this.deliveryService.quotePublic(locationId, dto);
  }
}
