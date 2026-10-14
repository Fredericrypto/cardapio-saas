import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Corpo de POST /orders/public/:tenantId/:id/pay-card.
//
// O que NUNCA vem aqui: número do cartão, CVV, validade, nome impresso. Esses
// dados vivem só dentro dos campos seguros do SDK do Mercado Pago no navegador,
// que devolve um `token` de uso único. O VALOR a cobrar também não vem daqui:
// é sempre recalculado pelo backend a partir do pedido gravado.
export class PayCardDto {
  // Card token do SDK do Mercado Pago (uso único, expira em minutos).
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  token: string;

  // Bandeira/método detectado pelo SDK: visa, master, elo, amex, hipercard...
  @IsString()
  @Matches(/^[a-z0-9_]{2,40}$/)
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,12}$/)
  issuerId?: string;

  // Hoje só à vista. (O SDK é configurado com máximo de 1 parcela.)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1)
  installments?: number;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  payerEmail?: string;

  // Documento do pagador (CPF no Brasil) — o Mercado Pago exige para cartão.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2,10}$/)
  identificationType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z.\-/]{5,25}$/)
  identificationNumber?: string;

  // Device id do script de segurança do Mercado Pago (antifraude).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;
}
