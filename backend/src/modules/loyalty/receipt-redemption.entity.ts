import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { LoyaltyProgram } from './loyalty-program.entity';
import { Location } from '../locations/location.entity';

export type RedemptionPurpose = 'reembolso' | 'reclamacao' | 'retirada' | 'fidelidade' | 'outro';

// Registro de "esse cupom foi usado pra X" — o mecanismo ANTI-PASSBACK.
// Escanear o mesmo cupom de novo pro MESMO propósito nunca passa
// despercebido: o admin vê na hora quando, quem aprovou, e qualquer
// observação — mesmo que seja outro funcionário, em outro dia, em outra
// loja. Ver PromotionsService/OrdersService pro paralelo mais próximo
// (redemptionCount) — mesmo princípio de nunca confiar só na tela,
// sempre ter a trava de verdade no banco (índices únicos parciais, ver
// migration AddReceiptRedemptionsAndLoyaltyProgram).
@Entity('receipt_redemptions')
export class ReceiptRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // 'avulso' (pedido balcão/entrega) ou 'mesa' (sessão de mesa fechada)
  // — mesma distinção da assinatura do cupom (ver receipt-signature.ts).
  @Column({ name: 'source_type', type: 'varchar', length: 10 })
  sourceType: 'avulso' | 'mesa';

  @Column({ name: 'source_id' })
  sourceId: string;

  @Index()
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', length: 20 })
  purpose: RedemptionPurpose;

  @Column({ name: 'loyalty_program_id', type: 'uuid', nullable: true })
  loyaltyProgramId: string | null;

  @ManyToOne(() => LoyaltyProgram, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'loyalty_program_id' })
  loyaltyProgram: LoyaltyProgram | null;

  // Loja onde o pedido/sessão que gerou esse resgate aconteceu — snapshot
  // resolvido em LoyaltyService.resolveAndVerifyCode, guardado direto
  // aqui pra não precisar de join condicional (pedido avulso vs sessão
  // de mesa têm caminhos diferentes até a loja). Só informativo pro
  // histórico do admin, nunca usado pra restringir nada.
  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @ManyToOne(() => Location, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location | null;

  // Quem aprovou — sempre um funcionário logado, nunca anônimo.
  // `staffName` é um SNAPSHOT (não depende de join) pra continuar
  // mostrando o nome certo mesmo que o funcionário seja desligado depois.
  @Column({ name: 'staff_user_id' })
  staffUserId: string;

  @Column({ name: 'staff_name', type: 'varchar', length: 150 })
  staffName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
