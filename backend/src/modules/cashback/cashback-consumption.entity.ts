import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { Order } from '../orders/order.entity';
import { CashbackLedgerEntry } from './cashback-ledger-entry.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

// Detalhamento de QUANTO um pedido gastou de CADA crédito de cashback —
// necessário porque um único pedido pode consumir de VÁRIAS entradas do
// ledger ao mesmo tempo (ex: saldo formado por 3 créditos de R$5 cada,
// pedido gasta R$12 => consome R$5 + R$5 + R$2, 3 linhas aqui). Mesmo
// papel que OrderPromotionDiscount cumpre pra promoções: sem essa
// tabela, não dava pra saber de onde exatamente veio cada centavo
// debitado, nem reverter direito se o pedido for cancelado depois.
//
// UNIQUE (order_id) NÃO é aplicado de propósito: um pedido gera
// N linhas aqui (uma por crédito consumido), nunca uma só.
@Entity('cashback_consumptions')
export class CashbackConsumption {
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

  @Index()
  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Index()
  @Column({ name: 'ledger_entry_id' })
  ledgerEntryId: string;

  @ManyToOne(() => CashbackLedgerEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ledger_entry_id' })
  ledgerEntry: CashbackLedgerEntry;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  amount: number;

  // true = pedido foi cancelado depois de já ter gasto esse cashback, e
  // o valor já foi devolvido pro(s) crédito(s) de origem (ver
  // CashbackService.reverseConsumptionForOrder). Fica marcada, não
  // apagada — pra manter o histórico completo de "o que aconteceu",
  // igual o resto do sistema nunca apaga registro financeiro de
  // verdade.
  @Column({ default: false })
  reversed: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
