import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { Order } from '../orders/order.entity';
import { Location } from '../locations/location.entity';

// Avaliação de um pedido — a prova de compra É o próprio `orderId`
// (UNIQUE): só existe review se existiu um pedido de verdade, concluído
// de verdade (ver ReviewsService.isOrderCompleted), do MESMO cliente que
// está avaliando.
//
// Regras (deliberadamente rígidas, decisão de produto do dono do
// restaurante, não uma limitação técnica):
// - Depois de publicada, a review é IMUTÁVEL — nem o cliente edita o
//   texto/nota, nem (principalmente) o estabelecimento. Não existe
//   nenhum método de update nessa entidade de propósito.
// - O cliente pode APAGAR a própria review a qualquer momento — é
//   sempre soft-delete (`deletedAt`), nunca some de verdade do banco
//   (auditoria), e ISSO NÃO libera o pedido pra uma nova avaliação: o
//   índice único em `orderId` continua contando a linha apagada. Quem
//   quiser avaliar de novo precisa fazer OUTRA compra. Mesmo mecanismo
//   de soft-delete já usado em Order/TableSession.
// - O estabelecimento NUNCA edita, apaga, nem oculta review de cliente
//   — só pode responder publicamente (ReviewResponse). Nota baixa
//   permanece visível, sempre. Não existe "status" nessa entity: toda
//   review não-apagada está automaticamente visível.
@Entity('reviews')
@Index(['orderId'], { unique: true })
export class Review {
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

  // UNIQUE — o que impede duas reviews do mesmo pedido, e (por conta do
  // soft-delete) também impede reavaliar o mesmo pedido depois de
  // apagar a review anterior.
  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  // Snapshot da loja de onde veio o pedido avaliado — cada unidade tem
  // sua nota/lista de reviews independente (ver ReviewsService.
  // getSummary/findPublicReviews, sempre filtráveis por locationId).
  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @ManyToOne(() => Location, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location | null;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  // Publicar anônimo esconde nome/avatar do PÚBLICO (vira "Anônimo" +
  // avatar genérico — ver ReviewsService.toPublicDto). O admin sempre
  // vê o nome de verdade (é o dono do negócio, precisa poder identificar
  // quem escreveu se precisar dar suporte), só a vitrine pública que
  // anonimiza.
  @Column({ name: 'is_anonymous', default: false })
  isAnonymous: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Soft-delete — nunca hard delete. Ver comentário da classe.
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
