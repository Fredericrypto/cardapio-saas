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

  // Qual cliente LOGADO abriu essa sessão (nulo pra convidado). Só serve
  // pra fechar sozinha uma mesa VAZIA (sem pedido nenhum) que esse mesmo
  // cliente tinha deixado aberta em outra mesa, quando ele abre uma
  // mesa nova — nunca usado como "dono" da mesa pra mais nada, já que
  // várias pessoas podem usar a mesma sessão.
  @Column({ name: 'opened_by_customer_id', type: 'uuid', nullable: true })
  openedByCustomerId: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  // Definida pelo cliente ao solicitar o fechamento (opcional).
  @Column({ name: 'tip_amount', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  tipAmount: number;

  // ---- Escolhido pelo CLIENTE, no momento de solicitar o fechamento
  // (pedido do Felipe, 28/09 — antes disso o admin decidia tudo sozinho,
  // sem nenhum sinal de quem ia pagar). Só uma INTENÇÃO: o pagamento de
  // verdade (Pix/cartão) continua acontecendo fisicamente entre cliente
  // e restaurante; o admin só confirma. Nunca usado pra travar nada —
  // ele pode mudar de ideia e o admin ajusta na hora de fechar.
  @Column({ name: 'requested_payment_method', type: 'varchar', length: 20, nullable: true })
  requestedPaymentMethod: string | null; // dinheiro, cartao, pix

  // Só preenchido quando requestedPaymentMethod = 'dinheiro'.
  @Column({ name: 'cash_delivery_preference', type: 'varchar', length: 20, nullable: true })
  cashDeliveryPreference: string | null; // balcao, mesa

  // Cliente logado que pediu pra usar o saldo de cashback dele nessa
  // conta (null = ninguém pediu, ou pediu como convidado — convidado
  // não tem carteira). O valor de verdade só é debitado da carteira em
  // closeSession (nunca aqui) — ver TablesService.getSessionSummary e
  // closeSession, que sempre recalculam contra o saldo AO VIVO.
  @Column({ name: 'cashback_requested_by_customer_id', type: 'uuid', nullable: true })
  cashbackRequestedByCustomerId: string | null;

  // Quem tocou em "Solicitar fechamento" — SEMPRE gravado quando é um
  // cliente logado (independente de ter pedido pra usar cashback ou
  // não). É o alvo do cashback GANHO nessa sessão quando
  // cashbackSplitMode = 'pagador' (28/09) — ver
  // TablesService.creditCashbackForClosedSession.
  @Column({ name: 'closing_requested_by_customer_id', type: 'uuid', nullable: true })
  closingRequestedByCustomerId: string | null;

  // Como dividir o cashback GANHO nessa sessão entre os clientes que
  // pediram algo (pedido do Felipe, 28/09) — só perguntado quando há
  // mais de um cliente distinto com pedido na mesa:
  //   'por_pedido' (padrão/comportamento de sempre): cada cliente
  //     recebe o cashback dos PRÓPRIOS pedidos.
  //   'pagador': tudo vai pra closingRequestedByCustomerId.
  // null = mesa de uma pessoa só, ou ninguém escolheu (cai no padrão
  // 'por_pedido').
  @Column({ name: 'cashback_split_mode', type: 'varchar', length: 20, nullable: true })
  cashbackSplitMode: string | null;

  // Quanto de cashback foi REALMENTE debitado ao fechar a conta (0 até
  // lá). Nunca é a intenção do cliente — é sempre o valor final, já
  // limitado pelo saldo disponível e pelo total da conta no instante do
  // fechamento.
  @Column({ name: 'cashback_used', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  cashbackUsed: number;

  // ---- Pix de verdade via Mercado Pago (28/09) — mesmo mecanismo já
  // usado pra pedidos avulsos de balcão/entrega (ver
  // OrdersService/MercadoPagoService), agora também pro TOTAL da mesa.
  // Preenchidos só quando o cliente escolhe Pix E o tenant tem Mercado
  // Pago configurado; sem isso, Pix de mesa continua sendo só a
  // intenção combinada em pessoa (paymentStatus fica null).
  @Column({ name: 'mp_payment_id', type: 'varchar', nullable: true })
  mpPaymentId: string | null;

  @Column({ name: 'pix_payload', type: 'text', nullable: true })
  pixPayload: string | null; // "Pix copia e cola"

  @Column({ name: 'pix_expires_at', type: 'timestamptz', nullable: true })
  pixExpiresAt: Date | null;

  // pendente | pago | falhou — null enquanto não existe nenhuma cobrança
  // Pix de gateway pra essa sessão.
  @Column({ name: 'payment_status', type: 'varchar', length: 20, nullable: true })
  paymentStatus: string | null;

  // Preenchidos pelo garçom/admin ao fechar a conta de fato.
  @Column({ name: 'payment_method', type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null; // dinheiro, cartao, pix, cashback (conta totalmente paga com saldo)

  @Column({ name: 'amount_received', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  amountReceived: number | null; // só relevante para pagamento em dinheiro

  @Column({ name: 'change_given', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  changeGiven: number | null;

  // Preenchidos SÓ quando a sessão é encerrada pelo escape-hatch
  // administrativo (sem pagamento, pra sessão travada/de teste) — nunca
  // no fechamento normal (que sempre exige forma de pagamento). Ficam
  // NULL em toda sessão fechada normalmente, o que já serve de filtro
  // pra auditoria: "toda sessão com forceClosedReason preenchido foi
  // fechada sem pagamento, alguém precisa revisar por quê".
  @Column({ name: 'force_closed_reason', type: 'text', nullable: true })
  forceClosedReason: string | null;

  @Column({ name: 'force_closed_by_user_id', type: 'uuid', nullable: true })
  forceClosedByUserId: string | null;

  // Snapshot do e-mail no momento — nunca depende de o AdminUser ainda
  // existir depois (conta pode ser removida da equipe no futuro; a
  // auditoria não pode desaparecer junto).
  @Column({ name: 'force_closed_by_email', type: 'varchar', length: 255, nullable: true })
  forceClosedByEmail: string | null;

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
