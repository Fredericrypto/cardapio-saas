import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado'])
  status: string;
}
