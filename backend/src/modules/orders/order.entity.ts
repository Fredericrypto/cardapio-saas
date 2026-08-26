import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { TableSession } from '../tables/table-session.entity';
import { OrderItem } from './order-item.entity';
import { Customer } from '../customers/customer.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Qual filial física recebeu esse pedido — pra mesa, vem direto da
  // mesa (ela já pertence a uma location); pra balcão/entrega, vem da
  // location que o cliente escolheu antes de montar o carrinho.
  @Index()
  @Column({ name: 'location_id', nullable: true })
  locationId: string | null;

  @ManyToOne(() => Location, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location | null;

  // Presente só quando orderType === 'mesa': vincula o pedido à visita atual
  // daquela mesa, permitindo agrupar tudo em "Minha Conta".
  @Index()
  @Column({ name: 'table_session_id', nullable: true })
  tableSessionId: string | null;

  @ManyToOne(() => TableSession, { nullable: true })
  @JoinColumn({ name: 'table_session_id' })
  tableSession: TableSession | null;

  // Presente só quando o pedido foi feito por um cliente LOGADO (conta
  // de cliente final, ver customers/*) — pedido de convidado (guest
  // checkout, sem login) continua funcionando normal com isso null.
  // Nunca confiar em customerId vindo do corpo da requisição: é sempre
  // derivado do token JWT do cliente (ver OrdersController.create).
  @Index()
  @Column({ name: 'customer_id', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 150, nullable: true })
  customerName: string | null;

  @Column({ name: 'customer_phone', type: 'varchar', length: 20, nullable: true })
  customerPhone: string | null;

  @Column({ name: 'table_number', type: 'varchar', length: 20, nullable: true })
  tableNumber: string | null;

  @Column({ name: 'order_type', length: 20, default: 'balcao' })
  orderType: string; // balcao, mesa, entrega

  @Index()
  @Column({ length: 20, default: 'pendente' })
  status: string; // aguardando_pagamento, pendente, confirmado, preparando, pronto, entregue, cancelado

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  total: number;

  @Column({ name: 'delivery_fee', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  deliveryFee: number;

  // Desconto de promoção aplicado automaticamente (ver PromotionsService
  // .pickBestApplicable, chamado sempre no backend — nunca confiamos em
  // desconto vindo do cliente). Já vem DESCONTADO de `total` (mesmo
  // padrão de deliveryFee: guardado separado só pra exibir "Desconto: -R$X"
  // no cupom/carrinho, mas o valor cobrado de verdade é `total`).
  @Column({ name: 'discount_amount', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  discountAmount: number;

  // Referência à(s) promoção(ões) usada(s) — pode ter mais de uma (ex:
  // um cupom pro burger + outro pra coca-cola no MESMO pedido, cada um
  // descontando itens diferentes; ver
  // PromotionsService.validateSelectedPromotions). `promotionId` (singular,
  // legado) fica como a PRIMEIRA da lista, só pra manter telas/consultas
  // antigas funcionando sem precisar migrar todas de uma vez — a lista é
  // sempre a fonte de verdade daqui pra frente. Pode ficar com um id que
  // não existe mais se a promoção for apagada depois (ON DELETE SET NULL
  // não se aplica a array — por isso o título fica congelado em
  // `promotionTitlesSnapshot`, pra sempre poder mostrar "Desconto
  // (50% off + Coca-Cola grátis)" mesmo que as promoções originais não
  // existam mais).
  @Index()
  @Column({ name: 'promotion_id', type: 'uuid', nullable: true })
  promotionId: string | null;

  @Column({ name: 'promotion_ids', type: 'uuid', array: true, nullable: true })
  promotionIds: string[] | null;

  @Column({ name: 'promotion_title_snapshot', type: 'varchar', length: 60, nullable: true })
  promotionTitleSnapshot: string | null;

  @Column({ name: 'promotion_titles_snapshot', type: 'varchar', array: true, length: 60, nullable: true })
  promotionTitlesSnapshot: string[] | null;

  // Endereço completo formatado (já confirmado pela geocodificação),
  // ponto de referência em texto livre (não entra na geocodificação, é só
  // pra ajudar o entregador), e a distância calculada no momento da
  // compra — tudo congelado no pedido pra auditoria, mesmo se o
  // estabelecimento mudar de endereço depois.
  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ name: 'delivery_reference_point', type: 'text', nullable: true })
  deliveryReferencePoint: string | null;

  @Column({ name: 'delivery_distance_km', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  deliveryDistanceKm: number | null;

  // false = a geocodificação não confirmou o número exato do endereço
  // (achou só a rua/bairro, não o número exato) — sinaliza pro admin
  // conferir com o cliente antes de despachar a entrega.
  @Column({ name: 'delivery_address_precise', type: 'boolean', nullable: true })
  deliveryAddressPrecise: boolean | null;

  @Column({ name: 'payment_method', type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null; // dinheiro, pix, cartao, indefinido

  @Column({ name: 'payment_status', length: 20, default: 'pendente' })
  paymentStatus: string; // pendente, pago, falhou

  // Preenchidos só quando paymentMethod === 'pix' e o restaurante tem Pix
  // habilitado em Configurações — o payload fica CONGELADO no momento da
  // criação do pedido (mesmo valor pra sempre), então o QR nunca muda de
  // valor por trás do cliente. status vira 'aguardando_pagamento' até o
  // admin confirmar o recebimento (ver PaymentsService.confirmPixPayment)
  // ou o prazo expirar sozinho (ver checkPixStatus).
  @Column({ name: 'pix_payload', type: 'text', nullable: true })
  pixPayload: string | null;

  @Column({ name: 'pix_expires_at', type: 'timestamptz', nullable: true })
  pixExpiresAt: Date | null;

  // Preenchido só quando o Pix passa pelo Mercado Pago (não pelo QR
  // estático) — é o id do pagamento lá, usado tanto pelo webhook quanto
  // pela consulta direta de status.
  @Column({ name: 'mp_payment_id', type: 'varchar', length: 60, nullable: true })
  mpPaymentId: string | null;

  // Gorjeta escolhida pelo cliente no carrinho — só usada em pedidos
  // avulsos (balcão/entrega). Fica fora de `total` de propósito (mesmo
  // padrão de TableSession.tipAmount), pra sempre poder mostrar
  // "R$ X + R$ Y gorjeta" separado no painel/cupom.
  @Column({ name: 'tip_amount', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  tipAmount: number;

  // Só preenchido quando paymentMethod === 'dinheiro' — quanto o cliente
  // entregou, pra calcular/exibir o troco no cupom depois.
  @Column({ name: 'amount_received', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  amountReceived: number | null;

  // Quanto do saldo de cashback do cliente foi usado como desconto
  // NESSE pedido — já vem DESCONTADO de `total` (mesmo padrão de
  // discountAmount/deliveryFee: guardado separado só pra exibir
  // "Cashback usado: -R$X" no cupom, o valor cobrado de verdade já é
  // `total`). Ver CashbackService.consume, chamado em OrdersService.create.
  @Column({ name: 'cashback_used', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  cashbackUsed: number;

  // Quanto de cashback esse pedido GEROU pro cliente — só preenchido no
  // momento em que o pagamento é confirmado de verdade (ver
  // OrdersService.concludeWithPayment/confirmPixPayment/
  // applyMercadoPagoStatus e TablesService.closeSession), nunca na
  // criação do pedido. Snapshot só pra exibir no cupom/histórico —
  // quem manda de verdade é sempre o CashbackLedgerEntry.
  @Column({ name: 'cashback_earned', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  cashbackEarned: number;

  // Trava contra "recebeu o produto e cancelou depois": vira true no
  // exato momento em que o cashback desse pedido se torna definitivo
  // (pagamento confirmado / sessão de mesa fechada) — mesmos 4 pontos
  // que setam cashbackEarned. A partir daí, cancelar o pedido NUNCA
  // mais mexe no saldo de cashback (nem devolve o usado, nem zera o
  // ganho) — ver OrdersService.markCancelled. Antes disso, cancelar
  // continua revertendo normalmente.
  @Column({ name: 'cashback_locked', default: false })
  cashbackLocked: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Soft-delete usado pelo histórico (expiração de 7 dias) — nunca hard
  // delete, dado o contexto de auditoria financeira. Ver HistoryService.
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  // Marcação manual de "requer atenção" no histórico (destaque vermelho na
  // UI) — não afeta nada do fluxo operacional, é só administrativo.
  @Column({ type: 'boolean', default: false })
  flagged: boolean;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];
}
