import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { Location } from '../locations/location.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

export type CashbackSourceType = 'order' | 'loyalty_reward' | 'admin_adjustment';

// Ledger de CRÉDITOS de cashback — nunca um saldo solto num campo
// mutável. O "saldo" do cliente é SEMPRE a soma de `remainingAmount` de
// todas as entradas não expiradas (ver CashbackService.getBalance),
// nunca um contador cacheado em outro lugar — mesmo princípio já usado
// em LoyaltyStamp/ReceiptRedemption pra fidelidade.
//
// `remainingAmount` começa igual a `originalAmount` e só diminui quando
// uma CashbackConsumption é criada gastando parte desse crédito
// (consumo sempre FIFO por proximidade de expiração — ver
// CashbackService.consume). Nunca é um UPDATE direto de fora dessas
// duas operações.
//
// UNIQUE (sourceType, sourceId) é o que garante que um pedido nunca
// credita cashback duas vezes por engano (ex: webhook do Mercado Pago
// chegando junto com o polling do painel tentando confirmar o mesmo
// pagamento ao mesmo tempo) — ver CashbackService.credit, que trata a
// violação dessa constraint como "já creditado, não faz nada".
@Entity('cashback_ledger_entries')
@Index(['sourceType', 'sourceId'], { unique: true, where: '"source_id" IS NOT NULL' })
export class CashbackLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Index()
  @Column({ name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  // Loja que gerou o crédito (pedido de balcão/entrega/mesa) — null pra
  // créditos que não vêm de uma loja específica (ex: ajuste manual do
  // admin, ou prêmio de fidelidade sem loja definida). Só informativo
  // pra relatório, nunca usado pra restringir onde o saldo pode ser
  // gasto — cashback, uma vez na carteira, vale em qualquer loja do
  // mesmo tenant.
  @Column({ name: 'location_id', nullable: true })
  locationId: string | null;

  @ManyToOne(() => Location, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location | null;

  @Column({ name: 'source_type', type: 'varchar', length: 20 })
  sourceType: CashbackSourceType;

  // orderId (sourceType='order'), loyaltyRewardId (sourceType=
  // 'loyalty_reward'), ou null (sourceType='admin_adjustment', que pode
  // se repetir sem restrição — daí o índice único ser parcial, só sobre
  // linhas com sourceId preenchido).
  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ name: 'original_amount', type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  originalAmount: number;

  @Column({ name: 'remaining_amount', type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  remainingAmount: number;

  // null = nunca expira.
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  // Nota livre só pra ajuste manual do admin (ex: "compensação por
  // atraso na entrega") — sempre null pros outros dois tipos de origem.
  @Column({ type: 'varchar', length: 300, nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
