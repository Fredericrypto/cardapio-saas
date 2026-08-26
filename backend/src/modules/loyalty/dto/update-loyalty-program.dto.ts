import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsBoolean,
  IsArray,
  IsUUID,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import type { RewardType } from '../loyalty-program.entity';

const REWARD_TYPES = ['sobremesa', 'brinde', 'camiseta', 'refeicao', 'cashback', 'desconto', 'outro'];

// Sem ValidateIf condicionado ao rewardType aqui de propósito — numa
// edição parcial, o rewardType pode nem estar vindo nesse payload
// específico (o service olha o valor JÁ SALVO do programa pra decidir
// se aceita cashbackAmount/discountValue, ver LoyaltyService.updateProgram).
export class UpdateLoyaltyProgramDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  stampsRequired?: number;

  @IsOptional()
  @IsIn(REWARD_TYPES)
  rewardType?: RewardType;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  rewardDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  cashbackAmount?: number;

  @IsOptional()
  @IsIn(['percentage', 'fixed'])
  discountType?: 'percentage' | 'fixed';

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  discountValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];
}
