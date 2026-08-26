import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { LoyaltyProgram } from './loyalty-program.entity';

// Um cartão completo = uma recompensa. 'pendente' até o cliente
// efetivamente RECEBER o prêmio físico (o funcionário confirma na hora
// da entrega); prêmios de cashback são a exceção — creditam sozinhos e
// já nascem 'resgatado' (não tem "entrega física" pra confirmar, ver
// LoyaltyService.grantRewardIfEligible).
@Entity('loyalty_rewards')
export class LoyaltyReward {
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

  @Column({ type: 'varchar', length: 15, default: 'pendente' })
  status: 'pendente' | 'resgatado';

  @CreateDateColumn({ name: 'granted_at', type: 'timestamptz' })
  grantedAt: Date;

  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true })
  redeemedAt: Date | null;

  @Column({ name: 'redeemed_by_staff_user_id', type: 'uuid', nullable: true })
  redeemedByStaffUserId: string | null;

  @Column({ name: 'redeemed_by_staff_name', type: 'varchar', length: 150, nullable: true })
  redeemedByStaffName: string | null;
}
