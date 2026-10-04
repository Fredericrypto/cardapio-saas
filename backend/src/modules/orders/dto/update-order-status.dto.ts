import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado'])
  status: string;

  // Motivo do cancelamento (só vale com status 'cancelado') — alimenta a
  // análise de perdas/desperdício. Opcional: o admin pode cancelar sem motivo.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cancelReason?: string;
}
