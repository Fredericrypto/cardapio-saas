import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

// Configuração de cashback, no molde Uber Cash/iFood: X% de volta em
// toda compra, creditado automaticamente na carteira do cliente ao
// pagamento ser confirmado (ver CashbackService.credit, chamado pelos 4
// pontos onde um pedido/sessão vira "pago" — OrdersService.concludeWithPayment
// /confirmPixPayment/applyMercadoPagoStatus e TablesService.closeSession).
//
// Podem existir VÁRIAS configurações ativas ao mesmo tempo (mesmo padrão
// de Promotion/LoyaltyProgram), cada uma com seu próprio escopo de lojas
// — o que permite, por exemplo, "5% em todas as lojas" + "10% só na
// Unidade Shopping" simultaneamente. Ao creditar, CashbackService.
// findApplicableSettings escolhe a config MAIS ESPECÍFICA (com lojas
// explícitas vence sobre a global); em empate, a de maior percentual.
// O admin é responsável por não deixar duas configs com o MESMO escopo
// específico ativas ao mesmo tempo (mesma responsabilidade que já existe
// hoje pra promoções sobrepostas).
@Entity('cashback_settings')
export class CashbackSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Nome interno só pra o admin identificar a config na lista (ex:
  // "Padrão", "Promo de aniversário Shopping") — nunca mostrado ao
  // cliente; o texto voltado ao cliente é `promoText`.
  @Column({ length: 80, default: 'Cashback' })
  name: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // 0-100. Ex: 5.00 = 5% do valor elegível volta como cashback.
  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: numericTransformer })
  percentage: number;

  // Pedido mínimo (valor dos ITENS, mesma base usada no cálculo do
  // cashback — ver CashbackService.credit) pra gerar cashback. 0 = sem
  // mínimo.
  @Column({ name: 'min_order_value', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  minOrderValue: number;

  // Teto em R$ de quanto cashback um ÚNICO pedido pode gerar — mesma
  // lógica de maxDiscountAmount em Promotion, pelo mesmo motivo: sem
  // isso, um pedido gigante gera cashback sem limite. null = sem teto.
  @Column({ name: 'max_cashback_per_order', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  maxCashbackPerOrder: number | null;

  // Teto em R$ de quanto UM CLIENTE pode ganhar de cashback em 24h,
  // somando todos os pedidos dele — diferente do teto por pedido acima,
  // esse existe pra fechar a brecha de "vários pedidos pequenos
  // seguidos" acumulando sem limite. Checado em CashbackService.credit,
  // que reduz o crédito (nunca rejeita o pedido) até o que ainda cabe
  // nesse teto. null = sem teto diário.
  @Column({ name: 'max_cashback_per_customer_per_day', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  maxCashbackPerCustomerPerDay: number | null;

  // Quantos dias depois de creditado o saldo expira — null = nunca
  // expira. A expiração nunca depende de nenhum job rodando: toda
  // consulta de saldo/consumo já filtra `expiresAt > now()` direto no
  // banco (ver CashbackService.getBalance/consume), então mesmo sem
  // nenhum cron o valor expirado simplesmente para de contar.
  @Column({ name: 'expiration_days', type: 'int', nullable: true })
  expirationDays: number | null;

  // Texto de propaganda customizável mostrado ao cliente no cardápio
  // (ex: "Ganhe 5% de volta em todo pedido!"). Livre, nunca gerado
  // automaticamente a partir do percentual.
  @Column({ name: 'promo_text', type: 'varchar', length: 150, nullable: true })
  promoText: string | null;

  // Vazio = vale em todas as lojas do tenant — mesmo padrão de
  // Promotion.locations / LoyaltyProgram.locations.
  @ManyToMany(() => Location, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'cashback_settings_locations',
    joinColumn: { name: 'cashback_settings_id' },
    inverseJoinColumn: { name: 'location_id' },
  })
  locations: Location[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
