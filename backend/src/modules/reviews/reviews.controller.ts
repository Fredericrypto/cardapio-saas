import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { CustomerJwtAuthGuard } from '../customers/customer-jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { RequestCustomer } from '../../common/decorators/current-customer.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { RespondReviewDto } from './dto/respond-review.dto';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ---------- Cliente logado ----------

  @UseGuards(CustomerJwtAuthGuard)
  @Get('reviews/public/:tenantId/eligible-orders')
  async findEligibleOrders(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(customer, tenantId);
    return this.reviewsService.findEligibleOrders(tenantId, customer.customerId);
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

  private assertSameTenant(customer: RequestCustomer, tenantId: string): void {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
  }

  // ---------- Público (cardápio, sem login) ----------

  @Get('reviews/public/:tenantId')
  async findPublicReviews(
    @Param('tenantId') tenantId: string,
    @Query('locationId') locationId?: string,
    @Query('page') page?: string,
  ) {
    return this.reviewsService.findPublicReviews(tenantId, locationId ?? null, Number(page) || 1, 20);
  }

  @Get('reviews/public/:tenantId/summary')
  async getSummary(@Param('tenantId') tenantId: string, @Query('locationId') locationId?: string) {
    return this.reviewsService.getSummary(tenantId, locationId ?? null);
  }

  // Resumo de TODAS as lojas de uma vez — pra tela de "escolha a loja"
  // mostrar a nota de cada uma sem N requisições.
  @Get('reviews/public/:tenantId/summary-by-location')
  async getSummaryByLocation(@Param('tenantId') tenantId: string) {
    const map = await this.reviewsService.getSummaryByLocation(tenantId);
    return Object.fromEntries(map);
  }

  // ---------- Admin ----------

  @UseGuards(JwtAuthGuard)
  @Get('reviews/admin')
  async findAllForAdmin(@CurrentTenant() tenantId: string, @Query('locationId') locationId?: string) {
    return this.reviewsService.findAllForAdmin(tenantId, { locationId });
  }

  @UseGuards(JwtAuthGuard)
  @Get('reviews/admin/summary')
  async getAdminSummary(@CurrentTenant() tenantId: string) {
    return this.reviewsService.getAdminSummary(tenantId);
  }

  // Responder continua permitido — só ocultar/editar a review do
  // cliente é que foi removido do sistema (decisão de produto).
  @UseGuards(JwtAuthGuard)
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
