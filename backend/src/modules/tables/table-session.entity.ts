import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { RestaurantTable } from './restaurant-table.entity';
import { Order } from '../orders/order.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

@Entity('table_sessions')
export class TableSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Index()
  @Column({ name: 'table_id' })
  tableId: string;

  @ManyToOne(() => RestaurantTable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'table_id' })
  table: RestaurantTable;

  @Index()
  @Column({ type: 'varchar', length: 30, default: 'aberta' })
  status: string; // aberta, fechamento_solicitado, fechada

  @Column({ name: 'opened_at', type: 'timestamptz', default: () => 'now()' })
  openedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  // Definida pelo cliente ao solicitar o fechamento (opcional).
  @Column({ name: 'tip_amount', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  tipAmount: number;

  // Preenchidos pelo garçom/admin ao fechar a conta de fato.
  @Column({ name: 'payment_method', type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null; // dinheiro, cartao, pix

  @Column({ name: 'amount_received', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  amountReceived: number | null; // só relevante para pagamento em dinheiro

  @Column({ name: 'change_given', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  changeGiven: number | null;

  // Soft-delete usado pelo histórico (expiração de 7 dias). Ver HistoryService.
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  // Marcação manual de "requer atenção" no histórico (destaque vermelho na
  // UI) — não afeta nada do fluxo operacional, é só administrativo.
  @Column({ type: 'boolean', default: false })
  flagged: boolean;

  @OneToMany(() => Order, (order) => order.tableSession)
  orders: Order[];
}
