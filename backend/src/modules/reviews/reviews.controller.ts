import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ForbiddenException, Header } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { CustomerJwtAuthGuard } from '../customers/customer-jwt-auth.guard';
import { OptionalCustomerJwtAuthGuard } from '../customers/optional-customer-jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { RequestCustomer } from '../../common/decorators/current-customer.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { RespondReviewDto } from './dto/respond-review.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

function parseRating(value?: string): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

function parseTargetType(value?: string): 'restaurant' | 'item' | undefined {
  return value === 'restaurant' || value === 'item' ? value : undefined;
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ---------- Cliente logado ----------

  @UseGuards(CustomerJwtAuthGuard)
  @Get('reviews/public/:tenantId/prompt-info/:orderId')
  async getReviewPromptInfo(
    @Param('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(customer, tenantId);
    return this.reviewsService.getReviewPromptInfo(tenantId, customer.customerId, orderId);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Get('reviews/public/:tenantId/me')
  async findMyReviews(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(customer, tenantId);
    return this.reviewsService.findMyReviews(tenantId, customer.customerId);
  }

  // Mapa orderId -> review, pra pintar a nota no histórico de pedidos
  // (uma chamada só pra todos os pedidos da lista, em vez de N).
  @UseGuards(CustomerJwtAuthGuard)
  @Get('reviews/public/:tenantId/by-orders')
  async findMyReviewsByOrderIds(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Query('orderIds') orderIds?: string,
  ) {
    this.assertSameTenant(customer, tenantId);
    const ids = orderIds ? orderIds.split(',').filter(Boolean) : [];
    const map = await this.reviewsService.findMyReviewsByOrderIds(tenantId, customer.customerId, ids);
    return Object.fromEntries(map);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('reviews/public/:tenantId')
  async createReview(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Body() dto: CreateReviewDto,
  ) {
    this.assertSameTenant(customer, tenantId);
    return this.reviewsService.createReview(tenantId, customer.customerId, dto);
  }

  // Curtir / descurtir (alterna). Só cliente logado, só avaliação do próprio restaurante.
  @UseGuards(CustomerJwtAuthGuard)
  @Post('reviews/public/:tenantId/:id/like')
  async toggleLike(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(customer, tenantId);
    return this.reviewsService.toggleLike(tenantId, customer.customerId, id);
  }

  // Único endpoint de "mudança" numa review já criada — apagar. Não
  // existe PATCH nessa entidade de propósito (ver comentário na
  // entity): depois de publicada, é apagar ou nada.
  @UseGuards(CustomerJwtAuthGuard)
  @Delete('reviews/public/:tenantId/:id')
  async deleteReview(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(customer, tenantId);
    await this.reviewsService.deleteReview(tenantId, customer.customerId, id);
    return { success: true };
  }

  // Id do cliente só se o token for deste restaurante (token de outro restaurante = visitante).
  private viewerId(customer: RequestCustomer | null, tenantId: string): string | null {
    return customer && customer.tenantId === tenantId ? customer.customerId : null;
  }

  private assertSameTenant(customer: RequestCustomer, tenantId: string): void {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
  }

  // ---------- Público (cardápio, sem login) ----------

  // Token OPCIONAL: visitante continua vendo tudo; logado também recebe `likedByMe`.
  // no-store porque a resposta depende de quem pergunta.
  @UseGuards(OptionalCustomerJwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Get('reviews/public/:tenantId')
  async findPublicReviews(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer | null,
    @Query('locationId') locationId?: string,
    @Query('page') page?: string,
    @Query('rating') rating?: string,
  ) {
    return this.reviewsService.findPublicReviews(
      tenantId,
      locationId ?? null,
      Number(page) || 1,
      20,
      null,
      this.viewerId(customer, tenantId),
      parseRating(rating),
    );
  }

  @Get('reviews/public/:tenantId/summary')
  async getSummary(@Param('tenantId') tenantId: string, @Query('locationId') locationId?: string) {
    return this.reviewsService.getSummary(tenantId, locationId ?? null);
  }

  // ---------- Público — avaliações de ITEM ----------
  // Mesma forma dos dois endpoints acima (resumo + lista), só que
  // escopados a um produto — pedido explícito do Felipe: "a mesma forma
  // que aparecem no header do restaurante", só que pro item.

  @Get('reviews/public/:tenantId/item/:productId/summary')
  async getItemSummary(@Param('tenantId') tenantId: string, @Param('productId') productId: string) {
    return this.reviewsService.getSummary(tenantId, null, productId);
  }

  @UseGuards(OptionalCustomerJwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Get('reviews/public/:tenantId/item/:productId')
  async findItemReviews(
    @Param('tenantId') tenantId: string,
    @Param('productId') productId: string,
    @CurrentCustomer() customer: RequestCustomer | null,
    @Query('page') page?: string,
    @Query('rating') rating?: string,
  ) {
    return this.reviewsService.findPublicReviews(
      tenantId,
      null,
      Number(page) || 1,
      20,
      productId,
      this.viewerId(customer, tenantId),
      parseRating(rating),
    );
  }

  // Resumo de TODAS as lojas de uma vez — pra tela de "escolha a loja"
  // mostrar a nota de cada uma sem N requisições.
  @Get('reviews/public/:tenantId/summary-by-location')
  async getSummaryByLocation(@Param('tenantId') tenantId: string) {
    const map = await this.reviewsService.getSummaryByLocation(tenantId);
    return Object.fromEntries(map);
  }

  // ---------- Admin ----------

  @RequirePermission('reviews:view')
  @Get('reviews/admin')
  async findAllForAdmin(
    @CurrentTenant() tenantId: string,
    @Query('locationId') locationId?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.reviewsService.findAllForAdmin(tenantId, {
      locationId: locationId || undefined,
      targetType: parseTargetType(targetType),
    });
  }

  @RequirePermission('reviews:view')
  @Get('reviews/admin/summary')
  async getAdminSummary(
    @CurrentTenant() tenantId: string,
    @Query('locationId') locationId?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.reviewsService.getAdminSummary(tenantId, {
      locationId: locationId || undefined,
      targetType: parseTargetType(targetType),
    });
  }

  // Aba "Avaliações de Itens / Pratos": nota e distribuição por produto.
  @RequirePermission('reviews:view')
  @Get('reviews/admin/items')
  async getAdminItems(@CurrentTenant() tenantId: string, @Query('locationId') locationId?: string) {
    return this.reviewsService.getAdminItemBreakdown(tenantId, { locationId: locationId || undefined });
  }

  // Responder continua permitido — só ocultar/editar a review do
  // cliente é que foi removido do sistema (decisão de produto).
  @RequirePermission('reviews:manage')
  @Post('reviews/admin/:id/respond')
  async respondToReview(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentAdminUser() staffUser: RequestAdminUser,
    @Body() dto: RespondReviewDto,
  ) {
    return this.reviewsService.respondToReview(tenantId, id, staffUser, dto.responseText);
  }
}
