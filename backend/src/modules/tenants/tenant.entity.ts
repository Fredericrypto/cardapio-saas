import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  slug: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ name: 'cover_image_url', type: 'text', nullable: true })
  coverImageUrl: string | null;

  @Column({ name: 'primary_color', length: 7, default: '#E63946' })
  primaryColor: string;

  @Column({ name: 'secondary_color', length: 7, default: '#1D3557' })
  secondaryColor: string;

  // Só o usuário do Instagram (sem @ nem URL) — usado pra montar o link
  // clicável no header do cardápio do cliente, junto com o WhatsApp.
  @Column({ name: 'instagram_handle', type: 'varchar', length: 100, nullable: true })
  instagramHandle: string | null;

  @Column({ length: 20, default: 'trial' })
  plan: string; // trial, basico, pro

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Chave Pix do estabelecimento, usada só pra GERAR o QR code de cobrança
  // (padrão aberto BR Code) — não passamos pelo dinheiro, é o banco do
  // cliente que processa a transferência direto pra essa chave.
  @Column({ name: 'pix_key_type', type: 'varchar', length: 20, nullable: true })
  pixKeyType: string | null; // email, telefone, cpf, aleatoria

  @Column({ name: 'pix_key', type: 'varchar', length: 150, nullable: true })
  pixKey: string | null;

  // Cidade do recebedor exigida pelo padrão BR Code (campo "60", até 15
  // caracteres) — campo dedicado em vez de reaproveitar `address` (que é
  // texto livre e normalmente tem mais que cidade).
  @Column({ name: 'pix_merchant_city', type: 'varchar', length: 15, nullable: true })
  pixMerchantCity: string | null;

  // Opt-in explícito: só exige pagamento Pix confirmado ANTES do pedido
  // entrar na cozinha (balcão/entrega) se o restaurante ligou isso de
  // propósito em Configurações — sem isso, Pix continua só informativo
  // (comportamento de sempre), pra nunca travar quem ainda não configurou.
  @Column({ name: 'pix_enabled', default: false })
  pixEnabled: boolean;

  // Integração de verdade com gateway de pagamento (Mercado Pago) — quando
  // configurado, o Pix passa a ser confirmado automaticamente (webhook +
  // consulta direta à API), em vez do fluxo estático de QR Code com
  // confirmação manual do admin. Guardado criptografado (ver
  // common/utils/encryption.ts) porque, ao contrário da chave Pix (feita
  // pra ser pública), um access token de API é um segredo de verdade.
  @Column({ name: 'mercado_pago_access_token_encrypted', type: 'text', nullable: true })
  mercadoPagoAccessTokenEncrypted: string | null;

  @Column({ name: 'mercado_pago_webhook_secret_encrypted', type: 'text', nullable: true })
  mercadoPagoWebhookSecretEncrypted: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null; // soft delete — nunca apagar tenant de verdade
}
