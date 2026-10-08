import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CashTransaction } from './cash-transaction.entity';
import type { CashTransactionType } from './cash-transaction.entity';

class CreateCashTransactionDto {
  @IsIn(['sangria', 'suprimento', 'abertura', 'fechamento'])
  type: CashTransactionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

// Registro de movimentações de caixa (sangria etc.). Só backend por enquanto —
// a tela de lançamento no painel é um próximo passo; a aba Análise já lê isto.
@Controller('cash-transactions')
@UseGuards(JwtAuthGuard)
export class CashController {
  constructor(
    @InjectRepository(CashTransaction)
    private readonly repo: Repository<CashTransaction>,
  ) {}

  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCashTransactionDto,
    @Req() req: { user?: { userId?: string } },
  ) {
    return this.repo.save(
      this.repo.create({
        tenantId,
        userId: req.user!.userId!,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason?.trim() || null,
        locationId: dto.locationId ?? null,
      }),
    );
  }

  @Get()
  async list(@CurrentTenant() tenantId: string, @Query('limit') limit?: string) {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 100, 500),
    });
  }
}
