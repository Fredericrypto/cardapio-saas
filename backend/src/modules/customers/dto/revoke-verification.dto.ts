import { IsString, MinLength, MaxLength } from 'class-validator';

// Texto livre de propósito (diferente da recusa, que usa lista fechada)
// — revogar é uma ação rara, disparada por uma investigação manual do
// admin, o motivo exato varia demais pra caber numa lista fixa.
export class RevokeVerificationDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
