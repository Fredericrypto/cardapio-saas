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

// Duas avaliações bem diferentes moram na mesma tabela, distinguidas por
// `targetType`:
// - 'restaurant': UMA por cliente por restaurante (estilo Play Store —
//   um app, uma nota). Pode ter texto (`comment`).
// - 'item': uma por cliente por PRODUTO (`productId` obrigatório nesse
//   caso). Só estrelas — nunca tem texto, mesmo que `comment` venha
//   preenchido no DTO, o serviço descarta.
//
// A prova de compra é sempre o `orderId` de um pedido CONCLUÍDO de
// verdade (ver ReviewsService.isOrderCompleted) do mesmo cliente. Cada
// pedido pode gerar VÁRIAS linhas aqui agora: no máximo uma de
// restaurante + uma por produto distinto contido nele — por isso o
// índice único de antes (um único `orderId` pra sempre) virou dois
// índices PARCIAIS (ver migration RestructureReviewsForItemsAndRestaurant):
//   - (order_id) WHERE target_type = 'restaurant'
//   - (order_id, product_id) WHERE target_type = 'item'
//
// Regras (deliberadamente rígidas, decisão de produto do dono do
// restaurante, não uma limitação técnica):
// - Depois de publicada, a review é IMUTÁVEL — nem o cliente edita nota
//   ou texto, nem (principalmente) o estabelecimento. Não existe nenhum
//   método de update nessa entidade de propósito.
// - O cliente pode APAGAR a própria review a qualquer momento — sempre
//   soft-delete (`deletedAt`), nunca some de verdade do banco
//   (auditoria). Apagar NÃO libera o mesmo pedido pra reavaliar o mesmo
//   alvo — os índices únicos acima contam a linha apagada também (ver
//   consultas com `withDeleted: true` no serviço). Só um pedido NOVO
//   (ainda não usado por nenhuma linha, ativa ou apagada, desse mesmo
//   alvo) libera uma tentativa nova.
// - Só pode existir UMA review ATIVA por (cliente, alvo) ao mesmo tempo
//   — isso não vem do índice único (que é por order_id, não por
//   cliente+alvo), é checado no serviço antes de criar.
// - O estabelecimento NUNCA edita, apaga, nem oculta review de cliente
//   — só pode responder publicamente (ReviewResponse, só reviews de
//   restaurante fazem sentido responder). Nota baixa permanece visível,
//   sempre.
@Entity('reviews')
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

  // O pedido CONCLUÍDO que "pagou" essa avaliação — nunca reutilizável
  // pro mesmo alvo depois (ver índices parciais no comentário da classe).
  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  // 'restaurant' | 'item'.
  @Column({ name: 'target_type', type: 'varchar', length: 20, default: 'restaurant' })
  targetType: 'restaurant' | 'item';

  // Obrigatório quando targetType='item' (o PRODUTO sendo avaliado),
  // sempre null quando targetType='restaurant'.
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

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

  // Só usado quando targetType='restaurant' — avaliação de item é só
  // estrela, por decisão de produto (ver comentário da classe).
  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  // Publicar anônimo esconde nome/avatar do PÚBLICO (vira "Anônimo" +
  // avatar genérico — ver ReviewsService.toPublicDto). O admin sempre
  // vê o nome de verdade (é o dono do negócio, precisa poder identificar
  // quem escreveu se precisar dar suporte), só a vitrine pública que
  // anonimiza. Só se aplica a avaliação de RESTAURANTE — item nunca tem
  // nome de cliente exibido em lugar nenhum, então esse campo não tem
  // efeito prático numa review de item.
  @Column({ name: 'is_anonymous', default: false })
  isAnonymous: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Soft-delete — nunca hard delete. Ver comentário da classe.
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
