import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsIn,
  IsBoolean,
  IsArray,
  IsUUID,
  IsNumber,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import type { RewardType } from '../loyalty-program.entity';

const REWARD_TYPES = ['sobremesa', 'brinde', 'camiseta', 'refeicao', 'cashback', 'desconto', 'outro'];

export class CreateLoyaltyProgramDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsInt()
  @Min(1)
  stampsRequired: number;

  @IsIn(REWARD_TYPES)
  rewardType: RewardType;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  rewardDescription: string;

  // Obrigatório só quando rewardType === 'cashback' — validado no
  // service, não aqui (a regra depende de outro campo do mesmo DTO).
  @ValidateIf((o) => o.rewardType === 'cashback')
  @IsNumber()
  @Min(0.01)
  cashbackAmount?: number;

  @ValidateIf((o) => o.rewardType === 'desconto')
  @IsIn(['percentage', 'fixed'])
  discountType?: 'percentage' | 'fixed';

  @ValidateIf((o) => o.rewardType === 'desconto')
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
