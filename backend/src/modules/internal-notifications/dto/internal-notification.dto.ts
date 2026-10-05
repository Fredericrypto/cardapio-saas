import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  auth: string;
}

// Inscrição Web Push de um aparelho da equipe (formato do PushSubscription.toJSON()).
export class SubscribeInternalPushDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  endpoint: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  userAgent?: string;
}

export class UnsubscribeInternalPushDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  endpoint: string;
}

export class UpdateInternalPreferencesDto {
  @IsIn(['owner', 'owner_manager', 'all'])
  target: 'owner' | 'owner_manager' | 'all';
}
