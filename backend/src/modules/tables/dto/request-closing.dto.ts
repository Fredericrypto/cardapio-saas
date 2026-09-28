import { IsOptional, IsNumber, Min, IsIn, IsBoolean } from 'class-validator';

export class RequestClosingDto {
  // Gorjeta opcional escolhida pelo cliente antes de solicitar o fechamento.
  @IsOptional()
  @IsNumber()
  @Min(0)
  tipAmount?: number;

  // Forma de pagamento que o cliente pretende usar (pedido do Felipe,
  // 28/09). Sempre exigida — mesmo quando o cashback vai cobrir tudo, o
  // serviço decide isso sozinho (ver TablesService.requestClosing);
  // aqui é só a intenção do cliente.
  @IsIn(['dinheiro', 'cartao', 'pix'])
  paymentMethod: string;

  // Cliente quer usar o saldo de cashback dele pra abater a conta.
  // Ignorado (sempre tratado como false) pra convidado sem login — não
  // tem carteira pra usar.
  @IsOptional()
  @IsBoolean()
  useCashback?: boolean;

  // Só faz sentido (e só é validado como obrigatório no serviço) quando
  // paymentMethod = 'dinheiro'.
  @IsOptional()
  @IsIn(['balcao', 'mesa'])
  cashDeliveryPreference?: string;
}
