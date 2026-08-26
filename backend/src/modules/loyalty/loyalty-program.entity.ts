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

export type RewardType = 'sobremesa' | 'brinde' | 'camiseta' | 'refeicao' | 'cashback' | 'desconto' | 'outro';

// Cartão fidelidade configurável ("a cada 5 compras, ganha 1
// sobremesa") — decisão 100% do estabelecimento, nunca automático: só
// existe se o admin criar um programa aqui. Cada carimbo vem de um
// `ReceiptRedemption` com propósito 'fidelidade' (anti-passback nativo
// — o mesmo pedido nunca conta carimbo duas vezes pro MESMO programa,
// mas pode contar pra programas DIFERENTES rodando em paralelo).
@Entity('loyalty_programs')
export class LoyaltyProgram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description: string | null;

  // Quantos carimbos (pedidos válidos) pra ganhar a recompensa.
  @Column({ name: 'stamps_required', type: 'int' })
  stampsRequired: number;

  @Column({ name: 'reward_type', type: 'varchar', length: 20 })
  rewardType: RewardType;

  // Texto livre descrevendo o prêmio (ex: "Milkshake de chocolate",
  // "Camiseta estampada M/G/GG") — sempre mostrado ao cliente e ao
  // funcionário, independente do tipo.
  @Column({ name: 'reward_description', type: 'varchar', length: 150 })
  rewardDescription: string;

  // Só preenchido quando rewardType === 'cashback' — quanto credita na
  // carteira do cliente automaticamente ao completar o cartão (ver
  // LoyaltyService.grantRewardIfEligible + CashbackService).
  @Column({
    name: 'cashback_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  cashbackAmount: number | null;

  // Só preenchidos quando rewardType === 'desconto' — vira um cupom de
  // uso único pro cliente resgatar na próxima compra.
  @Column({ name: 'discount_type', type: 'varchar', length: 10, nullable: true })
  discountType: 'percentage' | 'fixed' | null;

  @Column({
    name: 'discount_value',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  discountValue: number | null;

  // Só pedidos a partir desse valor contam carimbo — evita o cliente
  // "farmar" carimbos com pedidos de R$1.
  @Column({
    name: 'min_order_value',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  minOrderValue: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Vazio = vale em todas as lojas — mesmo padrão de Promotion.locations.
  @ManyToMany(() => Location, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'loyalty_program_locations',
    joinColumn: { name: 'loyalty_program_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'location_id', referencedColumnName: 'id' },
  })
  locations: Location[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
