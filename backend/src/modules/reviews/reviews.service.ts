import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, In } from 'typeorm';
import { Review } from './review.entity';
import { ReviewResponse } from './review-response.entity';
import { Order } from '../orders/order.entity';
import { OrderItem } from '../orders/order-item.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { CustomerVerificationService } from '../customers/customer-verification.service';

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
  customerAvatarUrl: string | null;
  customerIsVerified: boolean;
  isAnonymous: boolean;
  createdAt: Date;
  response: { responseText: string; createdAt: Date } | null;
}

export interface AdminReviewDto {
  id: string;
  rating: number;
  comment: string | null;
  customerName: string;
  customerIsVerified: boolean;
  isAnonymous: boolean;
  targetType: 'restaurant' | 'item';
  productName: string | null;
  locationName: string | null;
  orderId: string;
  createdAt: Date;
  response: { responseText: string; staffName: string; createdAt: Date } | null;
}

export interface ReviewPromptInfo {
  canReviewRestaurant: boolean;
  items: Array<{ productId: string; productName: string; productImageUrl: string | null }>;
}

export interface MyItemReviewDto {
  id: string;
  rating: number;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  orderId: string;
  createdAt: Date;
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
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    private readonly verificationService: CustomerVerificationService,
  ) {}

  // ---------- Elegibilidade (compra verificada) ----------

  // "Pedido concluído de verdade": balcão/entrega vira definitivo quando
  // `status` chega em 'entregue'; mesa vira definitivo quando a SESSÃO
  // fecha (o pedido individual pode nunca ter passado por 'entregue'
  // formalmente — quem fecha a conta é a sessão). Pedido cancelado
  // nunca conta, mesmo dentro de uma sessão já fechada.
  private isOrderCompleted(order: Order): boolean {
    if (order.status === 'cancelado') return false;
    if (order.tableSessionId) {
      return order.tableSession?.status === 'fechada';
    }
    return order.status === 'entregue';
  }

  // Só uma avaliação de RESTAURANTE ativa por cliente por tenant, a
  // qualquer momento — estilo Play Store (um app, uma nota). Isso NÃO
  // vem do índice único do banco (que é por order_id) — é essa checagem
  // aqui que garante o "só uma por vez", independente de qual pedido
  // tentar usar pra criar outra.
  private async hasActiveRestaurantReview(tenantId: string, customerId: string): Promise<boolean> {
    const count = await this.reviewRepo.count({
      where: { tenantId, customerId, targetType: 'restaurant' },
    });
    return count > 0;
  }

  private async hasActiveItemReview(
    tenantId: string,
    customerId: string,
    productId: string,
  ): Promise<boolean> {
    const count = await this.reviewRepo.count({
      where: { tenantId, customerId, targetType: 'item', productId },
    });
    return count > 0;
  }

  // `withDeleted: true` de propósito nos dois métodos abaixo — um
  // pedido cuja review foi APAGADA continua contando como "já usado"
  // pra aquele alvo específico. Só uma compra NOVA (ainda não usada)
  // libera uma avaliação nova pro mesmo alvo.
  private async isOrderUsedForRestaurant(orderId: string): Promise<boolean> {
    const count = await this.reviewRepo.count({
      where: { orderId, targetType: 'restaurant' },
      withDeleted: true,
    });
    return count > 0;
  }

  private async isOrderProductUsed(orderId: string, productId: string): Promise<boolean> {
    const count = await this.reviewRepo.count({
      where: { orderId, targetType: 'item', productId },
      withDeleted: true,
    });
    return count > 0;
  }

  // O que mostrar no fluxo de prompt sequencial pra ESSE pedido
  // específico (disparado pela notificação "como foi seu pedido?" —
  // ver comentário em ReviewPromptProvider no frontend). Nunca inclui
  // um item/restaurante que já não seja elegível (já tem review ativa,
  // ou esse pedido específico já foi usado pra esse alvo) — o
  // frontend não precisa filtrar nada, só iterar o que vier aqui.
  async getReviewPromptInfo(
    tenantId: string,
    customerId: string,
    orderId: string,
  ): Promise<ReviewPromptInfo> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, tenantId, customerId },
      relations: { tableSession: true },
    });
    if (!order || !this.isOrderCompleted(order)) {
      return { canReviewRestaurant: false, items: [] };
    }

    const [alreadyActiveRestaurant, orderAlreadyUsedForRestaurant] = await Promise.all([
      this.hasActiveRestaurantReview(tenantId, customerId),
      this.isOrderUsedForRestaurant(orderId),
    ]);
    const canReviewRestaurant = !alreadyActiveRestaurant && !orderAlreadyUsedForRestaurant;

    const orderItems = await this.orderItemRepo.find({
      where: { orderId },
      relations: { product: true },
    });
    // Um pedido pode ter o MESMO produto em duas linhas (ex: duas
    // variações de opções do mesmo Burger) — dedupe por productId, só
    // uma avaliação por produto faz sentido, não por linha do pedido.
    const seenProductIds = new Set<string>();
    const items: ReviewPromptInfo['items'] = [];
    for (const oi of orderItems) {
      if (seenProductIds.has(oi.productId)) continue;
      seenProductIds.add(oi.productId);
      const [activeItem, orderProductUsed] = await Promise.all([
        this.hasActiveItemReview(tenantId, customerId, oi.productId),
        this.isOrderProductUsed(orderId, oi.productId),
      ]);
      if (!activeItem && !orderProductUsed) {
        items.push({
          productId: oi.productId,
          productName: oi.productName,
          productImageUrl: oi.product?.imageUrl ?? null,
        });
      }
    }

    return { canReviewRestaurant, items };
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

    if (dto.targetType === 'restaurant') {
      if (await this.hasActiveRestaurantReview(tenantId, customerId)) {
        throw new ConflictException(
          'Você já avaliou esse restaurante. Pra avaliar de novo, apague a avaliação atual e faça uma nova compra.',
        );
      }
      const review = this.reviewRepo.create({
        tenantId,
        customerId,
        orderId: order.id,
        targetType: 'restaurant',
        productId: null,
        locationId: order.locationId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        isAnonymous: dto.isAnonymous ?? false,
      });
      return this.saveOrTranslateConflict(review);
    }

    // targetType === 'item'
    if (!dto.productId) {
      throw new BadRequestException('Informe o produto que está avaliando.');
    }
    const belongsToOrder = await this.orderItemRepo.exists({
      where: { orderId: order.id, productId: dto.productId },
    });
    if (!belongsToOrder) {
      throw new BadRequestException('Esse produto não faz parte desse pedido.');
    }
    if (await this.hasActiveItemReview(tenantId, customerId, dto.productId)) {
      throw new ConflictException(
        'Você já avaliou esse item. Pra avaliar de novo, apague a avaliação atual e peça esse item de novo.',
      );
    }
    const review = this.reviewRepo.create({
      tenantId,
      customerId,
      orderId: order.id,
      targetType: 'item',
      productId: dto.productId,
      locationId: order.locationId,
      rating: dto.rating,
      // Avaliação de item é SEMPRE só estrela — nunca grava texto aqui,
      // mesmo que o cliente tenha mandado algo no campo comment (o
      // frontend nem mostra esse campo nesse fluxo, mas a garantia real
      // é aqui no backend).
      comment: null,
      isAnonymous: false,
    });
    return this.saveOrTranslateConflict(review);
  }

  private async saveOrTranslateConflict(review: Review): Promise<Review> {
    try {
      return await this.reviewRepo.save(review);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          'Esse pedido já foi usado pra avaliar isso antes — mesmo apagada, uma avaliação não libera o mesmo pedido de novo. Faça outra compra pra avaliar de novo.',
        );
      }
      throw err;
    }
  }

  // Separado por categoria — pedido explícito do Felipe pra tela "Minhas
  // avaliações". Item vem com nome/foto do produto (snapshot do nome do
  // pedido, foto atual do produto).
  async findMyReviews(
    tenantId: string,
    customerId: string,
  ): Promise<{ restaurant: PublicReviewDto | null; items: MyItemReviewDto[] }> {
    const reviews = await this.reviewRepo.find({
      where: { tenantId, customerId },
      order: { createdAt: 'DESC' },
    });
    const restaurantReview = reviews.find((r) => r.targetType === 'restaurant') ?? null;
    const itemReviews = reviews.filter((r) => r.targetType === 'item');

    let restaurant: PublicReviewDto | null = null;
    if (restaurantReview) {
      const response = await this.responseRepo.findOne({ where: { reviewId: restaurantReview.id } });
      restaurant = this.toPublicDto(restaurantReview, response);
    }

    const items: MyItemReviewDto[] = [];
    if (itemReviews.length > 0) {
      const orderItems = await this.orderItemRepo.find({
        where: itemReviews.map((r) => ({ orderId: r.orderId, productId: r.productId as string })),
        relations: { product: true },
      });
      const byOrderProduct = new Map(orderItems.map((oi) => [`${oi.orderId}:${oi.productId}`, oi]));
      for (const r of itemReviews) {
        const oi = byOrderProduct.get(`${r.orderId}:${r.productId}`);
        items.push({
          id: r.id,
          rating: r.rating,
          productId: r.productId as string,
          productName: oi?.productName ?? 'Item',
          productImageUrl: oi?.product?.imageUrl ?? null,
          orderId: r.orderId,
          createdAt: r.createdAt,
        });
      }
    }

    return { restaurant, items };
  }

  // Igual usado no cupom: mapa orderId -> nota, pra pintar "★ 4" ao
  // lado de cada pedido já avaliado no histórico. Só considera a
  // avaliação de RESTAURANTE de cada pedido (é a única com sentido de
  // "nota geral desse pedido" pro histórico).
  async findMyReviewsByOrderIds(
    tenantId: string,
    customerId: string,
    orderIds: string[],
  ): Promise<Map<string, Review>> {
    if (orderIds.length === 0) return new Map();
    const reviews = await this.reviewRepo.find({
      where: { tenantId, customerId, orderId: In(orderIds), targetType: 'restaurant' },
    });
    return new Map(reviews.map((r) => [r.orderId, r]));
  }

  // Único jeito do cliente "desfazer" uma review — soft delete, nunca
  // some do banco, e o `orderId` continua ocupado pra aquele alvo pra
  // sempre (ver entity Review). Não existe updateReview nessa classe de
  // propósito: depois de publicada, é apagar ou nada.
  async deleteReview(tenantId: string, customerId: string, reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId, tenantId } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');
    if (review.customerId !== customerId) {
      throw new ForbiddenException('Essa avaliação não é sua.');
    }
    await this.reviewRepo.softRemove(review);
  }

  // ---------- Visão pública (cardápio, sem login) ----------
  //
  // `productId` presente = avaliações daquele ITEM (targetType='item');
  // ausente = avaliações do RESTAURANTE (targetType='restaurant', o
  // comportamento original). Os dois nunca se misturam numa mesma
  // consulta — item nunca deveria aparecer numa lista de "o que
  // acharam do restaurante" e vice-versa.

  async findPublicReviews(
    tenantId: string,
    locationId: string | null,
    page: number,
    pageSize: number,
    productId?: string | null,
  ): Promise<{ items: PublicReviewDto[]; total: number }> {
    const where: Record<string, unknown> = productId
      ? { tenantId, targetType: 'item', productId }
      : { tenantId, targetType: 'restaurant' };
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
  // review NÃO é anônima (avaliação de item nunca é anônima, por
  // enquanto essa opção só existe pra restaurante).
  private toPublicDto(review: Review, response: ReviewResponse | null): PublicReviewDto {
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      customerDisplayName: review.isAnonymous
        ? 'Anônimo'
        : formatPublicDisplayName(review.customer?.name ?? 'Cliente'),
      customerAvatarUrl: review.isAnonymous ? null : (review.customer?.avatarUrl ?? null),
      customerIsVerified: review.isAnonymous
        ? false
        : review.customer
          ? this.verificationService.verifyIntegritySync(review.customer)
          : false,
      isAnonymous: review.isAnonymous,
      createdAt: review.createdAt,
      response: response
        ? { responseText: response.responseText, createdAt: response.createdAt }
        : null,
    };
  }

  async getSummary(
    tenantId: string,
    locationId: string | null,
    productId?: string | null,
  ): Promise<ReviewSummary> {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('r.tenantId = :tenantId', { tenantId });
    if (productId) {
      qb.andWhere('r.targetType = :targetType', { targetType: 'item' }).andWhere(
        'r.productId = :productId',
        { productId },
      );
    } else {
      qb.andWhere('r.targetType = :targetType', { targetType: 'restaurant' });
    }
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
  // a loja") — uma query só, agrupando por location_id. Sempre de
  // RESTAURANTE (a tela de escolher loja nunca fala de item específico).
  async getSummaryByLocation(tenantId: string): Promise<Map<string, ReviewSummary>> {
    const rows = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.locationId', 'locationId')
      .addSelect('r.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('r.tenantId = :tenantId', { tenantId })
      .andWhere('r.targetType = :targetType', { targetType: 'restaurant' })
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
  // apagada aparece aqui, sempre, nota baixa inclusa. Inclui os dois
  // tipos juntos (restaurante + item) — o frontend distingue pelo
  // campo `targetType`/`productName`.
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

    const itemReviews = reviews.filter((r) => r.targetType === 'item');
    const orderItems =
      itemReviews.length > 0
        ? await this.orderItemRepo.find({
            where: itemReviews.map((r) => ({ orderId: r.orderId, productId: r.productId as string })),
          })
        : [];
    const productNameByOrderProduct = new Map(
      orderItems.map((oi) => [`${oi.orderId}:${oi.productId}`, oi.productName]),
    );

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
        customerIsVerified: review.customer
          ? this.verificationService.verifyIntegritySync(review.customer)
          : false,
        isAnonymous: review.isAnonymous,
        targetType: review.targetType,
        productName:
          review.targetType === 'item'
            ? (productNameByOrderProduct.get(`${review.orderId}:${review.productId}`) ?? 'Item')
            : null,
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
  // existia (1 resposta por review). Só faz sentido responder review de
  // RESTAURANTE na prática (tem texto pra reagir), mas tecnicamente
  // nada impede responder uma de item também — não bloqueado de
  // propósito, pra não adicionar uma regra sem necessidade real.
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
