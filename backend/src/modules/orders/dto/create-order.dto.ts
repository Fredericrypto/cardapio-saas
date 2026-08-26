import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  MinLength,
  IsIn,
  IsNumber,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  // Ids de ProductOptionValue escolhidos pelo cliente (ex: tamanho
  // "Grande", adicional "Bacon"). NUNCA inclui preço aqui — o preço de
  // cada opção é sempre recalculado no backend a partir do id, igual já
  // fazemos com o preço do produto em si. Ver OrdersService.create.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedValueIds?: string[];
}

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  tableNumber?: string;

  @IsOptional()
  @IsUUID()
  tableSessionId?: string; // presente quando orderType === 'mesa'

  // Qual loja física — obrigatório pra balcão/entrega (o cliente escolhe
  // antes de montar o carrinho); ignorado pra mesa, que resolve sozinha
  // pela mesa escaneada (ver OrdersService.create).
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsIn(['balcao', 'mesa', 'entrega'])
  orderType: string;

  // Endereço de entrega — obrigatório (estruturado) só quando orderType
  // é 'entrega'. Estruturado em vez de texto único pra maior precisão
  // de geocodificação (cada campo é interpretado isoladamente).
  @ValidateIf((o) => o.orderType === 'entrega')
  @IsString()
  @MinLength(2)
  deliveryStreet?: string;

  @IsOptional()
  @IsString()
  deliveryAddressNumber?: string;

  @IsOptional()
  @IsString()
  deliveryNeighborhood?: string;

  @ValidateIf((o) => o.orderType === 'entrega')
  @IsString()
  @MinLength(2)
  deliveryCity?: string;

  @ValidateIf((o) => o.orderType === 'entrega')
  @IsString()
  @MinLength(2)
  deliveryState?: string;

  @IsOptional()
  @IsString()
  deliveryPostcode?: string;

  // Texto livre, não entra na geocodificação — só ajuda o entregador
  // ("portão azul", "ao lado do mercado", etc.).
  @IsOptional()
  @IsString()
  deliveryReferencePoint?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Escolhida pelo cliente na tela de pagamento do carrinho (só pra
  // balcão/entrega — mesa não pede isso, o pagamento acontece depois, ao
  // fechar a conta com o admin). Sem confirmação automática nenhuma —
  // é só a intenção do cliente, o admin confirma de verdade ao concluir.
  @IsOptional()
  @IsString()
  @IsIn(['dinheiro', 'cartao', 'pix'])
  paymentMethod?: string;

  // Gorjeta — só faz sentido em balcão/entrega (mesa define isso ao
  // fechar conta). Opcional, default 0 no service se não vier.
  @IsOptional()
  @IsNumber()
  @Min(0)
  tipAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  // Promoções escolhidas pelo cliente no carrinho (igual iFood: cupom é
  // aplicado por escolha, nunca forçado — e o cliente pode escolher MAIS
  // DE UM, contanto que não disputem os mesmos itens; ver
  // PromotionsService.validateSelectedPromotions, que reparte o carrinho
  // sequencialmente entre eles, sem deixar dois cupons descontarem a
  // MESMA unidade). Sempre revalidado do zero no backend. Se qualquer
  // uma das promoções não for mais válida nesse momento, o pedido
  // inteiro é rejeitado com um erro claro (o frontend deixa o cliente
  // ajustar os cupons e tentar de novo), nunca criado silenciosamente
  // com menos desconto do que o esperado.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  promotionIds?: string[];

  // Checkbox "usar meu saldo de cashback" no checkout — nunca aplicado
  // sozinho, só quando o cliente escolhe explicitamente (mesmo
  // princípio de promotionIds). Só tem efeito se o pedido tiver
  // customerId (cliente logado) e ele tiver saldo — ver OrdersService
  // .create. O valor USADO é sempre recalculado do zero contra o saldo
  // real no banco (nunca confiamos num valor vindo do cliente).
  @IsOptional()
  @IsBoolean()
  useCashback?: boolean;
}
