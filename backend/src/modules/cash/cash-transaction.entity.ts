import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

// Movimentações de caixa: sangria (retirada), suprimento (entrada manual),
// abertura e fechamento. Alimenta "Total de sangrias" na aba Análise.
export type CashTransactionType = 'sangria' | 'suprimento' | 'abertura' | 'fechamento';

@Entity('cash_transactions')
@Index(['tenantId', 'createdAt'])
export class CashTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Loja (caixa) da movimentação — opcional: null = estabelecimento todo.
  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @ManyToOne(() => Location, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location | null;

  // Operador responsável (admin autenticado).
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  type: CashTransactionType;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
