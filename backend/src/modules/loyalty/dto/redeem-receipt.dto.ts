import { IsString, IsNotEmpty, IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';

const PURPOSES = ['reembolso', 'reclamacao', 'retirada', 'fidelidade', 'outro'];

export class RedeemReceiptDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsIn(PURPOSES)
  purpose: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // Obrigatório só quando purpose === 'fidelidade' — validado no
  // service (a regra depende de outro campo do mesmo DTO).
  @IsOptional()
  @IsUUID()
  loyaltyProgramId?: string;
}
