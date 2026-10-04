import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager, QueryFailedError } from 'typeorm';
import { CashbackSettings } from './cashback-settings.entity';
import { CashbackLedgerEntry, CashbackSourceType } from './cashback-ledger-entry.entity';
import { CashbackConsumption } from './cashback-consumption.entity';
import { Location } from '../locations/location.entity';
import { Tenant } from '../tenants/tenant.entity';
import { PushService } from '../push/push.service';
import { CreateCashbackSettingsDto } from './dto/create-cashback-settings.dto';
import { UpdateCashbackSettingsDto } from './dto/update-cashback-settings.dto';
import { toCents, fromCents } from '../../common/utils/money';

export interface CashbackCreditResult {
  creditedCents: number;
  expiresAt: Date | null;
}

@Injectable()
export class CashbackService {
  private readonly logger = new Logger(CashbackService.name);

  constructor(
    @InjectRepository(CashbackSettings)
    private readonly settingsRepo: Repository<CashbackSettings>,
    @InjectRepository(CashbackLedgerEntry)
    private readonly ledgerRepo: Repository<CashbackLedgerEntry>,
    @InjectRepository(CashbackConsumption)
    private readonly consumptionRepo: Repository<CashbackConsumption>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly pushService: PushService,
  ) {}

  // ---------- Configurações (CRUD do admin) ----------

  async findAllSettings(tenantId: string): Promise<CashbackSettings[]> {
    // O admin só EDITA configurações (não cria "novas" nem apaga): se o
    // restaurante ainda não tem nenhuma, nasce uma padrão — pausada, para não
    // creditar nada até o dono revisar e ativar.
    const existing = await this.settingsRepo.count({ where: { tenantId } });
    if (existing === 0) {
      await this.settingsRepo.save(
        this.settingsRepo.create({
          tenantId,
          name: 'Cashback',
          percentage: 5,
          minOrderValue: 0,
          maxCashbackPerOrder: null,
          maxCashbackPerCustomerPerDay: null,
          expirationDays: null,
          promoText: null,
          isActive: false,
          locations: [],
        }),
      );
    }
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
    if ((await this.settingsRepo.count({ where: { tenantId } })) > 0) {
      throw new BadRequestException(
        'O cashback já tem configuração — edite a existente em vez de criar outra.',
      );
    }
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
    const expirationChanged = dto.expirationDays !== undefined;
    const saved = await this.settingsRepo.save(settings);
    // A validade editada vale para TODO o app na hora: também alcança os
    // créditos que já estão na carteira dos clientes (sem tocar em saldo).
    if (expirationChanged) await this.applyExpirationPolicy(tenantId, saved);
    return saved;
  }

  // Aplica a validade da configuração aos créditos de PEDIDO ainda abertos
  // (restante > 0) que ela gerou. Regras que protegem o saldo:
  //  - o saldo (remaining_amount) nunca é alterado aqui, e crédito que JÁ
  //    venceu continua vencido (editar a configuração não ressuscita saldo);
  //  - validade = data do crédito + dias; se isso já ficou no passado, a
  //    contagem recomeça de hoje (editar a configuração nunca "queima" saldo);
  //  - "nunca expira" (null) limpa a validade;
  //  - prazo estendido → os avisos de vencimento voltam a poder ser enviados.
  private async applyExpirationPolicy(tenantId: string, settings: CashbackSettings): Promise<void> {
    const days = settings.expirationDays;
    const locationIds = (settings.locations ?? []).map((l) => l.id);
    const scopeSql =
      locationIds.length > 0
        ? `(e.settings_id = $2 OR (e.settings_id IS NULL AND e.location_id = ANY($3::uuid[])))`
        : `(e.settings_id = $2 OR e.settings_id IS NULL)`;
    const params: unknown[] = [tenantId, settings.id];
    if (locationIds.length > 0) params.push(locationIds);
    const daysParam = `$${params.length + 1}`;
    params.push(days);

    await this.ledgerRepo.query(
      `UPDATE cashback_ledger_entries e
          SET settings_id = $2,
              expires_at = CASE
                WHEN ${daysParam}::int IS NULL THEN NULL
                WHEN e.created_at + (${daysParam}::int * INTERVAL '1 day') > now()
                  THEN e.created_at + (${daysParam}::int * INTERVAL '1 day')
                ELSE now() + (${daysParam}::int * INTERVAL '1 day')
              END,
              notified_week_at = NULL,
              notified_two_days_at = NULL
        WHERE e.tenant_id = $1
          AND e.source_type = 'order'
          AND e.remaining_amount > 0
          AND (e.expires_at IS NULL OR e.expires_at > now())
          AND ${scopeSql}`,
      params,
    );
  }

  // As configurações nunca somem do painel: nem mesmo depois que o cashback
  // expirou — o dono sempre pode ajustar, estender ou reativar.
  async deleteSettings(_tenantId: string, _id: string): Promise<void> {
    throw new ForbiddenException(
      'As configurações de cashback não podem ser apagadas — edite ou pause a existente.',
    );
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
        settingsId: settings.id,
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

  // Igual a `consume()` acima (mesmo FIFO por proximidade de expiração,
  // mesmo lock pessimista), só que gravando a origem como uma MESA em
  // vez de um pedido avulso — ver TablesService.closeSession, chamado
  // só ali, só depois que o pagamento (ou a própria conta zerada por
  // cashback) já está confirmado. Mantido como método separado (em vez
  // de generalizar `consume`) pra nunca arriscar mudar o comportamento
  // já em produção de pedidos de balcão/entrega.
  async consumeForTableSession(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    tableSessionId: string,
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
          orderId: null,
          tableSessionId,
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
      // Exatamente um dos dois preenchido — pedido avulso de
      // balcão/entrega, OU fechamento de mesa (28/09: cashback também
      // pode ser gasto direto ao fechar a conta de uma mesa).
      orderId: string | null;
      tableSessionId: string | null;
      tableNumber: string | null;
      locationName: string | null;
      amount: number;
      reversed: boolean;
      createdAt: Date;
    }[]
  > {
    // LEFT join (não inner) em `order` e `tableSession` — um INNER join
    // aqui escondia silenciosamente todo consumo com origem em MESA
    // (orderId sempre null nesses casos).
    const consumptions = await this.consumptionRepo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.order', 'order')
      .leftJoinAndSelect('order.location', 'orderLocation')
      .leftJoinAndSelect('c.tableSession', 'tableSession')
      .leftJoinAndSelect('tableSession.table', 'table')
      .leftJoinAndSelect('table.location', 'tableLocation')
      .where('c.tenantId = :tenantId', { tenantId })
      .orderBy('c.createdAt', 'DESC')
      .getMany();

    return consumptions.map((c) => ({
      id: c.id,
      customerId: c.customerId,
      customerName: c.customer?.name ?? null,
      orderId: c.orderId,
      tableSessionId: c.tableSessionId,
      tableNumber: c.tableSession?.table?.number ?? null,
      locationName: c.order?.location?.name ?? c.tableSession?.table?.location?.name ?? null,
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
    {
      id: string;
      type: 'earned' | 'spent';
      amount: number;
      description: string;
      createdAt: Date;
      // Só nos créditos: quanto ainda resta, quando vence e se já venceu sem uso.
      remainingAmount?: number;
      expiresAt?: Date | null;
      expired?: boolean;
    }[]
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
      remainingAmount: c.remainingAmount,
      expiresAt: c.expiresAt,
      expired: c.expiresAt != null && c.expiresAt.getTime() <= Date.now() && c.remainingAmount > 0,
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

  // ---------- Carteira do cliente: saldo + tempo restante ----------

  // Saldo que ainda vale + o que vence primeiro. O frontend mostra o tempo
  // restante a partir de `nextExpiresAt` (e de cada crédito em `credits`).
  async getWallet(
    tenantId: string,
    customerId: string,
  ): Promise<{
    balance: number;
    nextExpiresAt: Date | null;
    expiringAmount: number;
    credits: { id: string; remainingAmount: number; expiresAt: Date | null }[];
  }> {
    const open = await this.ledgerRepo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.customerId = :customerId', { customerId })
      .andWhere('e.remainingAmount > 0')
      .andWhere('(e.expiresAt IS NULL OR e.expiresAt > :now)', { now: new Date() })
      .orderBy('e.expiresAt', 'ASC', 'NULLS LAST')
      .getMany();

    let totalCents = 0;
    for (const e of open) totalCents += toCents(e.remainingAmount);
    const withExpiry = open.filter((e) => e.expiresAt != null);
    const nextExpiresAt = withExpiry.length > 0 ? withExpiry[0].expiresAt : null;
    let expiringCents = 0;
    if (nextExpiresAt) {
      for (const e of withExpiry) {
        if (e.expiresAt!.getTime() === nextExpiresAt.getTime()) expiringCents += toCents(e.remainingAmount);
      }
    }
    return {
      balance: fromCents(totalCents),
      nextExpiresAt,
      expiringAmount: fromCents(expiringCents),
      credits: open.map((e) => ({ id: e.id, remainingAmount: e.remainingAmount, expiresAt: e.expiresAt })),
    };
  }

  // ---------- Avisos de vencimento (1 semana e 2 dias) ----------

  // Roda a cada 30 min. Cada crédito gera no máximo UM aviso de cada tipo.
  // Se o crédito já entra direto na janela de 2 dias, só o aviso de 2 dias
  // sai (o de 1 semana é marcado como já feito). Os avisos de um cliente no
  // mesmo ciclo são somados numa notificação só. O clique leva à área de
  // cashback (/conta-cliente/cashback).
  @Cron(CronExpression.EVERY_30_MINUTES)
  async notifyExpiringCredits(): Promise<void> {
    try {
      const now = new Date();
      const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const inWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const candidates = await this.ledgerRepo
        .createQueryBuilder('e')
        .where('e.remainingAmount > 0')
        .andWhere('e.expiresAt IS NOT NULL')
        .andWhere('e.expiresAt > :now', { now })
        .andWhere('e.expiresAt <= :inWeek', { inWeek })
        .andWhere('(e.notifiedWeekAt IS NULL OR (e.notifiedTwoDaysAt IS NULL AND e.expiresAt <= :inTwoDays))', {
          inTwoDays,
        })
        .getMany();
      if (candidates.length === 0) return;

      type Bucket = { tenantId: string; customerId: string; twoDays: CashbackLedgerEntry[]; week: CashbackLedgerEntry[] };
      const buckets = new Map<string, Bucket>();
      for (const e of candidates) {
        const key = `${e.tenantId}:${e.customerId}`;
        const b = buckets.get(key) ?? { tenantId: e.tenantId, customerId: e.customerId, twoDays: [], week: [] };
        const inTwoDayWindow = e.expiresAt!.getTime() <= inTwoDays.getTime();
        if (inTwoDayWindow && !e.notifiedTwoDaysAt) b.twoDays.push(e);
        else if (!inTwoDayWindow && !e.notifiedWeekAt) b.week.push(e);
        buckets.set(key, b);
      }

      const slugCache = new Map<string, { slug: string; logoUrl: string | null } | null>();
      for (const b of buckets.values()) {
        if (b.twoDays.length === 0 && b.week.length === 0) continue;
        let tenant = slugCache.get(b.tenantId);
        if (tenant === undefined) {
          const t = await this.tenantRepo.findOne({ where: { id: b.tenantId } });
          tenant = t ? { slug: t.slug, logoUrl: t.logoUrl ?? null } : null;
          slugCache.set(b.tenantId, tenant);
        }
        if (!tenant) continue;
        const url = `/${tenant.slug}/conta-cliente/cashback`;
        const sum = (list: CashbackLedgerEntry[]) =>
          fromCents(list.reduce((acc, e) => acc + toCents(e.remainingAmount), 0));
        const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

        if (b.twoDays.length > 0) {
          await this.pushService.sendToCustomer(b.tenantId, b.customerId, {
            title: 'Seu cashback vence em 2 dias',
            body: `${brl(sum(b.twoDays))} de cashback expiram em até 2 dias. Use no próximo pedido!`,
            url,
            tag: 'cashback',
            groupTag: 'cashback-expiring-2d',
            icon: tenant.logoUrl ?? undefined,
          });
        }
        if (b.week.length > 0) {
          await this.pushService.sendToCustomer(b.tenantId, b.customerId, {
            title: 'Seu cashback vence em 1 semana',
            body: `${brl(sum(b.week))} de cashback expiram em até 7 dias. Aproveite antes que acabe!`,
            url,
            tag: 'cashback',
            groupTag: 'cashback-expiring-7d',
            icon: tenant.logoUrl ?? undefined,
          });
        }
        const stamp = new Date();
        const twoIds = b.twoDays.map((e) => e.id);
        const weekIds = b.week.map((e) => e.id);
        // Quem entrou direto na janela de 2 dias não precisa mais do aviso de 1 semana.
        if (twoIds.length > 0) {
          await this.ledgerRepo.update(
            { id: In(twoIds) },
            { notifiedTwoDaysAt: stamp, notifiedWeekAt: stamp },
          );
        }
        if (weekIds.length > 0) await this.ledgerRepo.update({ id: In(weekIds) }, { notifiedWeekAt: stamp });
      }
    } catch (err) {
      this.logger.error('Falha ao enviar avisos de vencimento de cashback', err as Error);
    }
  }
}
