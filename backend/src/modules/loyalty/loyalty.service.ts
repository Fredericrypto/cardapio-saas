import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { ReceiptRedemption, RedemptionPurpose } from './receipt-redemption.entity';
import { LoyaltyProgram } from './loyalty-program.entity';
import { LoyaltyStamp } from './loyalty-stamp.entity';
import { LoyaltyReward } from './loyalty-reward.entity';
import { Location } from '../locations/location.entity';
import { OrdersService } from '../orders/orders.service';
import { TablesService } from '../tables/tables.service';
import { CashbackService } from '../cashback/cashback.service';
import { PushService } from '../push/push.service';
import { Tenant } from '../tenants/tenant.entity';
import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';
import { UpdateLoyaltyProgramDto } from './dto/update-loyalty-program.dto';
import { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';

export interface RedeemResult {
  alreadyRedeemed: boolean;
  redemption: ReceiptRedemption;
  // Só preenchido quando purpose === 'fidelidade'.
  stampProgress: { stampsCount: number; stampsRequired: number; rewardJustGranted: boolean } | null;
}

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(ReceiptRedemption)
    private readonly redemptionRepo: Repository<ReceiptRedemption>,
    @InjectRepository(LoyaltyProgram)
    private readonly programRepo: Repository<LoyaltyProgram>,
    @InjectRepository(LoyaltyStamp)
    private readonly stampRepo: Repository<LoyaltyStamp>,
    @InjectRepository(LoyaltyReward)
    private readonly rewardRepo: Repository<LoyaltyReward>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly ordersService: OrdersService,
    private readonly tablesService: TablesService,
    private readonly cashbackService: CashbackService,
    private readonly pushService: PushService,
  ) {}

  // ---------- Programas (CRUD do admin) ----------

  async findAllPrograms(tenantId: string): Promise<LoyaltyProgram[]> {
    return this.programRepo.find({
      where: { tenantId },
      relations: { locations: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneProgram(tenantId: string, id: string): Promise<LoyaltyProgram> {
    const program = await this.programRepo.findOne({
      where: { id, tenantId },
      relations: { locations: true },
    });
    if (!program) throw new NotFoundException('Programa de fidelidade não encontrado.');
    return program;
  }

  async createProgram(tenantId: string, dto: CreateLoyaltyProgramDto): Promise<LoyaltyProgram> {
    const locations = await this.resolveLocations(tenantId, dto.locationIds);
    const program = this.programRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      stampsRequired: dto.stampsRequired,
      rewardType: dto.rewardType,
      rewardDescription: dto.rewardDescription,
      cashbackAmount: dto.rewardType === 'cashback' ? dto.cashbackAmount ?? null : null,
      discountType: dto.rewardType === 'desconto' ? dto.discountType ?? null : null,
      discountValue: dto.rewardType === 'desconto' ? dto.discountValue ?? null : null,
      minOrderValue: dto.minOrderValue ?? 0,
      isActive: dto.isActive ?? true,
      locations,
    });
    return this.programRepo.save(program);
  }

  async updateProgram(
    tenantId: string,
    id: string,
    dto: UpdateLoyaltyProgramDto,
  ): Promise<LoyaltyProgram> {
    const program = await this.findOneProgram(tenantId, id);
    if (dto.name !== undefined) program.name = dto.name;
    if (dto.description !== undefined) program.description = dto.description || null;
    // Nunca deixa mexer em `stampsRequired` pra baixo de um jeito que
    // "roube" carimbo de quem já tinha juntado — mudar isso pra frente é
    // seguro (só demora mais pra completar dali pra frente), mas diminuir
    // poderia fazer um cliente "perder" progresso que já tinha visto
    // contado. Trava simples: só aceita aumentar.
    if (dto.stampsRequired !== undefined) {
      if (dto.stampsRequired < program.stampsRequired) {
        throw new BadRequestException(
          'Não dá pra diminuir quantos carimbos são necessários depois que o programa já está rodando — isso desconta progresso que os clientes já acumularam. Crie um programa novo em vez disso.',
        );
      }
      program.stampsRequired = dto.stampsRequired;
    }
    if (dto.rewardType !== undefined) program.rewardType = dto.rewardType;
    if (dto.rewardDescription !== undefined) program.rewardDescription = dto.rewardDescription;
    if (dto.cashbackAmount !== undefined) {
      program.cashbackAmount = program.rewardType === 'cashback' ? dto.cashbackAmount : null;
    }
    if (dto.discountType !== undefined) {
      program.discountType = program.rewardType === 'desconto' ? dto.discountType : null;
    }
    if (dto.discountValue !== undefined) {
      program.discountValue = program.rewardType === 'desconto' ? dto.discountValue : null;
    }
    if (dto.minOrderValue !== undefined) program.minOrderValue = dto.minOrderValue;
    if (dto.isActive !== undefined) program.isActive = dto.isActive;
    if (dto.locationIds !== undefined) {
      program.locations = await this.resolveLocations(tenantId, dto.locationIds);
    }
    return this.programRepo.save(program);
  }

  async deleteProgram(tenantId: string, id: string): Promise<void> {
    const program = await this.findOneProgram(tenantId, id);
    await this.programRepo.remove(program);
  }

  private async resolveLocations(tenantId: string, locationIds?: string[]): Promise<Location[]> {
    if (!locationIds || locationIds.length === 0) return [];
    return this.locationRepo.find({ where: { id: In(locationIds), tenantId } });
  }

  // ---------- Resgate (o coração anti-passback) ----------

  // Ponto de entrada único usado pela tela "Verificar cupom" do admin.
  // Sempre: (1) confere a assinatura de verdade contra o banco — nunca
  // confia em nada que veio do código sozinho; (2) checa se ESSE
  // propósito já foi usado nesse cupom antes (o índice único do banco
  // garante isso mesmo sob concorrência, não só essa checagem em
  // memória); (3) se for a primeira vez, grava o registro E, se for
  // fidelidade, conta o carimbo.
  async redeemForPurpose(
    tenantId: string,
    staffUser: RequestAdminUser,
    code: string,
    purpose: RedemptionPurpose,
    options: { notes?: string; loyaltyProgramId?: string } = {},
  ): Promise<RedeemResult> {
    const { sourceType, sourceId, customerId, totalCents, locationId } = await this.resolveAndVerifyCode(
      tenantId,
      code,
    );

    if (purpose === 'fidelidade') {
      if (!options.loyaltyProgramId) {
        throw new BadRequestException('Escolha o programa de fidelidade pra contar o carimbo.');
      }
      if (!customerId) {
        throw new BadRequestException(
          'Esse pedido não tem cliente identificado (foi feito sem login) — não dá pra contar carimbo de fidelidade nele.',
        );
      }
      const program = await this.findOneProgram(tenantId, options.loyaltyProgramId);
      if (!program.isActive) {
        throw new BadRequestException('Esse programa de fidelidade não está mais ativo.');
      }
      if (totalCents < Math.round(program.minOrderValue * 100)) {
        throw new BadRequestException(
          `Esse programa só conta carimbo em pedidos a partir de R$ ${program.minOrderValue.toFixed(2).replace('.', ',')}.`,
        );
      }
    }

    const existing = await this.findExistingRedemption(
      tenantId,
      sourceType,
      sourceId,
      purpose,
      options.loyaltyProgramId,
    );
    if (existing) {
      return {
        alreadyRedeemed: true,
        redemption: existing,
        stampProgress:
          purpose === 'fidelidade' && customerId && options.loyaltyProgramId
            ? { ...(await this.getProgress(options.loyaltyProgramId, customerId)), rewardJustGranted: false }
            : null,
      };
    }

    let redemption: ReceiptRedemption;
    try {
      redemption = await this.redemptionRepo.save(
        this.redemptionRepo.create({
          tenantId,
          sourceType,
          sourceId,
          customerId,
          purpose,
          loyaltyProgramId: purpose === 'fidelidade' ? options.loyaltyProgramId! : null,
          locationId,
          staffUserId: staffUser.userId,
          staffName: staffUser.email,
          notes: options.notes?.trim() || null,
        }),
      );
    } catch (err) {
      // Corrida: duas requisições simultâneas tentando resgatar o MESMO
      // cupom pro MESMO propósito ao mesmo tempo (dois funcionários,
      // dois toques). O índice único do banco rejeita a segunda — busca
      // de novo e devolve como "já usado" em vez de deixar vazar um erro
      // 500 feio.
      const raced = await this.findExistingRedemption(
        tenantId,
        sourceType,
        sourceId,
        purpose,
        options.loyaltyProgramId,
      );
      if (raced) {
        return {
          alreadyRedeemed: true,
          redemption: raced,
          stampProgress:
            purpose === 'fidelidade' && customerId && options.loyaltyProgramId
              ? { ...(await this.getProgress(options.loyaltyProgramId, customerId)), rewardJustGranted: false }
              : null,
        };
      }
      throw err;
    }

    let stampProgress: RedeemResult['stampProgress'] = null;
    if (purpose === 'fidelidade' && customerId && options.loyaltyProgramId) {
      await this.stampRepo.save(
        this.stampRepo.create({
          tenantId,
          programId: options.loyaltyProgramId,
          customerId,
          redemptionId: redemption.id,
        }),
      );
      const rewardJustGranted = await this.grantRewardIfEligible(
        tenantId,
        options.loyaltyProgramId,
        customerId,
      );
      const progress = await this.getProgress(options.loyaltyProgramId, customerId);
      stampProgress = { ...progress, rewardJustGranted };
      // "Melhor esforço": nunca lança erro, então uma falha de envio
      // nunca derruba o resgate do carimbo em si (o funcionário já
      // bateu o cupom, isso tem que ficar registrado independente do
      // push funcionar).
      await this.notifyStampProgress(
        tenantId,
        customerId,
        sourceType,
        sourceId,
        progress,
        rewardJustGranted,
      );
    }

    return { alreadyRedeemed: false, redemption, stampProgress };
  }

  // Fidelidade hoje é restrita ao fluxo avulso (ver resolveAndVerifyCode
  // — sessão de mesa não tem cliente logado identificado), então
  // `sourceType` aqui é sempre 'avulso' na prática; a URL já cobre os
  // dois casos por precaução caso isso mude no futuro.
  private async notifyStampProgress(
    tenantId: string,
    customerId: string,
    sourceType: 'avulso' | 'mesa',
    sourceId: string,
    progress: { stampsCount: number; stampsRequired: number },
    rewardJustGranted: boolean,
  ): Promise<void> {
    const tenant = await this.locationRepo.manager
      .getRepository(Tenant)
      .findOne({ where: { id: tenantId }, select: { slug: true, logoUrl: true } });
    if (!tenant) return;
    const url =
      sourceType === 'mesa'
        ? `/${tenant.slug}/conta-cliente/pedidos/mesa/${sourceId}`
        : `/${tenant.slug}/conta-cliente/pedidos/avulso/${sourceId}`;

    if (rewardJustGranted) {
      await this.pushService.sendToCustomer(tenantId, customerId, {
        title: 'Prêmio de fidelidade liberado!',
        body: 'Você completou seu cartão fidelidade. Toque pra ver o cupom.',
        url,
        tag: 'loyalty',
        icon: tenant.logoUrl ?? undefined,
      });
      return;
    }

    await this.pushService.sendToCustomer(tenantId, customerId, {
      title: 'Você ganhou um carimbo',
      body: `${progress.stampsCount} de ${progress.stampsRequired} carimbos no seu cartão fidelidade.`,
      url,
      tag: 'loyalty',
      icon: tenant.logoUrl ?? undefined,
    });
  }

  private async resolveAndVerifyCode(
    tenantId: string,
    code: string,
  ): Promise<{
    sourceType: 'avulso' | 'mesa';
    sourceId: string;
    customerId: string | null;
    totalCents: number;
    locationId: string | null;
  }> {
    const orderResult = await this.ordersService.verifyReceiptCode(tenantId, code);
    if (orderResult.valid && orderResult.order) {
      return {
        sourceType: 'avulso',
        sourceId: orderResult.order.id,
        customerId: orderResult.order.customerId,
        totalCents: Math.round(Number(orderResult.order.total) * 100),
        locationId: orderResult.order.locationId,
      };
    }

    const sessionResult = await this.tablesService.verifySessionReceiptCode(tenantId, code);
    if (sessionResult.valid && sessionResult.session && sessionResult.grandTotal != null) {
      // Sessão de mesa raramente tem cliente logado identificado — deixa
      // null de propósito (fidelidade fica restrita ao fluxo avulso, que
      // é o caso comum: cliente logado fazendo pedido de balcão/entrega).
      return {
        sourceType: 'mesa',
        sourceId: sessionResult.session.id,
        customerId: null,
        totalCents: Math.round(sessionResult.grandTotal * 100),
        locationId: sessionResult.session.table?.locationId ?? null,
      };
    }

    throw new NotFoundException('Código inválido — não corresponde a nenhum cupom genuíno.');
  }

  private async findExistingRedemption(
    tenantId: string,
    sourceType: 'avulso' | 'mesa',
    sourceId: string,
    purpose: RedemptionPurpose,
    loyaltyProgramId?: string,
  ): Promise<ReceiptRedemption | null> {
    if (purpose === 'fidelidade') {
      return this.redemptionRepo.findOne({
        where: { tenantId, sourceType, sourceId, purpose, loyaltyProgramId: loyaltyProgramId ?? undefined },
      });
    }
    return this.redemptionRepo.findOne({ where: { tenantId, sourceType, sourceId, purpose } });
  }

  // ---------- Carimbos e prêmios ----------

  async getProgress(
    programId: string,
    customerId: string,
  ): Promise<{ stampsCount: number; stampsRequired: number }> {
    const program = await this.programRepo.findOne({ where: { id: programId } });
    if (!program) throw new NotFoundException('Programa não encontrado.');
    const stampsCount = await this.stampRepo.count({
      where: { programId, customerId, rewardId: IsNull() },
    });
    return { stampsCount, stampsRequired: program.stampsRequired };
  }

  // Fecha quantos cartões o cliente já completou (normalmente 0 ou 1,
  // mas o loop cobre o caso raro de vários carimbos entrarem de uma vez
  // e já fecharem mais de um cartão). Consome os carimbos mais ANTIGOS
  // primeiro (FIFO) — critério justo e determinístico.
  private async grantRewardIfEligible(
    tenantId: string,
    programId: string,
    customerId: string,
  ): Promise<boolean> {
    const program = await this.programRepo.findOne({ where: { id: programId } });
    if (!program) return false;

    let grantedAny = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const unconsumed = await this.stampRepo.find({
        where: { programId, customerId, rewardId: IsNull() },
        order: { createdAt: 'ASC' },
        take: program.stampsRequired,
      });
      if (unconsumed.length < program.stampsRequired) break;

      const reward = await this.rewardRepo.save(
        this.rewardRepo.create({ tenantId, programId, customerId, status: 'pendente' }),
      );
      await this.stampRepo.save(unconsumed.map((s) => ({ ...s, rewardId: reward.id })));
      grantedAny = true;
    }
    return grantedAny;
  }

  // Painel admin: prêmios pendentes de um programa (ou de todos, se
  // programId omitido) — a fila de "o que ainda preciso entregar".
  async findPendingRewards(tenantId: string, programId?: string): Promise<LoyaltyReward[]> {
    return this.rewardRepo.find({
      where: { tenantId, status: 'pendente', ...(programId ? { programId } : {}) },
      relations: { customer: true, program: true },
      order: { grantedAt: 'ASC' },
    });
  }

  async findCustomerRewards(tenantId: string, customerId: string): Promise<LoyaltyReward[]> {
    return this.rewardRepo.find({
      where: { tenantId, customerId },
      relations: { program: true },
      order: { grantedAt: 'DESC' },
    });
  }

  // Confirma que o prêmio foi ENTREGUE de verdade — ação separada de
  // "juntar carimbos", só o funcionário no momento da entrega física
  // aciona isso.
  async fulfillReward(
    tenantId: string,
    rewardId: string,
    staffUser: RequestAdminUser,
  ): Promise<LoyaltyReward> {
    const reward = await this.rewardRepo.findOne({ where: { id: rewardId, tenantId }, relations: { program: true } });
    if (!reward) throw new NotFoundException('Prêmio não encontrado.');
    if (reward.status === 'resgatado') {
      throw new ConflictException(
        `Esse prêmio já foi entregue em ${reward.redeemedAt?.toLocaleString('pt-BR')} por ${reward.redeemedByStaffName}.`,
      );
    }
    reward.status = 'resgatado';
    reward.redeemedAt = new Date();
    reward.redeemedByStaffUserId = staffUser.userId;
    reward.redeemedByStaffName = staffUser.email;

    // Hook do prêmio tipo "cashback": em vez de (ou além de) o
    // funcionário entregar algo fisicamente, credita o valor fixo do
    // programa direto na carteira do cliente. Diferente do cashback
    // ganho por % de pedido (CashbackService.credit), esse é sempre um
    // valor FIXO em R$ (LoyaltyProgram.cashbackAmount) e nunca expira —
    // é um prêmio já conquistado ao completar o cartão fidelidade, não
    // uma promoção com prazo. Idempotente (mesma proteção de índice
    // único do ledger), então mesmo que esse endpoint seja chamado de
    // novo por engano, não credita duas vezes.
    if (reward.program?.rewardType === 'cashback' && reward.program.cashbackAmount) {
      await this.cashbackService.creditFixedAmount(
        this.rewardRepo.manager,
        tenantId,
        reward.customerId,
        reward.program.cashbackAmount,
        'loyalty_reward',
        reward.id,
      );
    }

    return this.rewardRepo.save(reward);
  }

  // Fidelidade "vale" pra essa loja? Vazio em `locations` = todas.
  async findActiveProgramsForCustomer(
    tenantId: string,
    locationId: string | null,
  ): Promise<LoyaltyProgram[]> {
    const programs = await this.programRepo.find({
      where: { tenantId, isActive: true },
      relations: { locations: true },
    });
    return programs.filter(
      (p) => p.locations.length === 0 || (locationId && p.locations.some((l) => l.id === locationId)),
    );
  }

  // ---------- Histórico (admin) ----------

  // Mesmo espírito do histórico de Promoções (PromotionsService.
  // getRedemptions): quem carimbou, quando, onde, e se aquele carimbo
  // fechou um cartão (gerou prêmio). Uma linha por CARIMBO (não por
  // resgate de cupom em geral — só os de propósito 'fidelidade'),
  // trazendo o nome do prêmio já entregue quando aplicável.
  async getFidelityHistory(tenantId: string): Promise<
    {
      id: string;
      programId: string;
      programName: string;
      customerId: string;
      customerName: string | null;
      locationName: string | null;
      createdAt: Date;
      rewardGranted: boolean;
      rewardStatus: 'pendente' | 'resgatado' | null;
      rewardFulfilledAt: Date | null;
      rewardFulfilledByStaffName: string | null;
    }[]
  > {
    const stamps = await this.stampRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.program', 'program')
      .innerJoinAndSelect('s.customer', 'customer')
      .innerJoinAndSelect('s.redemption', 'redemption')
      .leftJoinAndSelect('redemption.location', 'location')
      .leftJoinAndSelect('s.reward', 'reward')
      .where('s.tenantId = :tenantId', { tenantId })
      .orderBy('s.createdAt', 'DESC')
      .getMany();

    return stamps.map((s) => ({
      id: s.id,
      programId: s.programId,
      programName: s.program.name,
      customerId: s.customerId,
      customerName: s.customer?.name ?? null,
      locationName: s.redemption?.location?.name ?? null,
      createdAt: s.createdAt,
      rewardGranted: s.rewardId != null,
      rewardStatus: s.reward?.status ?? null,
      rewardFulfilledAt: s.reward?.redeemedAt ?? null,
      rewardFulfilledByStaffName: s.reward?.redeemedByStaffName ?? null,
    }));
  }
}
