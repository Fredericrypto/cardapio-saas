import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager, QueryFailedError } from 'typeorm';
import { CashbackSettings } from './cashback-settings.entity';
import { CashbackLedgerEntry, CashbackSourceType } from './cashback-ledger-entry.entity';
import { CashbackConsumption } from './cashback-consumption.entity';
import { Location } from '../locations/location.entity';
import { CreateCashbackSettingsDto } from './dto/create-cashback-settings.dto';
import { UpdateCashbackSettingsDto } from './dto/update-cashback-settings.dto';
import { toCents, fromCents } from '../../common/utils/money';

export interface CashbackCreditResult {
  creditedCents: number;
  expiresAt: Date | null;
}

@Injectable()
export class CashbackService {
  constructor(
    @InjectRepository(CashbackSettings)
    private readonly settingsRepo: Repository<CashbackSettings>,
    @InjectRepository(CashbackLedgerEntry)
    private readonly ledgerRepo: Repository<CashbackLedgerEntry>,
    @InjectRepository(CashbackConsumption)
    private readonly consumptionRepo: Repository<CashbackConsumption>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
  ) {}

  // ---------- Configurações (CRUD do admin) ----------

  async findAllSettings(tenantId: string): Promise<CashbackSettings[]> {
    return this.settingsRepo.find({
      where: { tenantId },
      relations: { locations: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneSettings(tenantId: string, id: string): Promise<CashbackSettings> {
    const settings = await this.settingsRepo.findOne({
      where: { id, tenantId },
      relations: { locations: true },
    });
    if (!settings) throw new NotFoundException('Configuração de cashback não encontrada.');
    return settings;
  }

  async createSettings(tenantId: string, dto: CreateCashbackSettingsDto): Promise<CashbackSettings> {
    const locations = await this.resolveLocations(tenantId, dto.locationIds);
    const settings = this.settingsRepo.create({
      tenantId,
      name: dto.name ?? 'Cashback',
      percentage: dto.percentage,
      minOrderValue: dto.minOrderValue ?? 0,
      maxCashbackPerOrder: dto.maxCashbackPerOrder ?? null,
      maxCashbackPerCustomerPerDay: dto.maxCashbackPerCustomerPerDay ?? null,
      expirationDays: dto.expirationDays ?? null,
      promoText: dto.promoText ?? null,
      isActive: dto.isActive ?? true,
      locations,
    });
    return this.settingsRepo.save(settings);
  }

  async updateSettings(
    tenantId: string,
    id: string,
    dto: UpdateCashbackSettingsDto,
  ): Promise<CashbackSettings> {
    const settings = await this.findOneSettings(tenantId, id);
    if (dto.name !== undefined) settings.name = dto.name;
    if (dto.percentage !== undefined) settings.percentage = dto.percentage;
    if (dto.minOrderValue !== undefined) settings.minOrderValue = dto.minOrderValue;
    if (dto.maxCashbackPerOrder !== undefined) settings.maxCashbackPerOrder = dto.maxCashbackPerOrder;
    if (dto.maxCashbackPerCustomerPerDay !== undefined) {
      settings.maxCashbackPerCustomerPerDay = dto.maxCashbackPerCustomerPerDay;
    }
    if (dto.expirationDays !== undefined) settings.expirationDays = dto.expirationDays;
    if (dto.promoText !== undefined) settings.promoText = dto.promoText || null;
    if (dto.isActive !== undefined) settings.isActive = dto.isActive;
    if (dto.locationIds !== undefined) {
      settings.locations = await this.resolveLocations(tenantId, dto.locationIds);
    }
    return this.settingsRepo.save(settings);
  }

  async deleteSettings(tenantId: string, id: string): Promise<void> {
    const settings = await this.findOneSettings(tenantId, id);
    await this.settingsRepo.remove(settings);
  }

  private async resolveLocations(tenantId: string, locationIds?: string[]): Promise<Location[]> {
    if (!locationIds || locationIds.length === 0) return [];
    return this.locationRepo.find({ where: { id: In(locationIds), tenantId } });
  }

  // Qual config vale pra uma loja específica: entre as ATIVAS, a que
  // lista essa loja explicitamente vence sobre a global (locations
  // vazio); se mais de uma amarra na mesma especificidade, a de maior
  // percentual (melhor pro cliente, resultado determinístico). null =
  // nenhuma config ativa cobre essa loja (cashback desligado ali).
  private async findApplicableSettings(
    tenantId: string,
    locationId: string | null,
  ): Promise<CashbackSettings | null> {
    const all = await this.settingsRepo.find({
      where: { tenantId, isActive: true },
      relations: { locations: true },
    });
    if (all.length === 0) return null;

    const specific = locationId
      ? all.filter((s) => s.locations.some((l) => l.id === locationId))
      : [];
    const candidates = specific.length > 0 ? specific : all.filter((s) => s.locations.length === 0);
    if (candidates.length === 0) return null;

    return candidates.reduce((best, cur) => (cur.percentage > best.percentage ? cur : best));
  }

  // Cardápio público: qual config (se alguma) vale pra essa loja, só
  // pra exibir o texto de propaganda ("Ganhe 5% de volta!") — nunca usa
  // isso pra calcular nada de verdade no frontend, o valor é sempre
  // recalculado no backend na hora de creditar.
  async findActiveForPublic(tenantId: string, locationId: string | null): Promise<CashbackSettings | null> {
    return this.findApplicableSettings(tenantId, locationId);
  }

  // ---------- Saldo ----------

  // Sempre recomputado do zero a partir do ledger — nunca um campo
  // solto. Filtra expiração direto na query (`expiresAt IS NULL OR
  // expiresAt > now()`), então cashback vencido some do saldo sozinho,
  // sem depender de nenhum job em background.
  async getBalance(tenantId: string, customerId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(CashbackLedgerEntry) : this.ledgerRepo;
    const raw = await repo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.remainingAmount), 0)', 'total')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.customerId = :customerId', { customerId })
      .andWhere('e.remainingAmount > 0')
      .andWhere('(e.expiresAt IS NULL OR e.expiresAt > :now)', { now: new Date() })
      .getRawOne<{ total: string }>();
    return Number(raw?.total) || 0;
  }

  // ---------- Crédito (ganhar cashback) ----------

  // Chamado nos 4 pontos onde um pedido/sessão vira "pago de verdade"
  // (ver OrdersService.concludeWithPayment/confirmPixPayment/
  // applyMercadoPagoStatus e TablesService.closeSession). `eligibleCents`
  // é sempre o valor dos ITENS já líquido de promoção (nunca inclui taxa
  // de entrega, gorjeta, ou o próprio cashback usado no pedido — senão o
  // cliente ganharia cashback em cima de cashback). Idempotente: se já
  // existe um crédito pra essa (sourceType, sourceId), não credita de
  // novo — protege contra o mesmo pagamento sendo confirmado duas vezes
  // (ex: webhook do Mercado Pago e o polling do painel colidindo).
  async credit(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    locationId: string | null,
    eligibleCents: number,
    sourceType: CashbackSourceType,
    sourceId: string,
  ): Promise<CashbackCreditResult> {
    const settings = await this.findApplicableSettings(tenantId, locationId);
    if (!settings || eligibleCents <= 0) return { creditedCents: 0, expiresAt: null };
    if (eligibleCents < toCents(settings.minOrderValue)) return { creditedCents: 0, expiresAt: null };

    let creditCents = Math.round((eligibleCents * settings.percentage) / 100);
    if (settings.maxCashbackPerOrder != null) {
      creditCents = Math.min(creditCents, toCents(settings.maxCashbackPerOrder));
    }

    // Teto diário por cliente — soma tudo que esse cliente já ganhou de
    // cashback de PEDIDO (sourceType='order') nas últimas 24h e reduz o
    // crédito até o que ainda cabe. Nunca rejeita o pedido inteiro por
    // causa disso, só limita o quanto de cashback ele gera — igual o
    // teto por pedido acima, é sempre um CAP, nunca um bloqueio.
    // Ajustes manuais (admin_adjustment) e prêmios de fidelidade
    // (loyalty_reward) nunca contam pra esse teto — ele existe pra
    // fechar a brecha de "vários pedidos pequenos seguidos" acumulando
    // cashback promocional sem limite, não pra restringir prêmio já
    // conquistado.
    if (settings.maxCashbackPerCustomerPerDay != null) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const earnedTodayRaw = await manager
        .getRepository(CashbackLedgerEntry)
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.originalAmount), 0)', 'total')
        .where('e.tenantId = :tenantId', { tenantId })
        .andWhere('e.customerId = :customerId', { customerId })
        .andWhere('e.sourceType = :sourceType', { sourceType: 'order' })
        .andWhere('e.createdAt > :since', { since })
        .getRawOne<{ total: string }>();
      const earnedTodayCents = toCents(Number(earnedTodayRaw?.total) || 0);
      const dailyCapCents = toCents(settings.maxCashbackPerCustomerPerDay);
      const remainingTodayCents = Math.max(0, dailyCapCents - earnedTodayCents);
      creditCents = Math.min(creditCents, remainingTodayCents);
    }

    if (creditCents <= 0) return { creditedCents: 0, expiresAt: null };

    const expiresAt =
      settings.expirationDays != null
        ? new Date(Date.now() + settings.expirationDays * 24 * 60 * 60 * 1000)
        : null;

    const repo = manager.getRepository(CashbackLedgerEntry);
    try {
      await repo.insert({
        tenantId,
        customerId,
        locationId,
        sourceType,
        sourceId,
        originalAmount: fromCents(creditCents),
        remainingAmount: fromCents(creditCents),
        expiresAt,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        // Já creditado antes pra essa mesma origem — no-op, idempotente.
        return { creditedCents: 0, expiresAt: null };
      }
      throw err;
    }
    return { creditedCents: creditCents, expiresAt };
  }

  // Crédito de valor FIXO (não percentual) — usado pelo hook de
  // LoyaltyProgram.rewardType === 'cashback' (ver LoyaltyService.
  // fulfillReward): o cartão fidelidade completo vira um valor fixo em
  // R$ definido no programa, não uma porcentagem de pedido nenhum.
  // Nunca expira (é um prêmio já conquistado, não uma promoção com
  // prazo) — diferente do crédito por percentual, que segue
  // `expirationDays` da config de cashback.
  async creditFixedAmount(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    amount: number,
    sourceType: CashbackSourceType,
    sourceId: string,
  ): Promise<void> {
    const repo = manager.getRepository(CashbackLedgerEntry);
    try {
      await repo.insert({
        tenantId,
        customerId,
        locationId: null,
        sourceType,
        sourceId,
        originalAmount: amount,
        remainingAmount: amount,
        expiresAt: null,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) return; // idempotente
      throw err;
    }
  }

  // ---------- Consumo (gastar cashback no checkout) ----------

  // Consome até `requestedCents` do saldo do cliente, sempre FIFO por
  // proximidade de expiração (o crédito que vence primeiro é gasto
  // primeiro — melhor pro cliente do que perder saldo por vencimento
  // enquanto outro crédito sem prazo fica intocado). `SELECT ... FOR
  // UPDATE` (pessimistic_write) trava as linhas envolvidas dentro da
  // MESMA transação do pedido, então dois pedidos concorrentes do mesmo
  // cliente nunca conseguem gastar o mesmo centavo duas vezes — o
  // segundo espera o primeiro terminar e então vê o saldo já
  // atualizado. Retorna o valor REALMENTE consumido (pode ser menor que
  // o pedido, se o saldo mudou entre a estimativa e a hora de gastar de
  // verdade — o chamador nunca deve supor que o valor pedido foi
  // integralmente atendido).
  async consume(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    orderId: string,
    requestedCents: number,
  ): Promise<number> {
    if (requestedCents <= 0) return 0;

    const repo = manager.getRepository(CashbackLedgerEntry);
    const entries = await repo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.customerId = :customerId', { customerId })
      .andWhere('e.remainingAmount > 0')
      .andWhere('(e.expiresAt IS NULL OR e.expiresAt > :now)', { now: new Date() })
      .orderBy('e.expiresAt', 'ASC', 'NULLS LAST')
      .addOrderBy('e.createdAt', 'ASC')
      .setLock('pessimistic_write')
      .getMany();

    let remaining = requestedCents;
    const consumptions: CashbackConsumption[] = [];
    const consumptionRepo = manager.getRepository(CashbackConsumption);

    for (const entry of entries) {
      if (remaining <= 0) break;
      const availableCents = toCents(entry.remainingAmount);
      if (availableCents <= 0) continue;
      const takeCents = Math.min(availableCents, remaining);

      entry.remainingAmount = fromCents(availableCents - takeCents);
      await repo.save(entry);

      consumptions.push(
        consumptionRepo.create({
          tenantId,
          customerId,
          orderId,
          ledgerEntryId: entry.id,
          amount: fromCents(takeCents),
        }),
      );
      remaining -= takeCents;
    }

    if (consumptions.length > 0) {
      await consumptionRepo.save(consumptions);
    }
    return requestedCents - remaining;
  }

  // ---------- Reversão (pedido cancelado) ----------

  // Contrapartida de `consume`: devolve pro(s) crédito(s) de origem
  // tudo que esse pedido tinha gastado, e marca as linhas como
  // revertidas (nunca apaga, igual o resto do sistema financeiro).
  // Devolve mesmo que o crédito de origem já tenha expirado nesse meio
  // tempo — é uma correção de um débito indevido, não uma criação de
  // valor novo, então a data de expiração original não deveria impedir.
  // Idempotente: consumo já revertido é ignorado.
  async reverseConsumptionForOrder(manager: EntityManager, tenantId: string, orderId: string): Promise<void> {
    const consumptionRepo = manager.getRepository(CashbackConsumption);
    const consumptions = await consumptionRepo.find({ where: { tenantId, orderId, reversed: false } });
    if (consumptions.length === 0) return;

    const ledgerRepo = manager.getRepository(CashbackLedgerEntry);
    for (const consumption of consumptions) {
      const entry = await ledgerRepo.findOne({ where: { id: consumption.ledgerEntryId } });
      if (entry) {
        entry.remainingAmount = fromCents(toCents(entry.remainingAmount) + toCents(consumption.amount));
        await ledgerRepo.save(entry);
      }
      consumption.reversed = true;
    }
    await consumptionRepo.save(consumptions);
  }

  // Contrapartida de `credit`: zera o que ainda sobrava de um crédito
  // gerado por um pedido cancelado (o cliente não deveria ter ganho
  // cashback de um pedido que não vingou). Se parte desse crédito já
  // tinha sido GASTA em outro pedido nesse meio tempo, aquela parte já
  // gasta não é recuperada — é um cenário raro (cancelar um pedido bem
  // depois de já ter usado o cashback que ele gerou em outra compra) e
  // aceito como limitação conhecida, documentada aqui de propósito.
  async reverseCreditForOrder(manager: EntityManager, tenantId: string, orderId: string): Promise<void> {
    const repo = manager.getRepository(CashbackLedgerEntry);
    await repo
      .createQueryBuilder()
      .update(CashbackLedgerEntry)
      .set({ remainingAmount: 0 })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('source_type = :sourceType', { sourceType: 'order' })
      .andWhere('source_id = :orderId', { orderId })
      .execute();
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505';
  }

  // ---------- Histórico e totais (aba "Cashback" dentro de Histórico, admin) ----------

  // Uma linha por CRÉDITO — quem recebeu, quanto, de onde, quando, e
  // (se já foi total ou parcialmente gasto) quanto ainda resta. Mesmo
  // espírito de PromotionsService.getRedemptions, mas cobrindo as duas
  // pontas do cashback (ganhar E gastar) já que aqui não tem como
  // resumir num "usado sim/não" binário — um crédito pode ser gasto aos
  // poucos, em vários pedidos diferentes.
  async getAdminCreditHistory(tenantId: string): Promise<
    {
      id: string;
      customerId: string;
      customerName: string | null;
      locationName: string | null;
      sourceType: CashbackSourceType;
      sourceId: string | null;
      originalAmount: number;
      remainingAmount: number;
      expiresAt: Date | null;
      createdAt: Date;
    }[]
  > {
    const entries = await this.ledgerRepo
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.customer', 'customer')
      .leftJoinAndSelect('e.location', 'location')
      .where('e.tenantId = :tenantId', { tenantId })
      .orderBy('e.createdAt', 'DESC')
      .getMany();

    return entries.map((e) => ({
      id: e.id,
      customerId: e.customerId,
      customerName: e.customer?.name ?? null,
      locationName: e.location?.name ?? null,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      originalAmount: e.originalAmount,
      remainingAmount: e.remainingAmount,
      expiresAt: e.expiresAt,
      createdAt: e.createdAt,
    }));
  }

  // Uma linha por CONSUMO — em qual pedido, de qual loja, quanto foi
  // gasto. Um único pedido pode ter várias linhas aqui (gastou de mais
  // de um crédito ao mesmo tempo — ver CashbackService.consume), então
  // o frontend deve agrupar por orderId se quiser mostrar "esse pedido
  // gastou R$X" numa linha só.
  async getAdminConsumptionHistory(tenantId: string): Promise<
    {
      id: string;
      customerId: string;
      customerName: string | null;
      orderId: string;
      locationName: string | null;
      amount: number;
      reversed: boolean;
      createdAt: Date;
    }[]
  > {
    const consumptions = await this.consumptionRepo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.customer', 'customer')
      .innerJoinAndSelect('c.order', 'order')
      .leftJoinAndSelect('order.location', 'location')
      .where('c.tenantId = :tenantId', { tenantId })
      .orderBy('c.createdAt', 'DESC')
      .getMany();

    return consumptions.map((c) => ({
      id: c.id,
      customerId: c.customerId,
      customerName: c.customer?.name ?? null,
      orderId: c.orderId,
      locationName: c.order?.location?.name ?? null,
      amount: c.amount,
      reversed: c.reversed,
      createdAt: c.createdAt,
    }));
  }

  // Painel de totais — "quanto já foi dado" (soma de todo crédito
  // gerado, mesmo o já gasto ou expirado) e "quanto já foi usado" (soma
  // de todo consumo NÃO revertido). A diferença entre os dois nunca bate
  // exatamente com "quanto está em carteira agora" — falta descontar o
  // que expirou sem ser usado, que é intencionalmente não contado aqui
  // (é dinheiro que nunca vai sair, não interessa pro "quanto usei/dei
  // de verdade").
  async getTotals(tenantId: string): Promise<{ totalCredited: number; totalConsumed: number }> {
    const creditedRaw = await this.ledgerRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.originalAmount), 0)', 'total')
      .where('e.tenantId = :tenantId', { tenantId })
      .getRawOne<{ total: string }>();

    const consumedRaw = await this.consumptionRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.amount), 0)', 'total')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.reversed = false')
      .getRawOne<{ total: string }>();

    return {
      totalCredited: Number(creditedRaw?.total) || 0,
      totalConsumed: Number(consumedRaw?.total) || 0,
    };
  }

  // Extrato do cliente logado (área "Cashback" da conta) — junta
  // créditos (ganhos) e consumos (gastos) numa única linha do tempo,
  // cada um já formatado como "entrada" ou "saída" pro frontend não
  // precisar adivinhar.
  async getCustomerHistory(
    tenantId: string,
    customerId: string,
  ): Promise<
    { id: string; type: 'earned' | 'spent'; amount: number; description: string; createdAt: Date }[]
  > {
    const credits = await this.ledgerRepo.find({
      where: { tenantId, customerId },
      order: { createdAt: 'DESC' },
    });
    const consumptions = await this.consumptionRepo.find({
      where: { tenantId, customerId, reversed: false },
      order: { createdAt: 'DESC' },
    });

    const SOURCE_LABELS: Record<CashbackSourceType, string> = {
      order: 'Cashback do pedido',
      loyalty_reward: 'Prêmio de fidelidade',
      admin_adjustment: 'Ajuste do restaurante',
    };

    const earned = credits.map((c) => ({
      id: c.id,
      type: 'earned' as const,
      amount: c.originalAmount,
      description: SOURCE_LABELS[c.sourceType],
      createdAt: c.createdAt,
    }));
    const spent = consumptions.map((c) => ({
      id: c.id,
      type: 'spent' as const,
      amount: c.amount,
      description: 'Usado em um pedido',
      createdAt: c.createdAt,
    }));

    return [...earned, ...spent].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
