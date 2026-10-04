import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  Max,
  Matches,
  IsIn,
} from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'primaryColor deve ser um hex válido, ex: #3d3846' })
  primaryColor?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'secondaryColor deve ser um hex válido, ex: #c0bfbc' })
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  instagramHandle?: string;

  // Redes sociais adicionais (18/09) — mesmo padrão do Instagram, vazio
  // ("") é tratado como "remover" (ver TenantsService.update).
  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  tiktokHandle?: string;

  @IsOptional()
  @IsString()
  twitterHandle?: string;

  @IsOptional()
  @IsString()
  messengerUsername?: string;

  @IsOptional()
  @IsEmail()
  gmailAddress?: string;

  // whatsappNumber, address, isOpen, openingHours, delivery*,
  // minOrderValue: tudo isso agora é por Location (loja física), não
  // por Tenant (marca) — ver modules/locations. Endereço continua sem
  // aparecer aqui pelo mesmo motivo de antes (geocodificação).

  @IsOptional()
  @IsIn(['email', 'telefone', 'cpf', 'aleatoria'])
  pixKeyType?: string;

  @IsOptional()
  @IsString()
  pixKey?: string;

  @IsOptional()
  @IsString()
  pixMerchantCity?: string;

  @IsOptional()
  @IsBoolean()
  pixEnabled?: boolean;

  // Access token de verdade (gateway) — nunca fica no banco em texto
  // puro, ver TenantsService.update. String vazia é tratada como "remover".
  @IsOptional()
  @IsString()
  mercadoPagoAccessToken?: string;

  @IsOptional()
  @IsString()
  mercadoPagoWebhookSecret?: string;

  // Minutos que o cliente tem pra fazer o primeiro pedido depois de
  // escanear o QR da mesa, antes da sessão expirar sozinha. `null`
  // desativa (sessão nunca expira automaticamente). Nunca aceita 0 ou
  // negativo — isso expiraria a sessão instantaneamente, o que não faz
  // sentido como configuração (equivalente a "desativado" deveria ser
  // null, não zero).
  @IsOptional()
  @IsInt()
  @Min(1)
  tableSessionTimeoutMinutes?: number | null;

  // % de CMV estimado quando o produto não tem custo cadastrado (0–100).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultCmvPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cardFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pixFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number;
}
