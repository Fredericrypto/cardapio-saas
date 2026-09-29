import { IsOptional, IsNumber, Min, IsIn, IsBoolean } from 'class-validator';

export class RequestClosingDto {
  // Gorjeta opcional escolhida pelo cliente antes de solicitar o fechamento.
  @IsOptional()
  @IsNumber()
  @Min(0)
  tipAmount?: number;

  // Forma de pagamento que o cliente pretende usar (pedido do Felipe,
  // 28/09). 'cashback' só é aceito quando useCashback=true E o saldo
  // realmente cobre 100% da conta (validado no serviço) — é uma escolha
  // EXPLÍCITA do cliente, nunca inferida automaticamente só porque o
  // saldo dava pra cobrir (ver TablesService.requestClosing).
  @IsIn(['dinheiro', 'cartao', 'pix', 'cashback'])
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

  // Só perguntado (e só aceito) quando a mesa tem mais de um cliente
  // distinto com pedido — 'pagador' manda todo o cashback GANHO nessa
  // sessão pra quem está fechando a conta; 'por_pedido' (padrão) mantém
  // cada cliente recebendo o cashback dos próprios pedidos.
  @IsOptional()
  @IsIn(['pagador', 'por_pedido'])
  cashbackSplitMode?: string;
}
