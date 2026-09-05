import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, In } from 'typeorm';
import { Review } from './review.entity';
import { ReviewResponse } from './review-response.entity';
import { Order } from '../orders/order.entity';
import { CreateReviewDto } from './dto/create-review.dto';

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: RatingDistribution;
}

export interface PublicReviewDto {
  id: string;
  rating: number;
  comment: string | null;
  customerDisplayName: string;
  // Nunca preenchido quando `isAnonymous` — mesma regra do nome: review
  // anônima não vaza NENHUM dado que identifique o cliente, avatar
  // incluso.
  customerAvatarUrl: string | null;
  isAnonymous: boolean;
  createdAt: Date;
  response: { responseText: string; createdAt: Date } | null;
}

export interface AdminReviewDto {
  id: string;
  rating: number;
  comment: string | null;
  customerName: string;
  isAnonymous: boolean;
  locationName: string | null;
  orderId: string;
  createdAt: Date;
  response: { responseText: string; staffName: string; createdAt: Date } | null;
}

// "Felipe Santos" -> "Felipe S." — primeiro nome inteiro + inicial do
// último sobrenome. Nome de uma palavra só (ex: "Felipe") fica exatamente
// como está, NUNCA inventa uma inicial (bug comum: sobrenome vazio virar
// ponto solto) — padrão de mercado (Uber Eats, iFood, Google) pra
// balancear autenticidade com privacidade.
function formatPublicDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? 'Cliente';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const DEFAULT_EMPTY_DISTRIBUTION: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(ReviewResponse) private readonly responseRepo: Repository<ReviewResponse>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  // ---------- Elegibilidade (compra verificada) ----------

  // "Pedido concluído de verdade": balcão/entrega vira definitivo quando
  // `status` chega em 'entregue'; mesa vira definitivo quando a SESSÃO
  // fecha (o pedido individual pode nunca ter passado por 'entregue'
  // formalmente — quem fecha a conta é a sessão).
  //
  // Bug real corrigido aqui: pra pedido de mesa, a checagem olhava só
  // o status da SESSÃO ('fechada'), nunca o status do PEDIDO
  // individual dentro dela. Uma sessão fecha com todos os pedidos que
  // passaram por ela — inclusive um que o cliente cancelou no meio do
  // caminho. Sem essa linha, um pedido cancelado (que o cliente nunca
  // recebeu e não considera ter existido de verdade) aparecia como
  // "elegível pra avaliar" assim que a mesa fechava a conta — é
  // exatamente o relato de "pedir pra avaliar um pedido que nem
  // existe". Balcão/entrega já não tinham esse problema, porque
  // `status === 'entregue'` já exclui 'cancelado' por construção.
  private isOrderCompleted(order: Order): boolean {
    if (order.status === 'cancelado') return false;
    if (order.tableSessionId) {
      return order.tableSession?.status === 'fechada';
    }
    return order.status === 'entregue';
  }

  async findEligibleOrders(tenantId: string, customerId: string): Promise<Order[]> {
    const orders = await this.orderRepo.find({
      where: { tenantId, customerId },
      relations: { tableSession: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const completed = orders.filter((o) => this.isOrderCompleted(o));
    if (completed.length === 0) return [];

    // `withDeleted` de propósito: um pedido cuja review foi APAGADA
    // continua contando como "já usado" — nunca reaparece como
    // elegível. Só uma compra NOVA libera uma avaliação nova.
    const reviewed = await this.reviewRepo.find({
      where: { orderId: In(completed.map((o) => o.id)) },
      select: { orderId: true },
      withDeleted: true,
    });
    const reviewedOrderIds = new Set(reviewed.map((r) => r.orderId));
    return completed.filter((o) => !reviewedOrderIds.has(o.id));
  }

  // ---------- Cliente ----------

  async createReview(tenantId: string, customerId: string, dto: CreateReviewDto): Promise<Review> {
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId, tenantId },
      relations: { tableSession: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('Esse pedido não pertence a você.');
    }
    if (!this.isOrderCompleted(order)) {
      throw new BadRequestException('Esse pedido ainda não foi concluído — só dá pra avaliar depois.');
    }

    const review = this.reviewRepo.create({
      tenantId,
      customerId,
      orderId: order.id,
      locationId: order.locationId,
      rating: dto.rating,
      comment: dto.comment?.trim() || null,
      isAnonymous: dto.isAnonymous ?? false,
    });

    try {
      return await this.reviewRepo.save(review);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          'Esse pedido já foi avaliado antes — mesmo que a avaliação tenha sido apagada, não dá pra avaliar o mesmo pedido de novo. Faça outra compra pra avaliar novamente.',
        );
      }
      throw err;
    }
  }

  async findMyReviews(tenantId: string, customerId: string): Promise<Review[]> {
    return this.reviewRepo.find({
      where: { tenantId, customerId },
      order: { createdAt: 'DESC' },
    });
  }

  // Igual usado no cupom (image 4): mapa orderId -> nota, pra pintar
  // "★ 4" ao lado de cada pedido já avaliado no histórico.
  async findMyReviewsByOrderIds(
    tenantId: string,
    customerId: string,
    orderIds: string[],
  ): Promise<Map<string, Review>> {
    if (orderIds.length === 0) return new Map();
    const reviews = await this.reviewRepo.find({
      where: { tenantId, customerId, orderId: In(orderIds) },
    });
    return new Map(reviews.map((r) => [r.orderId, r]));
  }

  // Único jeito do cliente "desfazer" uma review — soft delete, nunca
  // some do banco, e o `orderId` continua ocupado pra sempre (ver
  // entity Review). Não existe updateReview nessa classe de propósito:
  // depois de publicada, é apagar ou nada.
  async deleteReview(tenantId: string, customerId: string, reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId, tenantId } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');
    if (review.customerId !== customerId) {
      throw new ForbiddenException('Essa avaliação não é sua.');
    }
    await this.reviewRepo.softRemove(review);
  }

  // ---------- Visão pública (cardápio, sem login) ----------

  async findPublicReviews(
    tenantId: string,
    locationId: string | null,
    page: number,
    pageSize: number,
  ): Promise<{ items: PublicReviewDto[]; total: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (locationId) where.locationId = locationId;

    const [items, total] = await this.reviewRepo.findAndCount({
      where,
      relations: { customer: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const responses = await this.responseRepo.find({ where: { reviewId: In(items.map((r) => r.id)) } });
    const responseByReviewId = new Map(responses.map((r) => [r.reviewId, r]));

    return {
      items: items.map((review) => this.toPublicDto(review, responseByReviewId.get(review.id) ?? null)),
      total,
    };
  }

  // Nunca expõe o Customer completo (email, telefone...) pro público —
  // só o nome já formatado (ou "Anônimo"), e o avatar só quando a
  // review NÃO é anônima. Bug real que isso corrige: o avatar nunca
  // era incluído aqui, mesmo já vindo carregado na query (`relations:
  // { customer: true }`) — o frontend sempre caía no ícone genérico
  // porque o campo simplesmente não existia na resposta.
  private toPublicDto(review: Review, response: ReviewResponse | null): PublicReviewDto {
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      customerDisplayName: review.isAnonymous
        ? 'Anônimo'
        : formatPublicDisplayName(review.customer?.name ?? 'Cliente'),
      customerAvatarUrl: review.isAnonymous ? null : (review.customer?.avatarUrl ?? null),
      isAnonymous: review.isAnonymous,
      createdAt: review.createdAt,
      response: response
        ? { responseText: response.responseText, createdAt: response.createdAt }
        : null,
    };
  }

  async getSummary(tenantId: string, locationId: string | null): Promise<ReviewSummary> {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('r.tenantId = :tenantId', { tenantId });
    if (locationId) qb.andWhere('r.locationId = :locationId', { locationId });
    const rows = await qb.groupBy('r.rating').getRawMany<{ rating: number; count: string }>();

    const distribution: RatingDistribution = { ...DEFAULT_EMPTY_DISTRIBUTION };
    let totalCount = 0;
    let weightedSum = 0;
    for (const row of rows) {
      const rating = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      const count = Number(row.count);
      distribution[rating] = count;
      totalCount += count;
      weightedSum += rating * count;
    }

    return {
      average: totalCount > 0 ? Math.round((weightedSum / totalCount) * 100) / 100 : 0,
      count: totalCount,
      distribution,
    };
  }

  // Resumo de TODAS as lojas do tenant de uma vez (pra tela de "escolha
  // a loja", ver print 3) — uma query só, agrupando por location_id, em
  // vez de N chamadas de getSummary (uma por loja).
  async getSummaryByLocation(tenantId: string): Promise<Map<string, ReviewSummary>> {
    const rows = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.locationId', 'locationId')
      .addSelect('r.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('r.tenantId = :tenantId', { tenantId })
      .andWhere('r.locationId IS NOT NULL')
      .groupBy('r.locationId')
      .addGroupBy('r.rating')
      .getRawMany<{ locationId: string; rating: number; count: string }>();

    const byLocation = new Map<string, ReviewSummary>();
    for (const row of rows) {
      let summary = byLocation.get(row.locationId);
      if (!summary) {
        summary = { average: 0, count: 0, distribution: { ...DEFAULT_EMPTY_DISTRIBUTION } };
        byLocation.set(row.locationId, summary);
      }
      const rating = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      const count = Number(row.count);
      summary.distribution[rating] = count;
      summary.count += count;
    }
    for (const summary of byLocation.values()) {
      const weightedSum = ([1, 2, 3, 4, 5] as const).reduce(
        (sum, n) => sum + n * summary.distribution[n],
        0,
      );
      summary.average = summary.count > 0 ? Math.round((weightedSum / summary.count) * 100) / 100 : 0;
    }
    return byLocation;
  }

  // ---------- Admin ----------

  // Sem filtro de status — não existe mais "oculta". Toda review não
  // apagada aparece aqui, sempre, nota baixa inclusa.
  async findAllForAdmin(tenantId: string, filters: { locationId?: string }): Promise<AdminReviewDto[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters.locationId) where.locationId = filters.locationId;

    const reviews = await this.reviewRepo.find({
      where,
      relations: { customer: true, location: true },
      order: { createdAt: 'DESC' },
    });
    const responses = await this.responseRepo.find({
      where: { reviewId: In(reviews.map((r) => r.id)) },
    });
    const responseByReviewId = new Map(responses.map((r) => [r.reviewId, r]));

    return reviews.map((review) => {
      const response = responseByReviewId.get(review.id) ?? null;
      return {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        // Admin sempre vê o nome de verdade, mesmo em review anônima —
        // é o dono do negócio, precisa poder identificar se precisar dar
        // suporte a esse cliente. Só a vitrine PÚBLICA anonimiza.
        customerName: review.customer?.name ?? 'Cliente',
        isAnonymous: review.isAnonymous,
        locationName: review.location?.name ?? null,
        orderId: review.orderId,
        createdAt: review.createdAt,
        response: response
          ? { responseText: response.responseText, staffName: response.staffName, createdAt: response.createdAt }
          : null,
      };
    });
  }

  async getAdminSummary(tenantId: string): Promise<ReviewSummary> {
    return this.getSummary(tenantId, null);
  }

  // Responder é sempre um UPSERT: cria na primeira vez, atualiza se já
  // existia (1 resposta por review). Responder continua permitido —
  // só ocultar/editar a review do cliente é que foi removido.
  async respondToReview(
    tenantId: string,
    reviewId: string,
    staffUser: { userId: string; email: string },
    responseText: string,
  ): Promise<ReviewResponse> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId, tenantId } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');

    let response = await this.responseRepo.findOne({ where: { reviewId, tenantId } });
    if (response) {
      response.responseText = responseText.trim();
      response.staffUserId = staffUser.userId;
      response.staffName = staffUser.email;
    } else {
      response = this.responseRepo.create({
        tenantId,
        reviewId,
        responseText: responseText.trim(),
        staffUserId: staffUser.userId,
        staffName: staffUser.email,
      });
    }
    return this.responseRepo.save(response);
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505';
  }
}
