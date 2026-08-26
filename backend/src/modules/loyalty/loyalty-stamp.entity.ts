import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { LoyaltyProgram } from './loyalty-program.entity';
import { ReceiptRedemption } from './receipt-redemption.entity';
import { LoyaltyReward } from './loyalty-reward.entity';

// Um carimbo = um pedido válido, já provado genuíno e ainda não usado
// pra fidelidade (ver ReceiptRedemption — `redemptionId` é único aqui,
// então nunca dá pra ter dois carimbos do mesmo pedido pro mesmo
// programa, mesmo em caso de clique duplo ou requisições
// simultâneas — a trava está no índice único do banco, não só na
// lógica). `rewardId` fica null enquanto o carimbo ainda não "fechou"
// um cartão completo — quando fecha, os carimbos mais ANTIGOS (FIFO)
// são marcados com o reward que geraram.
@Entity('loyalty_stamps')
export class LoyaltyStamp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'program_id' })
  programId: string;

  @ManyToOne(() => LoyaltyProgram, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'program_id' })
  program: LoyaltyProgram;

  @Column({ name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'redemption_id' })
  redemptionId: string;

  @ManyToOne(() => ReceiptRedemption, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'redemption_id' })
  redemption: ReceiptRedemption;

  @Column({ name: 'reward_id', type: 'uuid', nullable: true })
  rewardId: string | null;

  @ManyToOne(() => LoyaltyReward, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reward_id' })
  reward: LoyaltyReward | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
