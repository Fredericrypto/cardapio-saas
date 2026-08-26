import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import { Promotion } from './promotion.entity';
import { PromotionCustomerReset } from './promotion-customer-reset.entity';
import { OrderPromotionDiscount } from './order-promotion-discount.entity';
import { Category } from '../categories/category.entity';
import { Product } from '../products/product.entity';
import { Location } from '../locations/location.entity';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { Order } from '../orders/order.entity';
import { Tenant } from '../tenants/tenant.entity';
import { PushService } from '../push/push.service';
import { toCents } from '../../common/utils/money';

export interface CartLine {
  productId: string;
  categoryId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

// Cópia de trabalho de CartLine usada durante a validação de VÁRIOS
// cupons em sequência (validateSelectedPromotions) — `remainingQty`
// começa igual a `quantity` e vai sendo reduzido conforme cada promoção
// reivindica unidades, pra próxima promoção da lista só ver o que sobrou.
interface WorkingCartLine {
  productId: string;
  categoryId: string;
  unitPriceCents: number;
  remainingQty: number;
}

export interface AppliedDiscount {
  promotionId: string;
  title: string;
  discountCents: number;
}

export interface PublicPromotion {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderValue: number;
  scope: 'all' | 'category' | 'product';
  categoryIds: string[];
  productIds: string[];
  usageLimitPerCustomer: number | null;
  maxEligibleQuantity: number | null;
  endsAt: string | null;
  alreadyUsedUp: boolean;
}

export interface AdminPromotion extends Promotion {
  totalDiscountGiven: number;
}

// Qual dos dois resets (individual do cliente, ou global "pra todos")
// vale — sempre o mais RECENTE dos dois, já que um reset mais novo
// sempre substitui a intenção de um mais antigo. Qualquer um dos dois
// pode ser null (nunca resetado).
function latestDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() > b.getTime() ? a : b;
}

export interface PromotionRedemption {
  orderId: string;
  customerId: string | null;
  customerName: string | null;
  createdAt: Date;
  discountAmount: number;
  orderTotal: number;
  locationName: string | null;
}

export interface PromotionCustomerUsage {
  customerId: string;
  customerName: string;
  usedCount: number;
  lastUsedAt: Date;
  usageLimitPerCustomer: number | null;
  // Loja do uso mais RECENTE (se o cliente usou em lojas diferentes,
  // mostra a última — cobre o caso comum de uma rede com "Loja
  // Principal" e "Loja Shopping", pra saber onde exatamente o cupom foi
  // usado). Null = pedido sem loja definida (tenant sem multi-loja).
  lastUsedLocationName: string | null;
}

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepo: Repository<Promotion>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(PromotionCustomerReset)
    private readonly resetRepo: Repository<PromotionCustomerReset>,
    @InjectRepository(OrderPromotionDiscount)
    private readonly orderPromotionDiscountRepo: Repository<OrderPromotionDiscount>,
    private readonly pushService: PushService,
  ) {}

  // Painel admin: todas as promoções do tenant, ativas ou não, com as
  // categorias/produtos vinculados (pra edição) e o total já economizado
  // pelos clientes com cada uma — soma vindo de order_promotion_discounts
  // (não de order.discountAmount, que agora é a soma de TODOS os cupons
  // de um pedido quando mais de um é usado ao mesmo tempo; somar direto
  // dali contaria o desconto de outro cupom como se fosse dessa
  // promoção). Exclui pedidos cancelados. Calculado aqui, não confiado
  // de nenhum lugar do frontend.
  async findAllForAdmin(tenantId: string): Promise<AdminPromotion[]> {
    const promotions = await this.promotionRepo.find({
      where: { tenantId },
      relations: { categories: true, products: true, locations: true },
      order: { createdAt: 'DESC' },
    });
    if (promotions.length === 0) return [];

    const totals = await this.orderPromotionDiscountRepo
      .createQueryBuilder('opd')
      .select('opd.promotionId', 'promotionId')
      .addSelect('SUM(opd.discountAmount)', 'total')
      .innerJoin('opd.order', 'order')
      .where('opd.tenantId = :tenantId', { tenantId })
      .andWhere('order.status != :cancelled', { cancelled: 'cancelado' })
      .groupBy('opd.promotionId')
      .getRawMany<{ promotionId: string; total: string }>();

    const totalsMap = new Map(totals.map((t) => [t.promotionId, Number(t.total) || 0]));

    return promotions.map((p) => ({ ...p, totalDiscountGiven: totalsMap.get(p.id) ?? 0 }));
  }

  async findOne(tenantId: string, id: string): Promise<Promotion> {
    const promotion = await this.promotionRepo.findOne({
      where: { id, tenantId },
      relations: { categories: true, products: true, locations: true },
    });
    if (!promotion) {
      throw new NotFoundException('Promoção não encontrada.');
    }
    return promotion;
  }

  // Drill-down do admin: quais pedidos (e clientes) usaram essa
  // promoção especificamente — pra saber não só quanto foi descontado
  // no total, mas quem usou. `discountAmount` vem da tabela de
  // detalhamento (order_promotion_discounts), não de order.discountAmount
  // direto — um pedido pode ter usado OUTRO cupom junto, e o total do
  // pedido incluiria o desconto daquele outro cupom também.
  async getRedemptions(tenantId: string, id: string): Promise<PromotionRedemption[]> {
    await this.findOne(tenantId, id); // garante que a promoção é desse tenant

    const rows = await this.orderPromotionDiscountRepo
      .createQueryBuilder('opd')
      .innerJoinAndSelect('opd.order', 'order')
      .leftJoinAndSelect('order.location', 'location')
      .where('opd.tenantId = :tenantId', { tenantId })
      .andWhere('opd.promotionId = :id', { id })
      .andWhere('order.status != :cancelled', { cancelled: 'cancelado' })
      .orderBy('opd.createdAt', 'DESC')
      .getMany();

    return rows.map((r) => ({
      orderId: r.orderId,
      customerId: r.order.customerId,
      customerName: r.order.customerName,
      createdAt: r.createdAt,
      discountAmount: r.discountAmount,
      orderTotal: r.order.total,
      locationName: r.order.location?.name ?? null,
    }));
  }

  // Cardápio público — só promoções que o cliente pode REALMENTE usar
  // agora: ativas, dentro da janela de validade, e que ainda não
  // bateram o teto global de usos. Não filtra por valor mínimo (o
  // carrinho ainda não existe nesse momento; isso vira só um aviso no
  // card, calculado no frontend). Quando `customerId` é passado (cliente
  // logado), cada promoção com limite por cliente vem marcada com
  // `alreadyUsedUp` pro cardápio mostrar "você já usou essa promoção".
  async findActiveForPublic(
    tenantId: string,
    customerId?: string | null,
    locationId?: string | null,
  ): Promise<PublicPromotion[]> {
    const now = new Date();
    const all = await this.promotionRepo.find({
      where: { tenantId, isActive: true },
      relations: { categories: true, products: true, locations: true },
      order: { discountValue: 'DESC' },
    });

    const eligible = all.filter(
      (p) =>
        this.isWithinWindow(p, now) &&
        !this.hasReachedGlobalCap(p) &&
        this.isValidAtLocation(p, locationId),
    );

    return Promise.all(
      eligible.map(async (promo) => {
        const withImage = this.attachDisplayImage(promo);
        const alreadyUsedUp = customerId
          ? await this.customerHasReachedLimit(promo, customerId, locationId)
          : false;
        return {
          id: promo.id,
          title: promo.title,
          description: promo.description,
          imageUrl: withImage.imageUrl,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          maxDiscountAmount: promo.maxDiscountAmount,
          minOrderValue: promo.minOrderValue,
          scope: promo.scope,
          categoryIds: (promo.categories ?? []).map((c) => c.id),
          productIds: (promo.products ?? []).map((p) => p.id),
          usageLimitPerCustomer: promo.usageLimitPerCustomer,
          maxEligibleQuantity: promo.maxEligibleQuantity,
          endsAt: promo.endsAt ? promo.endsAt.toISOString() : null,
          alreadyUsedUp,
        };
      }),
    );
  }

  // Se a promoção não tem foto própria e é restrita a um ÚNICO produto,
  // usa a foto desse produto — assim o card sempre mostra algo visual
  // de verdade (o item da promoção), igual McDonald's/iFood, sem
  // depender do admin lembrar de subir um banner à parte.
  private attachDisplayImage(promotion: Promotion): Promotion {
    if (promotion.imageUrl) return promotion;
    if (promotion.scope === 'product' && promotion.products?.length === 1) {
      return { ...promotion, imageUrl: promotion.products[0].imageUrl };
    }
    return promotion;
  }

  private isWithinWindow(promotion: Promotion, now: Date): boolean {
    if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) return false;
    if (promotion.endsAt && promotion.endsAt.getTime() < now.getTime()) return false;
    return true;
  }

  private hasReachedGlobalCap(promotion: Promotion): boolean {
    return promotion.maxRedemptions != null && promotion.redemptionCount >= promotion.maxRedemptions;
  }

  // Conta pedidos NÃO cancelados desse cliente que já usaram essa
  // promoção — é a mesma regra do cupom iFood ("o mesmo cliente não
  // pode usar o mesmo cupom duas vezes"), só que generalizada pra
  // aceitar um limite configurável (1 = uso único, ou mais). Quando
  // `allowReuseAcrossLocations` é false (padrão), conta o uso em
  // QUALQUER loja do tenant; quando true, só conta na MESMA loja.
  private async customerHasReachedLimit(
    promotion: Promotion,
    customerId: string,
    locationId?: string | null,
  ): Promise<boolean> {
    if (promotion.usageLimitPerCustomer == null) return false;
    const usedCount = await this.getCustomerUsedCount(promotion, customerId, locationId);
    return usedCount >= promotion.usageLimitPerCustomer;
  }

  // Conta quantos pedidos ATIVOS (não cancelados) esse cliente já fez
  // usando essa promoção — usado tanto pra bloquear no checkout quanto
  // pra marcar `alreadyUsedUp` no cardápio público. Se o admin resetou o
  // uso desse cliente pra essa promoção (ver resetCustomerUsage), só
  // conta pedidos feitos DEPOIS do reset — é assim que o "reiniciar
  // promoção pro cliente" funciona sem apagar nem alterar nenhum pedido
  // antigo.
  private async getCustomerUsedCount(
    promotion: Promotion,
    customerId: string,
    locationId?: string | null,
    manager?: EntityManager,
  ): Promise<number> {
    const resetRepo = manager ? manager.getRepository(PromotionCustomerReset) : this.resetRepo;
    const orderRepo = manager ? manager.getRepository(Order) : this.orderRepo;

    const reset = await resetRepo.findOne({
      where: { promotionId: promotion.id, customerId },
    });
    // O ponto de corte é o MAIS RECENTE entre o reset individual desse
    // cliente e o reset global da promoção ("resetar pra todos") — o
    // que valer por último é o que conta.
    const effectiveResetAt = latestDate(reset?.resetAt, promotion.usageResetAt);

    const qb = orderRepo
      .createQueryBuilder('order')
      // Array containment — um pedido pode ter usado essa promoção
      // JUNTO com outra (ver AddMultiplePromotionsToOrders), então não
      // dá mais pra checar igualdade simples de promotionId.
      .where(':promotionId = ANY(order.promotionIds)', { promotionId: promotion.id })
      .andWhere('order.customerId = :customerId', { customerId })
      .andWhere('order.status IN (:...statuses)', {
        statuses: ['pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'aguardando_pagamento'],
      });
    if (promotion.allowReuseAcrossLocations && locationId) {
      qb.andWhere('order.locationId = :locationId', { locationId });
    }
    if (effectiveResetAt) {
      qb.andWhere('order.createdAt > :resetAt', { resetAt: effectiveResetAt });
    }
    return qb.getCount();
  }

  // Painel admin: "devolve" o uso da promoção pra esse cliente — a
  // próxima checagem de limite (validateSelectedPromotion,
  // customerHasReachedLimit) só vai contar pedidos feitos a partir de
  // agora, ignorando qualquer pedido anterior. Idempotente: resetar de
  // novo só atualiza `resetAt`, nunca acumula linhas.
  async resetCustomerUsage(tenantId: string, promotionId: string, customerId: string): Promise<void> {
    const promotion = await this.promotionRepo.findOne({ where: { id: promotionId, tenantId } });
    if (!promotion) {
      throw new NotFoundException('Promoção não encontrada.');
    }
    const existing = await this.resetRepo.findOne({ where: { promotionId, customerId } });
    if (existing) {
      existing.resetAt = new Date();
      await this.resetRepo.save(existing);
    } else {
      await this.resetRepo.save(
        this.resetRepo.create({ tenantId, promotionId, customerId, resetAt: new Date() }),
      );
    }
    // O contador "N usados" do card também precisa refletir o reset —
    // senão o admin reseta o cliente, o cliente consegue usar de novo,
    // mas o número mostrado continua o de antes (foi exatamente essa a
    // reclamação: "mesmo resetando... a contagem não é resetada junto").
    await this.recomputeRedemptionCount(promotion);
  }

  // "Resetar pra TODOS" — devolve o uso pra QUALQUER cliente de uma vez,
  // sem precisar resetar um por um. Antes de resetar, guarda quantos
  // clientes diferentes tinham usado até agora (usageCountBeforeReset)
  // só como referência histórica do admin — o requisito explícito foi
  // "salvando apenas quantas pessoas usaram da última vez".
  async resetAllCustomersUsage(tenantId: string, promotionId: string): Promise<void> {
    const promotion = await this.findOne(tenantId, promotionId);
    const usageBeforeReset = await this.getCustomerUsage(tenantId, promotionId);

    promotion.usageCountBeforeReset = usageBeforeReset.length;
    promotion.usageResetAt = new Date();
    // Depois de resetar pra todos, NINGUÉM tem uso "ativo" contando —
    // recomputa do zero em vez de assumir 0 direto, já que pode ter
    // pedido feito por convidado (sem customerId, não afetado por
    // reset nenhum) que ainda deve continuar contando.
    await this.promotionRepo.save(promotion);
    await this.recomputeRedemptionCount(promotion);
  }

  // Fonte única de verdade do "N usados" mostrado no card: conta pedidos
  // não cancelados que ainda "contam" pra essa promoção, respeitando
  // qualquer reset (individual OU global) — em vez de confiar num
  // contador incremental que pode ficar dessincronizado (foi exatamente
  // esse o problema com o `redemption_count` antigo, corrigido na
  // migration RecomputeRedemptionCountAndDropMaxRedemptions). Chamado
  // sempre que um reset acontece, pra manter os dois em sincronia.
  private async recomputeRedemptionCount(promotion: Promotion): Promise<void> {
    const resets = await this.resetRepo.find({ where: { promotionId: promotion.id } });
    const resetMap = new Map(resets.map((r) => [r.customerId, r.resetAt]));

    const orders = await this.orderRepo
      .createQueryBuilder('order')
      .where('order.tenantId = :tenantId', { tenantId: promotion.tenantId })
      .andWhere(':promotionId = ANY(order.promotionIds)', { promotionId: promotion.id })
      .getMany();

    let count = 0;
    for (const order of orders) {
      if (order.status === 'cancelado') continue;
      // Convidado (sem customerId) nunca tem reset — só clientes
      // logados usam promoção com limite por cliente, mas o reset
      // global ("pra todos") vale pra qualquer pedido, com ou sem login.
      const individualReset = order.customerId ? resetMap.get(order.customerId) : undefined;
      const effectiveResetAt = latestDate(individualReset, promotion.usageResetAt);
      if (effectiveResetAt && order.createdAt <= effectiveResetAt) continue;
      count++;
    }

    await this.promotionRepo.update(promotion.id, { redemptionCount: count });
  }

  // Painel admin: agrupa os pedidos (não cancelados) que usaram essa
  // promoção POR CLIENTE, já considerando reset (individual OU global —
  // vale o mais recente dos dois) — mostra quanto cada cliente já usou
  // frente ao limite, e permite o admin resetar cliente a cliente.
  // Convidados (sem customerId) ficam de fora — a promoção com limite
  // por cliente já exige login (ver validateSelectedPromotion), então
  // não existe "uso" de convidado pra resetar.
  async getCustomerUsage(tenantId: string, promotionId: string): Promise<PromotionCustomerUsage[]> {
    const promotion = await this.findOne(tenantId, promotionId);
    const resets = await this.resetRepo.find({ where: { promotionId } });
    const resetMap = new Map(resets.map((r) => [r.customerId, r.resetAt]));

    const orders = await this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.location', 'location')
      .where('order.tenantId = :tenantId', { tenantId })
      .andWhere(':promotionId = ANY(order.promotionIds)', { promotionId })
      .orderBy('order.createdAt', 'DESC')
      .getMany();

    const usageByCustomer = new Map<string, PromotionCustomerUsage>();
    for (const order of orders) {
      if (!order.customerId || order.status === 'cancelado') continue;
      const effectiveResetAt = latestDate(resetMap.get(order.customerId), promotion.usageResetAt);
      if (effectiveResetAt && order.createdAt <= effectiveResetAt) continue; // uso "apagado" pelo reset

      const existing = usageByCustomer.get(order.customerId);
      if (existing) {
        existing.usedCount += 1;
        // Pedidos vêm ordenados DESC por createdAt — o primeiro que
        // encontramos pra esse cliente já é o mais recente, então não
        // precisa atualizar lastUsedLocationName nas repetições.
      } else {
        usageByCustomer.set(order.customerId, {
          customerId: order.customerId,
          customerName: order.customer?.name ?? order.customerName ?? 'Cliente sem nome',
          usedCount: 1,
          lastUsedAt: order.createdAt,
          usageLimitPerCustomer: promotion.usageLimitPerCustomer,
          lastUsedLocationName: order.location?.name ?? null,
        });
      }
    }
    return Array.from(usageByCustomer.values()).sort(
      (a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime(),
    );
  }

  // Confere se a promoção vale na loja do pedido — lista vazia de
  // lojas vinculadas = vale em todas as lojas do tenant.
  private isValidAtLocation(promotion: Promotion, locationId: string | null | undefined): boolean {
    if (!promotion.locations || promotion.locations.length === 0) return true;
    if (!locationId) return false;
    return promotion.locations.some((l) => l.id === locationId);
  }

  private validateDiscountValue(dto: {
    discountType?: string;
    discountValue?: number;
    maxDiscountAmount?: number | null;
  }): void {
    if (dto.discountType === 'percentage' && dto.discountValue != null && dto.discountValue > 100) {
      throw new BadRequestException('Desconto percentual não pode passar de 100%.');
    }
    // Regra rígida (igual iFood: todo cupom percentual tem um teto em
    // R$) — sem isso, pedidos com quantidade grande do mesmo item geram
    // desconto sem limite nenhum. Já causou um bug real em produção.
    if (dto.discountType === 'percentage' && !dto.maxDiscountAmount) {
      throw new BadRequestException(
        'Promoção percentual precisa de um teto de desconto em R$ (ex: "50% off, até R$15").',
      );
    }
  }

  private async resolveCategories(tenantId: string, categoryIds?: string[]): Promise<Category[]> {
    if (!categoryIds || categoryIds.length === 0) return [];
    const categories = await this.categoryRepo.find({ where: { id: In(categoryIds), tenantId } });
    if (categories.length !== categoryIds.length) {
      throw new BadRequestException('Uma das categorias escolhidas não pertence a esse estabelecimento.');
    }
    return categories;
  }

  private async resolveProducts(tenantId: string, productIds?: string[]): Promise<Product[]> {
    if (!productIds || productIds.length === 0) return [];
    const products = await this.productRepo.find({ where: { id: In(productIds), tenantId } });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Um dos produtos escolhidos não pertence a esse estabelecimento.');
    }
    return products;
  }

  private async resolveLocations(tenantId: string, locationIds?: string[]): Promise<Location[]> {
    if (!locationIds || locationIds.length === 0) return [];
    const locations = await this.locationRepo.find({ where: { id: In(locationIds), tenantId } });
    if (locations.length !== locationIds.length) {
      throw new BadRequestException('Uma das lojas escolhidas não pertence a esse estabelecimento.');
    }
    return locations;
  }

  private assertScopeHasTargets(
    scope: 'all' | 'category' | 'product',
    categories: Category[],
    products: Product[],
  ): void {
    if (scope === 'category' && categories.length === 0) {
      throw new BadRequestException('Escolha ao menos uma categoria pra essa promoção.');
    }
    if (scope === 'product' && products.length === 0) {
      throw new BadRequestException('Escolha ao menos um produto pra essa promoção.');
    }
  }

  async create(tenantId: string, dto: CreatePromotionDto): Promise<Promotion> {
    this.validateDiscountValue(dto);
    const scope = dto.scope ?? 'all';
    const categories = await this.resolveCategories(tenantId, dto.categoryIds);
    const products = await this.resolveProducts(tenantId, dto.productIds);
    const locations = await this.resolveLocations(tenantId, dto.locationIds);
    this.assertScopeHasTargets(scope, categories, products);

    const promotion = this.promotionRepo.create({
      tenantId,
      title: dto.title,
      description: dto.description ?? null,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      maxDiscountAmount: dto.discountType === 'percentage' ? (dto.maxDiscountAmount ?? null) : null,
      minOrderValue: dto.minOrderValue ?? 0,
      scope,
      categories,
      products,
      locations,
      allowReuseAcrossLocations: dto.allowReuseAcrossLocations ?? false,
      // `|| null` (não `?? null`): o form do admin manda 0 quando a
      // caixinha de limite está desmarcada — 0 tem que virar "sem
      // limite" (null), nunca ser gravado como um limite de zero.
      usageLimitPerCustomer: dto.usageLimitPerCustomer || null,
      maxRedemptions: dto.maxRedemptions || null,
      // Trava de quantidade só faz sentido pra 'category'/'product' — em
      // 'all' o desconto é sobre o carrinho INTEIRO, não faz sentido
      // isolar "N unidades" de coisa nenhuma específica. Ignora
      // silenciosamente qualquer valor mandado com scope='all' (defesa
      // em profundidade — a UI do admin já esconde esse campo nesse
      // caso, mas a regra de negócio não pode depender só disso).
      maxEligibleQuantity: scope === 'all' ? null : dto.maxEligibleQuantity || null,
      isActive: dto.isActive ?? true,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    });
    const saved = await this.promotionRepo.save(promotion);
    // Broadcast pra TODOS os clientes já inscritos desse restaurante —
    // "melhor esforço", nunca lança erro (PushService já engole falhas
    // de envio internamente), então nunca atrapalha a criação da
    // promoção em si.
    //
    // Só notifica se `isActive` e sem `startsAt` futuro — uma promoção
    // agendada pra começar depois, ou criada já inativa (rascunho),
    // não deveria empurrar notificação agora; é o admin quem decide
    // quando ela liga, e o cliente só devia saber quando ela realmente
    // valer.
    const startsInFuture = saved.startsAt ? saved.startsAt.getTime() > Date.now() : false;
    if (saved.isActive && !startsInFuture) {
      await this.notifyNewPromotion(saved);
    }
    return saved;
  }

  private async notifyNewPromotion(promotion: Promotion): Promise<void> {
    const tenant = await this.locationRepo.manager
      .getRepository(Tenant)
      .findOne({ where: { id: promotion.tenantId }, select: { slug: true, logoUrl: true } });
    if (!tenant) return;
    await this.pushService.broadcastToTenant(promotion.tenantId, {
      title: 'Nova promoção!',
      body: promotion.description?.trim() || promotion.title,
      url: `/${tenant.slug}/promocao/${promotion.id}`,
      tag: 'promotion',
      icon: tenant.logoUrl ?? undefined,
    });
  }

  async update(tenantId: string, id: string, dto: UpdatePromotionDto): Promise<Promotion> {
    const promotion = await this.findOne(tenantId, id);
    this.validateDiscountValue({
      discountType: dto.discountType ?? promotion.discountType,
      discountValue: dto.discountValue ?? promotion.discountValue,
      maxDiscountAmount: dto.maxDiscountAmount ?? promotion.maxDiscountAmount,
    });

    if (dto.title !== undefined) promotion.title = dto.title;
    if (dto.description !== undefined) promotion.description = dto.description || null;
    if (dto.imageUrl !== undefined) promotion.imageUrl = dto.imageUrl || null;
    if (dto.discountType !== undefined) promotion.discountType = dto.discountType;
    if (dto.discountValue !== undefined) promotion.discountValue = dto.discountValue;
    if (dto.maxDiscountAmount !== undefined) promotion.maxDiscountAmount = dto.maxDiscountAmount;
    if (promotion.discountType === 'fixed') promotion.maxDiscountAmount = null;
    if (dto.minOrderValue !== undefined) promotion.minOrderValue = dto.minOrderValue;
    if (dto.usageLimitPerCustomer !== undefined) {
      promotion.usageLimitPerCustomer = dto.usageLimitPerCustomer || null;
    }
    if (dto.maxRedemptions !== undefined) {
      promotion.maxRedemptions = dto.maxRedemptions || null;
    }
    // Precisa saber o escopo FINAL (considerando se essa mesma chamada
    // também está mudando o scope) antes de decidir se aceita a trava de
    // quantidade — mesma regra do create(), ver comentário lá.
    const nextScope = dto.scope ?? promotion.scope;
    if (dto.maxEligibleQuantity !== undefined) {
      promotion.maxEligibleQuantity = nextScope === 'all' ? null : dto.maxEligibleQuantity || null;
    } else if (nextScope === 'all' && promotion.maxEligibleQuantity != null) {
      // Escopo virou 'all' nessa mesma edição e a trava antiga ficou
      // órfã (o admin nem tinha como mandar maxEligibleQuantity=null
      // explícito, já que o campo nem aparece mais na tela) — limpa.
      promotion.maxEligibleQuantity = null;
    }
    if (dto.allowReuseAcrossLocations !== undefined) {
      promotion.allowReuseAcrossLocations = dto.allowReuseAcrossLocations;
    }
    if (dto.isActive !== undefined) promotion.isActive = dto.isActive;
    if (dto.startsAt !== undefined) promotion.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) promotion.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    if (dto.scope !== undefined) promotion.scope = dto.scope;
    if (dto.categoryIds !== undefined) {
      promotion.categories = await this.resolveCategories(tenantId, dto.categoryIds);
    }
    if (dto.productIds !== undefined) {
      promotion.products = await this.resolveProducts(tenantId, dto.productIds);
    }
    if (dto.locationIds !== undefined) {
      promotion.locations = await this.resolveLocations(tenantId, dto.locationIds);
    }
    this.assertScopeHasTargets(nextScope, promotion.categories ?? [], promotion.products ?? []);

    return this.promotionRepo.save(promotion);
  }

  // Upload de imagem é separado (mesmo padrão de ProductsController) —
  // o admin escolhe a foto depois de já ter criado a promoção.
  async setImage(tenantId: string, id: string, imageUrl: string): Promise<Promotion> {
    const promotion = await this.findOne(tenantId, id);
    promotion.imageUrl = imageUrl;
    return this.promotionRepo.save(promotion);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.promotionRepo.softDelete(id);
  }

  // Chamado pelo OrdersService DENTRO da transação de criação do
  // pedido — o CLIENTE escolhe as promoções (igual iFood: cupom é
  // aplicado por escolha, nunca forçado; e pode escolher MAIS DE UMA,
  // ex: um cupom pro burger + outro pra coca-cola), mas o desconto em
  // si é sempre recalculado aqui do zero a partir do carrinho real
  // (produto + categoria + valor de cada linha, tudo vindo do banco).
  //
  // Cada promoção "reivindica" as unidades do carrinho que usa — a
  // PRÓXIMA promoção da lista só pode descontar o que sobrou, nunca a
  // MESMA unidade duas vezes (senão dois cupons de 50% no mesmo item
  // dariam 100% off, ou pior). A ordem em que o cliente selecionou os
  // cupons decide a prioridade quando dois cupons SERIAM elegíveis pro
  // mesmo item — normalmente isso nem acontece, já que cada cupom tende
  // a mirar um produto/categoria diferente, mas o sistema fica seguro
  // mesmo se os escopos se sobrepuserem.
  //
  // Se a lista vier vazia/undefined, não tem promoção nenhuma — desconto
  // fica zerado, sem erro. Se QUALQUER uma das promoções não for mais
  // válida (expirou, bateu teto, não atinge o mínimo, cliente já usou,
  // não sobrou nada elegível pra ela depois dos cupons anteriores),
  // joga um erro claro e a transação inteira é desfeita — nunca cria o
  // pedido com menos desconto do que o cliente esperava.
  async validateSelectedPromotions(
    manager: EntityManager,
    tenantId: string,
    customerId: string | null,
    promotionIds: string[] | null | undefined,
    cartTotalCents: number,
    cartLines: CartLine[],
    locationId?: string | null,
  ): Promise<AppliedDiscount[]> {
    const ids = [...new Set(promotionIds ?? [])]; // dedupe — clicar 2x no mesmo cupom não conta 2x
    if (ids.length === 0) return [];

    // Cópia de trabalho — cada promoção reduz `remainingQty` das linhas
    // que reivindica, então a próxima só vê o que sobrou. `cartLines`
    // original (do chamador) nunca é mutado.
    const workingLines: WorkingCartLine[] = cartLines.map((l) => ({
      productId: l.productId,
      categoryId: l.categoryId,
      unitPriceCents: l.unitPriceCents,
      remainingQty: l.quantity,
    }));

    const applied: AppliedDiscount[] = [];
    for (const promotionId of ids) {
      const promo = await manager.findOne(Promotion, {
        where: { id: promotionId, tenantId, isActive: true },
        relations: { categories: true, products: true, locations: true },
      });
      if (!promo) {
        throw new BadRequestException('Essa promoção não existe mais ou foi desativada.');
      }

      const now = new Date();
      if (!this.isWithinWindow(promo, now)) {
        throw new BadRequestException(`"${promo.title}" não está mais válida.`);
      }
      if (this.hasReachedGlobalCap(promo)) {
        throw new BadRequestException(
          `"${promo.title}" atingiu o limite de usos e não está mais disponível.`,
        );
      }
      if (!this.isValidAtLocation(promo, locationId)) {
        throw new BadRequestException(`"${promo.title}" não está disponível nessa loja.`);
      }
      // Pedido mínimo sempre contra o carrinho INTEIRO, não contra o que
      // sobrou depois de outros cupons — "pedido mínimo R$50" quer dizer
      // "seu pedido todo", não "o que esse cupom especificamente cobre".
      if (cartTotalCents < toCents(promo.minOrderValue)) {
        throw new BadRequestException(
          `"${promo.title}" exige pedido mínimo de R$ ${Number(promo.minOrderValue).toFixed(2).replace('.', ',')}.`,
        );
      }
      if (promo.usageLimitPerCustomer != null) {
        if (!customerId) {
          throw new BadRequestException(`Entre na sua conta pra usar "${promo.title}".`);
        }
        const usedCount = await this.getCustomerUsedCount(promo, customerId, locationId, manager);
        if (usedCount >= promo.usageLimitPerCustomer) {
          throw new BadRequestException(`Você já usou "${promo.title}".`);
        }
      }

      // Reivindica as unidades (reduz workingLines em lugar) — o que
      // sobrar é tudo que a PRÓXIMA promoção da lista pode enxergar.
      const eligibleCents = this.claimEligibleCents(promo, workingLines);
      if (eligibleCents <= 0) {
        throw new BadRequestException(
          ids.length > 1
            ? `Nenhum item sobrou no carrinho pra "${promo.title}" depois dos outros cupons aplicados.`
            : `Nenhum item do seu carrinho é elegível pra "${promo.title}".`,
        );
      }

      // TETO RÍGIDO: desconto percentual nunca passa de maxDiscountAmount
      // (obrigatório pra esse tipo — ver validateDiscountValue). É o que
      // impede um pedido com quantidade grande do mesmo item de gerar um
      // desconto sem limite — bug real já visto em produção.
      const discountCents =
        promo.discountType === 'percentage'
          ? Math.min(
              Math.round((eligibleCents * promo.discountValue) / 100),
              toCents(promo.maxDiscountAmount ?? 0),
            )
          : Math.min(toCents(promo.discountValue), eligibleCents);

      if (discountCents <= 0) {
        throw new BadRequestException(`"${promo.title}" não gera desconto pra esse carrinho.`);
      }

      applied.push({ promotionId: promo.id, title: promo.title, discountCents });
    }

    return applied;
  }

  // Wrapper de compatibilidade pra qualquer chamador antigo que ainda
  // pense em termos de "uma promoção só".
  async validateSelectedPromotion(
    manager: EntityManager,
    tenantId: string,
    customerId: string | null,
    promotionId: string | null | undefined,
    cartTotalCents: number,
    cartLines: CartLine[],
    locationId?: string | null,
  ): Promise<AppliedDiscount | null> {
    const [first] = await this.validateSelectedPromotions(
      manager,
      tenantId,
      customerId,
      promotionId ? [promotionId] : [],
      cartTotalCents,
      cartLines,
      locationId,
    );
    return first ?? null;
  }

  private matchingWorkingLines(promotion: Promotion, lines: WorkingCartLine[]): WorkingCartLine[] {
    const candidates = lines.filter((l) => l.remainingQty > 0);
    if (promotion.scope === 'all') return candidates;
    if (promotion.scope === 'category') {
      const categoryIds = new Set((promotion.categories ?? []).map((c) => c.id));
      return candidates.filter((line) => categoryIds.has(line.categoryId));
    }
    const productIds = new Set((promotion.products ?? []).map((p) => p.id));
    return candidates.filter((line) => productIds.has(line.productId));
  }

  // Calcula quantos CENTAVOS do carrinho realmente entram no cálculo do
  // desconto — e MUTA `lines` (reduz `remainingQty`) pra marcar quais
  // unidades foram "consumidas" por essa promoção, pra próxima promoção
  // da lista (ver validateSelectedPromotions) nunca descontar a mesma
  // unidade duas vezes.
  //  - SEM `maxEligibleQuantity`: reivindica TUDO que sobrou elegível —
  //    certo pra promoções tipo "10% off em toda a categoria bebidas",
  //    onde faz sentido o desconto crescer junto com a quantidade.
  //  - COM `maxEligibleQuantity`: só as N UNIDADES elegíveis MAIS CARAS
  //    (dentre o que sobrou) são reivindicadas. Isso trava o desconto
  //    numa quantidade fixa (ex: "cupom vale pra até 1 unidade") mesmo
  //    que o cliente encha o carrinho do mesmo item, e ainda maximiza o
  //    benefício do cliente (prioriza a unidade mais cara, nunca uma
  //    ordem arbitrária). Sort estável (V8/ES2019+) = resultado sempre
  //    determinístico.
  // Essa é a fonte de verdade cobrada de fato. O frontend-cardapio
  // espelha o MESMO algoritmo só pra dar preview instantâneo ao cliente
  // (ver promotionEligibility.ts) e pra isolar visualmente as unidades
  // com desconto no carrinho — nunca é ele quem decide o valor cobrado.
  private claimEligibleCents(promotion: Promotion, lines: WorkingCartLine[]): number {
    const matching = this.matchingWorkingLines(promotion, lines);
    if (promotion.maxEligibleQuantity == null) {
      let eligibleCents = 0;
      for (const line of matching) {
        eligibleCents += line.remainingQty * line.unitPriceCents;
        line.remainingQty = 0;
      }
      return eligibleCents;
    }

    const sorted = [...matching].sort((a, b) => b.unitPriceCents - a.unitPriceCents);
    let remaining = promotion.maxEligibleQuantity;
    let eligibleCents = 0;
    for (const line of sorted) {
      if (remaining <= 0) break;
      const takenQty = Math.min(remaining, line.remainingQty);
      eligibleCents += takenQty * line.unitPriceCents;
      line.remainingQty -= takenQty;
      remaining -= takenQty;
    }
    return eligibleCents;
  }

  // Grava, DENTRO da mesma transação da criação do pedido, quanto CADA
  // promoção aplicada descontou nesse pedido especificamente — é a
  // fonte de verdade usada por getRedemptions/findAllForAdmin pra
  // reportar números corretos por promoção mesmo quando um pedido usou
  // mais de um cupom ao mesmo tempo.
  async recordPerPromoDiscounts(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    appliedDiscounts: AppliedDiscount[],
  ): Promise<void> {
    if (appliedDiscounts.length === 0) return;
    const repo = manager.getRepository(OrderPromotionDiscount);
    await repo.save(
      appliedDiscounts.map((d) =>
        repo.create({
          tenantId,
          orderId,
          promotionId: d.promotionId,
          discountAmount: d.discountCents / 100,
        }),
      ),
    );
  }

  // Incrementa o contador global de usos ATOMICAMENTE (UPDATE direto,
  // não um save() do objeto inteiro) — evita race condition se dois
  // pedidos usarem a mesma promoção ao mesmo tempo. Chamado dentro da
  // MESMA transação da criação do pedido.
  async recordRedemption(manager: EntityManager, promotionId: string): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Promotion)
      .set({ redemptionCount: () => '"redemption_count" + 1' })
      .where('id = :id', { id: promotionId })
      .execute();
  }

  // Contrapartida do recordRedemption: quando um pedido que usou uma
  // promoção é CANCELADO (por qualquer caminho — cliente, admin, Pix
  // expirado, Mercado Pago recusado), a vaga volta a ficar disponível
  // no teto global (maxRedemptions). Sem isso, o teto ia enchendo com
  // pedidos que nunca saíram do papel, e o painel admin mostrava
  // "1/1 usados" junto de "ainda não foi usada" (o total economizado já
  // exclui pedidos cancelados, mas o contador de usos não voltava).
  // GREATEST(...,0) é só uma proteção contra nunca ficar negativo, caso
  // esse método seja chamado mais de uma vez pro mesmo pedido por engano.
  async releaseRedemption(manager: EntityManager, promotionId: string): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Promotion)
      .set({ redemptionCount: () => 'GREATEST("redemption_count" - 1, 0)' })
      .where('id = :id', { id: promotionId })
      .execute();
  }
}
