import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { RestaurantTable } from './restaurant-table.entity';
import { TableSession } from './table-session.entity';
import { TableSessionParticipant } from './table-session-participant.entity';
import { WaiterCall } from './waiter-call.entity';
import { Order } from '../orders/order.entity';
import { Location } from '../locations/location.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { CustomerVerificationService } from '../customers/customer-verification.service';
import { CreateTableDto } from './dto/create-table.dto';
import { CashbackService } from '../cashback/cashback.service';
import { PushService } from '../push/push.service';
import { MercadoPagoService } from '../payments/mercadopago.service';
import { decryptSecret } from '../../common/utils/encryption';
import { toCents, fromCents } from '../../common/utils/money';
import { computeIsOpenNow } from '../../common/utils/schedule';
import { signReceipt, verifyReceiptSignature, formatVerificationCode, parseVerificationCode } from '../../common/utils/receipt-signature';

// Janela de pagamento do Pix de MESA (28/09) — bem maior que a de um
// pedido avulso (6 min, em OrdersService): fechar a conta de uma mesa
// inteira envolve reunir todo mundo, decidir gorjeta, abrir o banco...
// 6 minutos seria apertado demais e expiraria cobranças legítimas.
const TABLE_PIX_PAYMENT_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(RestaurantTable)
    private readonly tableRepo: Repository<RestaurantTable>,
    @InjectRepository(TableSession)
    private readonly sessionRepo: Repository<TableSession>,
    @InjectRepository(WaiterCall)
    private readonly waiterCallRepo: Repository<WaiterCall>,
    @InjectRepository(TableSessionParticipant)
    private readonly participantRepo: Repository<TableSessionParticipant>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly cashbackService: CashbackService,
    private readonly pushService: PushService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly verificationService: CustomerVerificationService,
  ) {}

  // Mesma checagem usada na criação de pedido (OrdersService) — chamar
  // garçom e abrir/entrar numa sessão de mesa também são ações do
  // cliente que só fazem sentido com a LOJA (não a marca inteira) aberta.
  // Sem isso, dava pra escanear o QR e chamar garçom mesmo com a loja
  // fechada, o que confundia tanto cliente quanto o próprio dono.
  private async assertOpen(locationId: string): Promise<void> {
    const location = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!location) {
      throw new NotFoundException('Loja não encontrada.');
    }
    if (!computeIsOpenNow(location.isOpen, location.openingHours)) {
      throw new BadRequestException('Esta loja não está aberta no momento.');
    }
  }

  // ---------- Gestão de mesas (painel admin) ----------

  async findAllForAdmin(tenantId: string): Promise<RestaurantTable[]> {
    return this.tableRepo.find({ where: { tenantId }, order: { number: 'ASC' } });
  }

  async create(tenantId: string, dto: CreateTableDto): Promise<RestaurantTable> {
    const location = await this.locationRepo.findOne({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException('Loja não encontrada.');
    }
    const qrCodeToken = randomBytes(24).toString('hex');
    const table = this.tableRepo.create({ ...dto, tenantId, qrCodeToken });
    return this.tableRepo.save(table);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const table = await this.tableRepo.findOne({ where: { id, tenantId } });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada.');
    }
    await this.tableRepo.softDelete(id);
  }

  // ---------- Fluxo do cliente (público, via QR code) ----------

  // Chamado quando o cliente escaneia o QR code. Se já existe uma sessão
  // "aberta" pra essa mesa, reaproveita (várias pessoas na mesma mesa
  // caem na mesma conta). Senão, abre uma nova.
  // Anexa `hasOrder`/`expiresAt` calculados na hora — nunca gravados no
  // banco, só pra o frontend desenhar o timer sem precisar de outra
  // chamada. Reaproveitado tanto por quem acabou de entrar (scan) quanto
  // por quem só está revisitando (getCurrentSession).
  async withTimerInfo(
    session: TableSession,
  ): Promise<TableSession & { hasOrder: boolean; expiresAt: string | null }> {
    const hasOrder = await this.orderRepo.exists({ where: { tableSessionId: session.id } });
    let expiresAt: string | null = null;
    if (!hasOrder && session.status === 'aberta') {
      const tenant = await this.tableRepo.manager
        .getRepository(Tenant)
        .findOne({ where: { id: session.tenantId }, select: { tableSessionTimeoutMinutes: true } });
      if (tenant?.tableSessionTimeoutMinutes) {
        expiresAt = new Date(
          session.openedAt.getTime() + tenant.tableSessionTimeoutMinutes * 60_000,
        ).toISOString();
      }
    }
    return { ...session, hasOrder, expiresAt };
  }

  // Pedido do Felipe (14/09, sessão I): marca esse cliente como
  // PRESENTE na mesa desde o instante que ele confirma entrar (scan +
  // "sim, continuar"), não só quando faz o primeiro pedido. Upsert
  // simples: se já tinha saído antes e voltou, revive (`leftAt = null`)
  // em vez de duplicar linha (o índice único de sessão+cliente barraria
  // mesmo).
  private async markPresent(tableSessionId: string, customerId: string): Promise<void> {
    const existing = await this.participantRepo.findOne({
      where: { tableSessionId, customerId },
    });
    if (existing) {
      if (existing.leftAt) {
        existing.leftAt = null;
        await this.participantRepo.save(existing);
      }
      return;
    }
    await this.participantRepo.save(
      this.participantRepo.create({ tableSessionId, customerId }),
    );
  }

  // Ação explícita do cliente ("Sair dessa mesa") — nunca automática.
  // Só marca esse cliente como ausente; a sessão em si (e os pedidos já
  // feitos por ele) continuam intactos pros outros que ainda estão lá.
  async leaveTable(qrCodeToken: string, customerId: string): Promise<void> {
    const table = await this.tableRepo.findOne({ where: { qrCodeToken, isActive: true } });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada ou QR code inválido.');
    }
    const session = await this.sessionRepo.findOne({
      where: [
        { tableId: table.id, status: 'aberta' },
        { tableId: table.id, status: 'fechamento_solicitado' },
      ],
      order: { openedAt: 'DESC' },
    });
    if (!session) return;
    // Pedido do Felipe (16/09): quem JÁ FEZ pedido nessa conta não pode
    // sair sozinho — a conta continua em aberto, com o valor dele
    // dentro, e ninguém mais consegue fechar/pagar por ele depois que
    // ele sumir do painel. Só libera sair sem pedido nenhum ainda
    // (nesse caso não tem valor nenhum em jogo). "Cancelado" não conta
    // como pedido de verdade pra esse efeito.
    const hasOrder = await this.orderRepo.exists({
      where: { tableSessionId: session.id, customerId, status: Not('cancelado') },
    });
    if (hasOrder) {
      throw new ConflictException(
        'Você já tem pedidos nessa conta. Peça pro garçom fechar e pagar a conta antes de sair da mesa.',
      );
    }
    await this.participantRepo.update(
      { tableSessionId: session.id, customerId },
      { leftAt: new Date() },
    );
  }

  async openOrJoinSession(qrCodeToken: string, customerId?: string | null): Promise<TableSession> {
    const table = await this.tableRepo.findOne({
      where: { qrCodeToken, isActive: true },
    });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada ou QR code inválido.');
    }
    await this.assertOpen(table.locationId);

    // CRÍTICO: reaproveita a sessão tanto se estiver "aberta" quanto se já
    // tiver "fechamento_solicitado". Sem isso, um cliente que solicitasse o
    // fechamento e voltasse a escanear o QR (ou desse refresh) abriria uma
    // SEGUNDA sessão "por baixo" pra mesma mesa, deixando o garçom sem ver
    // pedidos novos que ficariam fora da conta que ele acha que vai fechar.
    // Só quando a sessão está "fechada"/"expirada" de fato é que uma nova é
    // criada.
    const existingSession = await this.sessionRepo.findOne({
      where: [
        { tableId: table.id, status: 'aberta' },
        { tableId: table.id, status: 'fechamento_solicitado' },
      ],
      relations: { table: true },
      order: { openedAt: 'DESC' },
    });
    if (existingSession) {
      // BUG REAL ENCONTRADO 2026-09-13: esse early-return devolvia a sessão
      // existente tal como estava, mesmo quando `customerId` chegava
      // preenchido agora e `openedByCustomerId` da sessão ainda era `null`.
      // Isso significa que qualquer sessão já criada como convidado (por
      // exemplo, se a primeira chamada aconteceu um instante antes do
      // AuthContext do cliente resolver, ou uma sessão remanescente de
      // antes deste próprio deploy) ficava com a identidade travada em
      // "convidado" pra sempre — nenhuma chamada seguinte, mesmo já
      // autenticada, jamais atualizava o dono da sessão. É a explicação
      // mais provável do sintoma "Ninguém identificado ainda" persistir
      // mesmo depois das duas correções anteriores (findActiveOverview +
      // race do CustomerAuthContext): aquelas corrigiram como a IDENTIDADE
      // é lida/detectada, mas não cobriam o caso de uma sessão que já
      // existia sem identidade nenhuma gravada. Agora, se a sessão ainda
      // não tem dono e um cliente logado está entrando nela, grava o dono
      // agora — nunca sobrescreve um openedByCustomerId já preenchido (não
      // rouba a mesa de quem abriu primeiro).
      if (customerId && !existingSession.openedByCustomerId) {
        existingSession.openedByCustomerId = customerId;
        await this.markPresent(existingSession.id, customerId);
        return this.sessionRepo.save(existingSession);
      }
      if (customerId) await this.markPresent(existingSession.id, customerId);
      return existingSession;
    }

    // BUG REAL CORRIGIDO: uma sessão "expirada" (ver expireIfStale/cron
    // acima) continua ocupando a mesa pro índice único do banco — só
    // status 'fechada' fica isento dele (ver migration
    // AddUniqueActiveSessionPerTable). Sem isso, depois que o timer
    // estoura, escanear essa mesa de NOVO (pelo ícone ou pela câmera,
    // tanto faz) sempre esbarra na unique constraint ao tentar criar a
    // sessão nova, quebra com um erro 500 não tratado, e o cliente fica
    // preso num loop reescaneando pra sempre sem nunca conseguir entrar
    // de novo na mesa. Uma sessão expirada não vale mais nada pro
    // cliente — fecha ela definitivamente antes de abrir a próxima.
    const staleSession = await this.sessionRepo.findOne({
      where: { tableId: table.id, status: 'expirada' },
    });
    if (staleSession) {
      staleSession.status = 'fechada';
      staleSession.closedAt = staleSession.closedAt ?? new Date();
      await this.sessionRepo.save(staleSession);
    }

    // TRAVA DE SEGURANÇA (14/09, sessão I): o frontend já decide, pelo
    // `recentlyEnded` de `getCurrentSession`, não nem tentar chamar isto
    // aqui enquanto a última sessão dessa mesa fechou há pouco — mas o
    // Felipe foi taxativo: "sem a menor possibilidade de burlar isso".
    // Uma checagem só no frontend pode ser contornada por qualquer
    // chamada direta à API (nunca confiar em validação só do lado do
    // cliente pra uma regra de segurança). Reforça a MESMA janela aqui,
    // na origem: se a mesa acabou de ser liberada, nem o backend cria
    // sessão nova, ponto final — só volta a aceitar depois que a janela
    // passar.
    const recentlyClosed = await this.sessionRepo.exists({
      where: {
        tableId: table.id,
        closedAt: MoreThan(
          new Date(Date.now() - TablesService.RECENTLY_ENDED_WINDOW_MINUTES * 60_000),
        ),
        // Mesma exceção do getCurrentSession: encerramento forçado pelo
        // admin libera a mesa na hora.
        forceClosedReason: IsNull(),
      },
    });
    if (recentlyClosed) {
      throw new ConflictException(
        'Essa mesa acabou de ser encerrada. Aguarde alguns minutos e escaneie o QR code de novo.',
      );
    }

    // ANTI "PULAR DE MESA" — a pedido do Felipe (14/09, sessão I), sem
    // exceção pra mesa com PEDIDO em outro lugar (dinheiro/conta real em
    // jogo — bloqueia sempre, sem exceção). BUG REAL CORRIGIDO NA MESMA
    // SESSÃO: a primeira versão disso bloqueava TAMBÉM sessões vazias
    // (sem pedido nenhum) abertas pelo próprio cliente em outra mesa —
    // e como o bloqueio agora acontece ANTES da limpeza automática de
    // sessão vazia própria (mais abaixo), isso travava o cliente pra
    // sempre em qualquer sobra de teste/mesa esquecida sem pedido,
    // mesmo sem ninguém "usando" de verdade nada. Corrigido: só bloqueia
    // aqui quando existe PEDIDO de verdade na outra sessão (dele ou de
    // quem quer que seja na mesa) — uma sessão vazia que ELE MESMO abriu
    // continua sendo fechada automaticamente logo abaixo, sem bloquear
    // nada, exatamente como antes de 14/09. Se ele é PARTICIPANTE (não
    // dono) de uma sessão ativa de outra pessoa, bloqueia sempre, com ou
    // sem pedido — não é dele pra decidir se está "vazia o suficiente".
    if (customerId) {
      const otherOpenedByMeWithOrder = await this.sessionRepo
        .createQueryBuilder('s')
        .innerJoin('orders', 'o', 'o.table_session_id = s.id')
        .where('s.tenant_id = :tenantId', { tenantId: table.tenantId })
        .andWhere('s.opened_by_customer_id = :customerId', { customerId })
        .andWhere('s.table_id != :tableId', { tableId: table.id })
        .andWhere('s.status IN (:...openStatuses)', {
          openStatuses: ['aberta', 'fechamento_solicitado'],
        })
        .getExists();
      const otherJoinedByMe = await this.participantRepo
        .createQueryBuilder('p')
        .innerJoin(TableSession, 'otherSession', 'otherSession.id = p.tableSessionId')
        .where('otherSession.tenant_id = :tenantId', { tenantId: table.tenantId })
        .andWhere('p.customer_id = :customerId', { customerId })
        .andWhere('p.left_at IS NULL')
        .andWhere('otherSession.table_id != :tableId', { tableId: table.id })
        .andWhere('otherSession.status IN (:...openStatuses)', {
          openStatuses: ['aberta', 'fechamento_solicitado'],
        })
        .getExists();
      if (otherOpenedByMeWithOrder || otherJoinedByMe) {
        throw new ConflictException(
          'Você tem uma mesa em aberto em outro lugar. Peça pro garçom fechar/pagar essa conta antes de abrir outra mesa ou balcão.',
        );
      }
    }

    const session = this.sessionRepo.create({
      tenantId: table.tenantId,
      tableId: table.id,
      status: 'aberta',
      openedByCustomerId: customerId ?? null,
    });
    session.table = table;

    // Mesa vazia (sem pedido nenhum) que ESSE MESMO cliente logado tinha
    // deixado aberta em outra mesa fica pendurada pra sempre no painel
    // do garçom até o timer configurado estourar (se houver um) — o
    // cliente já foi embora dali, então fecha ela agora, na hora de
    // abrir a nova. Só toca em sessões que ESSE cliente especificamente
    // abriu (openedByCustomerId) e que continuam sem nenhum pedido —
    // nunca em mesas de outros clientes, nunca em mesas com conta em
    // andamento (essas já foram bloqueadas antes, no `if (customerId)`
    // acima, que barra o scan inteiro se houver pedido pendente).
    if (customerId) {
      const staleOwnSessions = await this.sessionRepo.find({
        where: { tenantId: table.tenantId, openedByCustomerId: customerId, status: 'aberta' },
      });
      for (const stale of staleOwnSessions) {
        if (stale.tableId === table.id) continue;
        const hasAnyOrder = await this.orderRepo.exists({ where: { tableSessionId: stale.id } });
        if (!hasAnyOrder) {
          stale.status = 'fechada';
          stale.closedAt = new Date();
          await this.sessionRepo.save(stale);
        }
      }
    }

    try {
      const saved = await this.sessionRepo.save(session);
      if (customerId) await this.markPresent(saved.id, customerId);
      return saved;
    } catch (err: any) {
      // Race condition: outra requisição concorrente (ex: duplo scan quase
      // simultâneo) já criou a sessão ativa dessa mesa entre o SELECT acima
      // e este INSERT. O índice único parcial em table_sessions barra a
      // segunda gravação (código 23505 do Postgres) — em vez de estourar
      // erro pro cliente, buscamos e devolvemos a sessão que "venceu".
      if (err?.code === '23505') {
        // Mesmo raciocínio do bloco acima: a sessão "vencedora" da
        // corrida pode estar em QUALQUER status que o índice único
        // considera ocupado (tudo exceto 'fechada'), não só
        // aberta/fechamento_solicitado — nunca estreitar esse filtro,
        // ou volta a cair no mesmo 500 não tratado quando a vencedora
        // for uma sessão 'expirada' que ainda não foi fechada.
        const winningSession = await this.sessionRepo.findOne({
          where: { tableId: table.id, status: Not('fechada') },
          relations: { table: true },
          order: { openedAt: 'DESC' },
        });
        if (winningSession) {
          if (customerId) await this.markPresent(winningSession.id, customerId);
          return winningSession;
        }
      }
      throw err;
    }
  }

  // Consulta SÓ LEITURA — nunca cria sessão nova. Bug real que isso
  // corrige: antes, a única forma de saber "essa mesa tem sessão aberta?"
  // era `openOrJoinSession`, que CRIA uma sessão nova silenciosamente
  // quando não encontra nenhuma. Isso rodava toda vez que o frontend só
  // CARREGAVA a página da mesa (efeito de montagem de componente) — uma
  // aba esquecida aberta, um refresh, o histórico do navegador, qualquer
  // coisa que recarregasse a URL depois da conta já ter sido paga reabria
  // a mesa sozinha, sem ninguém escanear nada de verdade. Agora, entrar
  // numa mesa de fato (criar/juntar sessão) só acontece por uma ação
  // explícita do cliente — ver joinSession no controller.
  // Pedido do Felipe (13/09, sessão F): eliminar de vez qualquer decisão
  // de "abrir sozinho" baseada em memória do navegador (localStorage
  // sobrevive até ser limpo manualmente — ele quer que nem isso "salve"
  // uma aba velha). A distinção que importa não é "esse dispositivo já
  // visitou essa mesa" (client-side, frágil) e sim "essa mesa JÁ TEVE
  // alguma sessão antes" (server-side, sobrevive a qualquer coisa do
  // lado do cliente): uma mesa nunca usada pode entrar direto sem
  // fricção nenhuma; uma mesa que já teve sessão e está sem nenhuma
  // ativa agora NUNCA cria uma nova sozinha — precisa de uma ação
  // explícita do cliente (ver `scanTableQrCode`/`openOrJoinSession`,
  // continuam exigindo uma chamada de verdade; o que muda é só o
  // frontend não chamar isso automaticamente mais nesse caso).
  // Pedido do Felipe (14/09, sessão H): duas exigências que parecem se
  // contradizer na mesma ação (dar refresh na página) até a gente separar
  // por QUANDO isso aconteceu:
  //   - Fechar a conta e dar refresh no MESMO instante não pode reabrir
  //     nada nem perguntar nada — só "sessão encerrada, voltar pro
  //     cardápio".
  //   - Escanear uma mesa que ninguém está usando (de verdade, sem
  //     ninguém por perto há um tempo) não pode mostrar NENHUMA tela a
  //     mais — direto pro pedido, sem perguntar nada, sem tela de "mesa
  //     livre, toque aqui".
  // As duas situações batem no MESMO endpoint com o MESMO token — não dá
  // pra saber pelo lado do cliente qual das duas é (um refresh e um scan
  // novo são tecnicamente idênticos pro navegador). A única forma
  // honesta de separar isso é por TEMPO, do lado do servidor: se a
  // última sessão dessa mesa fechou há poucos minutos, trata como "acabei
  // de fechar, não deixa reabrir sozinho". Se já fechou há mais tempo (ou
  // nunca existiu), trata como mesa realmente livre agora — entra direto.
  private static readonly RECENTLY_ENDED_WINDOW_MINUTES = 2;

  async getTableInfo(qrCodeToken: string): Promise<{ locationId: string }> {
    const table = await this.tableRepo.findOne({ where: { qrCodeToken, isActive: true } });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada ou QR code inválido.');
    }
    return { locationId: table.locationId };
  }

  async getCurrentSession(
    qrCodeToken: string,
  ): Promise<{ session: TableSession | null; recentlyEnded: boolean }> {
    const table = await this.tableRepo.findOne({ where: { qrCodeToken, isActive: true } });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada ou QR code inválido.');
    }
    const session = await this.sessionRepo.findOne({
      where: [
        { tableId: table.id, status: 'aberta' },
        { tableId: table.id, status: 'fechamento_solicitado' },
      ],
      relations: { table: true },
      order: { openedAt: 'DESC' },
    });
    if (session) {
      const expired = await this.expireIfStale(session);
      if (!expired) return { session, recentlyEnded: false };
    }
    const cutoff = new Date(
      Date.now() - TablesService.RECENTLY_ENDED_WINDOW_MINUTES * 60_000,
    );
    // Sessão encerrada à força pelo admin ("corrigir sessão") NÃO conta
    // como "recém-encerrada": a trava de poucos minutos existe pra
    // impedir que o cliente que ACABOU DE FECHAR a conta reabra a mesa
    // sozinho, e o encerramento forçado é o oposto — o admin, com motivo
    // escrito e auditado, está justamente liberando a mesa pro próximo
    // QR code (ver forceResetSession).
    const recentlyEnded = await this.sessionRepo.exists({
      where: { tableId: table.id, closedAt: MoreThan(cutoff), forceClosedReason: IsNull() },
    });
    return { session: null, recentlyEnded };
  }

  // Devolve `true` se a sessão FOI expirada agora (chamador deve tratar
  // como "não existe mais"). Só expira quando: status ainda é 'aberta'
  // (nunca expira 'fechamento_solicitado' — cliente já está ativamente
  // fechando a conta, não faz sentido cortar isso no meio), o tenant tem
  // um prazo configurado, o prazo já passou, E — o mais importante —
  // NENHUM pedido foi feito nessa sessão ainda. Um único pedido já
  // confirmado cancela o prazo pra sempre nessa sessão, não importa
  // quanto tempo passe depois.
  private async expireIfStale(session: TableSession): Promise<boolean> {
    if (session.status !== 'aberta') return false;

    const tenant = await this.tableRepo.manager
      .getRepository(Tenant)
      .findOne({ where: { id: session.tenantId }, select: { tableSessionTimeoutMinutes: true } });
    const timeoutMinutes = tenant?.tableSessionTimeoutMinutes;
    if (!timeoutMinutes) return false;

    const deadline = new Date(session.openedAt.getTime() + timeoutMinutes * 60_000);
    if (new Date() < deadline) return false;

    const hasOrder = await this.orderRepo.exists({ where: { tableSessionId: session.id } });
    if (hasOrder) return false;

    session.status = 'expirada';
    session.closedAt = new Date();
    await this.sessionRepo.save(session);
    return true;
  }

  // Pedido do Felipe (19/09): reflexo em tempo real no painel do admin
  // do prazo estourado, mesmo que o cliente feche o app/navegador ou
  // deixe em segundo plano — o painel não pode depender do celular do
  // cliente estar aberto pra saber que a mesa expirou. Reduzido de 5
  // minutos pra 1 minuto (o menor intervalo que ainda é razoável sem
  // sobrecarregar o banco). IMPORTANTE: isso só roda enquanto o
  // processo do backend estiver de pé — no plano grátis do Render, o
  // serviço "dorme" depois de um tempo sem nenhuma requisição chegando,
  // e um cron job NÃO roda com o processo dormindo. Pra esse cenário
  // (ninguém — nem cliente nem admin — acessa o app por muitos minutos
  // seguidos) funcionar de ponta a ponta de verdade, ainda falta manter
  // o servidor acordado por fora (ex: um serviço grátis tipo UptimeRobot
  // pingando a cada poucos minutos) ou fazer upgrade do plano — nenhuma
  // mudança só de código resolve isso sozinha enquanto o processo
  // simplesmente não está rodando.
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepExpiredSessions(): Promise<void> {
    const openSessions = await this.sessionRepo.find({
      where: { status: 'aberta', closedAt: IsNull() },
    });
    for (const session of openSessions) {
      await this.expireIfStale(session);
    }
  }

  async findSession(tenantId: string, sessionId: string): Promise<TableSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Sessão de mesa não encontrada.');
    }
    return session;
  }

  // Igual acima, mas devolve null em vez de lançar — usado pelo webhook
  // do Mercado Pago (OrdersService.handleMercadoPagoWebhook), que nunca
  // pode estourar erro pro Mercado Pago só porque a referência não bateu
  // com nenhuma sessão (webhook malformado ou sessão já removida).
  async findSessionOrNull(tenantId: string, sessionId: string): Promise<TableSession | null> {
    return this.sessionRepo.findOne({ where: { id: sessionId, tenantId } });
  }

  // "Minha Conta": todos os pedidos feitos nessa sessão + total acumulado.
  async getSessionSummary(tenantId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
      relations: { table: true },
    });
    if (!session) {
      throw new NotFoundException('Sessão de mesa não encontrada.');
    }

    // `customer: true` traz nome/avatar de quem fez CADA pedido — pedido
    // do Felipe (14/09): numa mesa compartilhada, o cupom precisa
    // mostrar de quem foi cada pedido, não só um nome único pra sessão
    // inteira. Mesmo `select` restrito de `OrdersService.findAllForAdmin`
    // pra nunca vazar campo sensível (senha etc.) do cliente.
    const orders = await this.orderRepo.find({
      where: { tableSessionId: session.id },
      order: { createdAt: 'ASC' },
      relations: { items: true, customer: true } as any,
      select: {
        customer: { id: true, name: true, avatarUrl: true },
      } as any,
    });

    // BUG CORRIGIDO: pedidos cancelados estavam entrando na soma do total.
    // Continuam aparecendo na lista (transparência pro cliente/garçom ver
    // que foi cancelado), mas não contam pra conta final.
    const totalCents = orders
      .filter((order) => order.status !== 'cancelado')
      .reduce((sum, order) => sum + toCents(order.total), 0);
    const total = fromCents(totalCents);
    const tipAmount = Number(session.tipAmount) || 0;
    const totalPlusTipCents = totalCents + toCents(tipAmount);

    // Preview de cashback (pedido do Felipe, 28/09): quando a sessão já
    // foi fechada, usa o valor REAL debitado (session.cashbackUsed,
    // congelado pra sempre); enquanto ainda está aberta/aguardando
    // fechamento, recalcula ao vivo contra o saldo atual do cliente —
    // ver previewCashbackCents.
    const { availableCents: cashbackAvailableCents, appliedCents: cashbackPreviewCents } = session.closedAt
      ? { availableCents: toCents(Number(session.cashbackUsed) || 0), appliedCents: toCents(Number(session.cashbackUsed) || 0) }
      : await this.previewCashbackCents(tenantId, session, totalPlusTipCents);
    const grandTotal = fromCents(Math.max(0, totalPlusTipCents - cashbackPreviewCents));

    // Nome do cliente pro cupito: pega o primeiro nome preenchido entre os
    // pedidos da sessão (geralmente é o mesmo em todos, se preenchido).
    // Mantido por compatibilidade com quem já lê esse campo — o cupom
    // agora usa `participants` (abaixo) pra mostrar todo mundo que
    // passou pela mesa, não só um nome.
    const customerName = orders.find((o) => o.customerName)?.customerName ?? null;

    // Pedido do Felipe (14/09, sessão I): o cupom (tanto via do cliente
    // quanto via do restaurante) precisa mostrar quem esteve na mesa —
    // todo mundo que confirmou entrar (não só quem pediu), com destaque
    // pra quem abriu. Mesma fonte de verdade usada no painel
    // (`TableSessionParticipant`), resolvida só pra essa sessão.
    const activeParticipants = await this.participantRepo.find({
      where: { tableSessionId: session.id, leftAt: IsNull() },
      order: { joinedAt: 'ASC' },
    });
    const participantCustomerIds = new Set(activeParticipants.map((p) => p.customerId));
    if (session.openedByCustomerId) participantCustomerIds.add(session.openedByCustomerId);
    const participantCustomers =
      participantCustomerIds.size > 0
        ? await this.orderRepo.manager
            .getRepository(Customer)
            .find({ where: { id: In([...participantCustomerIds]) } })
        : [];
    const participantById = new Map(participantCustomers.map((c) => [c.id, c]));
    const participants: Array<{ name: string; avatarUrl: string | null; isOpener: boolean }> = [];
    for (const p of activeParticipants) {
      const account = participantById.get(p.customerId);
      if (account) {
        participants.push({
          name: account.name,
          avatarUrl: account.avatarUrl ?? null,
          isOpener: p.customerId === session.openedByCustomerId,
        });
      }
    }
    // Fallback pra sessões de antes da migration de participantes.
    if (participants.length === 0 && session.openedByCustomerId) {
      const account = participantById.get(session.openedByCustomerId);
      if (account) {
        participants.push({ name: account.name, avatarUrl: account.avatarUrl ?? null, isOpener: true });
      }
    }

    // Código de autenticidade — só existe DEPOIS que a mesa fecha de
    // verdade (closedAt preenchido), porque antes disso o total ainda
    // pode mudar (mais pedidos podem entrar) e assinar um valor que
    // ainda vai mudar não faria sentido. Assina a SESSÃO inteira (não
    // cada pedido separado), já que o cupom de mesa mostra um total
    // combinado de vários pedidos + gorjeta — ver
    // OrdersService.attachReceiptCode pro equivalente de pedido avulso.
    const receiptVerificationCode = session.closedAt
      ? formatVerificationCode(
          session.id,
          signReceipt(session.id, tenantId, toCents(grandTotal), session.closedAt.toISOString()),
        )
      : null;

    return {
      session,
      orders,
      total,
      tipAmount,
      grandTotal,
      customerName,
      participants,
      receiptVerificationCode,
      // Saldo de cashback disponível pro cliente que pediu pra usar (0
      // se ninguém pediu, ou se pediu como convidado). `cashbackApplied`
      // é o que efetivamente abate do total — já refletido em
      // `grandTotal` acima.
      cashbackAvailable: fromCents(cashbackAvailableCents),
      cashbackApplied: fromCents(cashbackPreviewCents),
    };
  }

  // Painel admin: confere um código de autenticidade de cupom de MESA
  // (fechamento de sessão) — mesmo princípio do
  // OrdersService.verifyReceiptCode, só que assinando a SESSÃO inteira
  // em vez de um pedido avulso. Sempre recalcula a partir dos dados
  // ATUAIS da sessão no banco.
  async verifySessionReceiptCode(
    tenantId: string,
    code: string,
  ): Promise<{ valid: boolean; session: TableSession | null; grandTotal: number | null }> {
    const parsed = parseVerificationCode(code);
    if (!parsed) return { valid: false, session: null, grandTotal: null };

    const session = await this.sessionRepo.findOne({
      where: { id: parsed.orderId, tenantId },
      relations: { table: true },
    });
    if (!session || !session.closedAt) return { valid: false, session: null, grandTotal: null };

    const orders = await this.orderRepo.find({ where: { tableSessionId: session.id } });
    const totalCents = orders
      .filter((o) => o.status !== 'cancelado')
      .reduce((sum, o) => sum + toCents(o.total), 0);
    // Mesma fórmula usada pra ASSINAR o cupom em getSessionSummary/
    // closeSession: total dos itens + gorjeta - cashback REALMENTE
    // debitado (session.cashbackUsed, congelado desde o fechamento).
    // Sem subtrair isto aqui, todo cupom de mesa que usou cashback
    // falhava na verificação — o valor assinado nunca batia.
    const grandTotalCents = Math.max(
      0,
      totalCents + toCents(Number(session.tipAmount) || 0) - toCents(Number(session.cashbackUsed) || 0),
    );

    const valid = verifyReceiptSignature(
      session.id,
      tenantId,
      grandTotalCents,
      session.closedAt.toISOString(),
      parsed.signature,
    );
    return {
      valid,
      session: valid ? session : null,
      grandTotal: valid ? fromCents(grandTotalCents) : null,
    };
  }

  // Reforma do fechamento (pedido do Felipe, 28/09): o CLIENTE escolhe
  // forma de pagamento já aqui — nunca mais o admin decidindo tudo
  // sozinho sem nenhum sinal de quem ia pagar. 'cashback' como
  // paymentMethod é uma escolha EXPLÍCITA (o cliente viu que cobria
  // 100% e apertou "pagar com cashback"), nunca inferida sozinha.
  // Quando é Pix de verdade (Mercado Pago configurado) e sobra algo a
  // pagar, já cria a cobrança aqui — o cliente sai dessa tela vendo o QR.
  async requestClosing(
    tenantId: string,
    sessionId: string,
    dto: {
      tipAmount?: number;
      paymentMethod: string;
      useCashback?: boolean;
      cashDeliveryPreference?: string;
      cashbackSplitMode?: string;
    },
    customerId: string | null,
  ): Promise<TableSession> {
    const session = await this.findSession(tenantId, sessionId);
    // Aceita reenviar mesmo já estando em 'fechamento_solicitado' —
    // necessário pra permitir tentar de novo depois de um Pix que
    // expirou ou falhou (ver checkSessionPixStatus), sem precisar
    // voltar pra 'aberta' primeiro. Só recusa se já fechou de verdade.
    if (session.status === 'fechada') {
      throw new BadRequestException('Esta sessão já foi fechada.');
    }
    if (dto.paymentMethod === 'dinheiro' && !dto.cashDeliveryPreference) {
      throw new BadRequestException(
        'Escolha se prefere pagar no balcão ou se um atendente vai até a mesa.',
      );
    }
    // Convidado sem login nunca tem carteira — ignora silenciosamente em
    // vez de dar erro (não é uma escolha inválida, só não se aplica).
    const useCashback = Boolean(dto.useCashback && customerId);

    session.tipAmount = dto.tipAmount && dto.tipAmount > 0 ? dto.tipAmount : 0;
    session.cashbackRequestedByCustomerId = useCashback ? customerId : null;
    // SEMPRE grava quem está fechando (independente de usar cashback ou
    // não) — é o alvo do cashback GANHO quando cashbackSplitMode =
    // 'pagador', ver creditCashbackForClosedSession.
    session.closingRequestedByCustomerId = customerId;

    // 'cashback' como forma de pagamento só é aceito se realmente cobrir
    // tudo — nunca aceita a palavra do cliente sem reconferir contra o
    // saldo AO VIVO (a mesma checagem que closeSession faz de novo,
    // depois, antes de debitar de verdade).
    const totalCents = await this.calculateSessionTotalCents(tenantId, sessionId);
    const totalPlusTipCents = totalCents + toCents(session.tipAmount);
    if (dto.paymentMethod === 'cashback') {
      if (!useCashback) {
        throw new BadRequestException('Ative "usar meu cashback" pra pagar só com ele.');
      }
      const { appliedCents } = await this.previewCashbackCents(tenantId, session, totalPlusTipCents);
      if (appliedCents < totalPlusTipCents) {
        throw new BadRequestException('Seu saldo de cashback não cobre o total da conta.');
      }
    }

    // Divisão do cashback GANHO só faz sentido com mais de um cliente
    // distinto pedindo algo — com uma pessoa só, ignora silenciosamente
    // (não é erro, só não se aplica) em vez de recusar a requisição.
    if (dto.cashbackSplitMode) {
      const distinctCustomers = await this.orderRepo
        .createQueryBuilder('o')
        .select('DISTINCT o.customer_id', 'customerId')
        .where('o.table_session_id = :sessionId', { sessionId })
        .andWhere('o.status != :cancelado', { cancelado: 'cancelado' })
        .andWhere('o.customer_id IS NOT NULL')
        .getRawMany<{ customerId: string }>();
      session.cashbackSplitMode =
        distinctCustomers.length > 1 && customerId ? dto.cashbackSplitMode : null;
    } else {
      session.cashbackSplitMode = null;
    }

    // Cobrança Pix antiga (se houver) fica órfã a partir daqui — cancela
    // no Mercado Pago antes de decidir o que vem a seguir (best-effort,
    // nunca bloqueia o fechamento; ver MercadoPagoService.cancelPayment).
    // Evita o cliente conseguir pagar por engano um QR que ele mesmo já
    // abandonou ao mudar de forma de pagamento.
    if (session.mpPaymentId && session.paymentStatus === 'pendente') {
      const tenantForCancel = await this.orderRepo.manager
        .getRepository(Tenant)
        .findOne({ where: { id: tenantId } });
      if (tenantForCancel?.mercadoPagoAccessTokenEncrypted) {
        await this.mercadoPagoService.cancelPayment(
          decryptSecret(tenantForCancel.mercadoPagoAccessTokenEncrypted),
          session.mpPaymentId,
        );
      }
    }

    if (dto.paymentMethod === 'pix' || dto.paymentMethod === 'cashback') {
      session.requestedPaymentMethod = dto.paymentMethod;
      session.cashDeliveryPreference = null;
    } else {
      session.requestedPaymentMethod = dto.paymentMethod;
      session.cashDeliveryPreference = dto.paymentMethod === 'dinheiro' ? dto.cashDeliveryPreference! : null;
    }

    // Pix de VERDADE (Mercado Pago) — só quando sobra algo a pagar de
    // fato depois do cashback (senão não existe cobrança nenhuma a
    // criar: é o caso 'cashback' acima). Sem Mercado Pago configurado
    // no tenant, Pix de mesa continua sendo só a intenção combinada em
    // pessoa — comportamento de sempre, nada muda.
    if (dto.paymentMethod === 'pix') {
      const { appliedCents } = await this.previewCashbackCents(tenantId, session, totalPlusTipCents);
      const remainingCents = totalPlusTipCents - appliedCents;
      const tenant = await this.orderRepo.manager
        .getRepository(Tenant)
        .findOne({ where: { id: tenantId } });
      if (remainingCents > 0 && tenant?.mercadoPagoAccessTokenEncrypted) {
        const customer = customerId
          ? await this.orderRepo.manager.getRepository(Customer).findOne({ where: { id: customerId } })
          : null;
        const pixExpiresAt = new Date(Date.now() + TABLE_PIX_PAYMENT_WINDOW_MS);
        const publicUrl = process.env.API_PUBLIC_URL;
        const payment = await this.mercadoPagoService.createPixPayment({
          accessToken: decryptSecret(tenant.mercadoPagoAccessTokenEncrypted),
          amount: fromCents(remainingCents),
          description: `Conta - Mesa ${session.tableId} - ${tenant.name}`,
          payerEmail: customer?.email ?? `mesa-${session.id}@guest.cardapiosaas.com`,
          // Prefixo "mesa:" distingue de um externalReference de PEDIDO
          // (que é só o id cru) no dispatch do webhook — ver
          // OrdersService.handleMercadoPagoWebhook.
          externalReference: `mesa:${session.id}`,
          // Único por TENTATIVA (nunca só por sessão) — ver o comentário
          // em CreatePixPaymentParams.idempotencyKey sobre o bug que
          // isso evita.
          idempotencyKey: `mesa:${session.id}:${Date.now()}`,
          expiresAt: pixExpiresAt,
          notificationUrl: publicUrl
            ? `${publicUrl}/orders/public/${tenantId}/webhook/mercadopago`
            : undefined,
        });
        session.mpPaymentId = payment.id;
        session.pixPayload = payment.qrCode;
        session.pixExpiresAt = pixExpiresAt;
        session.paymentStatus = 'pendente';
      } else {
        // Sem gateway configurado (ou cashback já cobre o resto, caso
        // raro de corrida) — limpa qualquer cobrança antiga de uma
        // tentativa anterior desta mesma sessão.
        session.mpPaymentId = null;
        session.pixPayload = null;
        session.pixExpiresAt = null;
        session.paymentStatus = null;
      }
    } else {
      session.mpPaymentId = null;
      session.pixPayload = null;
      session.pixExpiresAt = null;
      session.paymentStatus = null;
    }

    session.status = 'fechamento_solicitado';
    return this.sessionRepo.save(session);
  }

  // Total dos itens da mesa (pedidos não cancelados), em centavos — a
  // mesma soma usada por getSessionSummary, extraída aqui pra poder ser
  // calculada ANTES de montar o resumo completo (requestClosing precisa
  // só disso pra decidir a cobrança Pix).
  private async calculateSessionTotalCents(tenantId: string, sessionId: string): Promise<number> {
    const orders = await this.orderRepo.find({
      where: { tableSessionId: sessionId, tenantId, status: Not('cancelado') },
    });
    return orders.reduce((sum, o) => sum + toCents(o.total), 0);
  }

  // Quanto de cashback SERIA aplicado agora, se a conta fosse fechada
  // neste exato instante — sempre recalculado contra o saldo ao vivo do
  // cliente (nunca um valor congelado). Usado tanto pra montar o
  // preview em getSessionSummary (cliente e admin veem o mesmo número)
  // quanto pelo valor de verdade debitado em closeSession.
  private async previewCashbackCents(
    tenantId: string,
    session: TableSession,
    totalPlusTipCents: number,
  ): Promise<{ availableCents: number; appliedCents: number }> {
    if (!session.cashbackRequestedByCustomerId) return { availableCents: 0, appliedCents: 0 };
    const balance = await this.cashbackService.getBalance(
      tenantId,
      session.cashbackRequestedByCustomerId,
    );
    const availableCents = toCents(balance);
    return { availableCents, appliedCents: Math.min(availableCents, totalPlusTipCents) };
  }

  // Lista mesas aguardando o garçom confirmar o fechamento — usado pelo
  // painel admin pra saber quais mesas precisam de atenção pra fechar a conta.
  async findSessionsAwaitingClosing(tenantId: string): Promise<TableSession[]> {
    return this.sessionRepo.find({
      where: { tenantId, status: 'fechamento_solicitado' },
      relations: { table: true },
      order: { openedAt: 'ASC' },
    });
  }

  // Visão geral pro garçom: toda mesa com sessão em andamento, tempo desde
  // a abertura e total acumulado. Não impede fraude sozinho, mas dá
  // visibilidade imediata de qualquer mesa "ativa" que ninguém devia estar
  // usando — o garçom vê na hora, não só quando for fechar a conta.
  async findActiveOverview(tenantId: string) {
    const sessions = await this.sessionRepo.find({
      where: [
        { tenantId, status: 'aberta' },
        { tenantId, status: 'fechamento_solicitado' },
      ],
      relations: { table: true },
      order: { openedAt: 'ASC' },
    });

    const overview: Array<{
      table: RestaurantTable;
      session: TableSession;
      total: number;
      openedAt: Date;
      customers: Array<{
        name: string;
        avatarUrl: string | null;
        hasAccount: boolean;
        isVerified: boolean;
        isOpener: boolean;
      }>;
      waiterCallCount: number;
    }> = [];

    // Busca os clientes de conta (com foto/nome oficiais do perfil) de
    // TODAS as mesas de uma vez, em vez de uma query por mesa — o
    // painel do garçom pode ter várias mesas abertas ao mesmo tempo.
    const sessionOrdersMap = new Map<string, Order[]>();
    const accountCustomerIds = new Set<string>();
    for (const session of sessions) {
      const orders = await this.orderRepo.find({ where: { tableSessionId: session.id } });
      sessionOrdersMap.set(session.id, orders);
      for (const order of orders) {
        if (order.status !== 'cancelado' && order.customerId) {
          accountCustomerIds.add(order.customerId);
        }
      }
      // BUG CORRIGIDO: só entrava no set de IDs pra buscar quem tinha
      // colocado PEDIDO — uma mesa recém-aberta por um cliente logado
      // (via QR, antes de pedir qualquer coisa) não tinha esse ID
      // buscado aqui, então ficava sem nome/foto no painel até o
      // primeiro pedido sair, mesmo a conta já estando identificada.
      if (session.openedByCustomerId) {
        accountCustomerIds.add(session.openedByCustomerId);
      }
    }

    // Pedido do Felipe (14/09, sessão I): quem confirma entrar numa mesa
    // aparece no painel NA HORA, não só depois de pedir — busca todos os
    // participantes ainda presentes (leftAt nulo) de todas as sessões de
    // uma vez, mesmo raciocínio de bulk-fetch acima.
    const activeParticipants =
      sessions.length > 0
        ? await this.participantRepo.find({
            where: { tableSessionId: In(sessions.map((s) => s.id)), leftAt: IsNull() },
            order: { joinedAt: 'ASC' },
          })
        : [];
    const participantsBySession = new Map<string, TableSessionParticipant[]>();
    for (const p of activeParticipants) {
      accountCustomerIds.add(p.customerId);
      const list = participantsBySession.get(p.tableSessionId) ?? [];
      list.push(p);
      participantsBySession.set(p.tableSessionId, list);
    }

    const accountCustomers =
      accountCustomerIds.size > 0
        ? await this.orderRepo.manager
            .getRepository(Customer)
            .find({ where: { id: In([...accountCustomerIds]) } })
        : [];
    const accountCustomerById = new Map(accountCustomers.map((c) => [c.id, c]));

    // Quantas vezes o garçom foi chamado NESSA sessão em aberto — conta
    // TODAS as chamadas já feitas (atendidas, canceladas ou pendentes),
    // não só a pendente atual, porque o pedido do Felipe é "quantas
    // vezes o cliente chamou", não "quantas ainda faltam atender". Zera
    // sozinho porque é por `tableSessionId` — assim que a mesa fecha e
    // uma sessão NOVA é aberta depois, o contador começa do zero de
    // novo.
    const waiterCallCounts =
      sessions.length > 0
        ? await this.waiterCallRepo
            .createQueryBuilder('call')
            .select('call.table_session_id', 'sessionId')
            .addSelect('COUNT(*)', 'count')
            .where('call.table_session_id IN (:...ids)', { ids: sessions.map((s) => s.id) })
            .groupBy('call.table_session_id')
            .getRawMany<{ sessionId: string; count: string }>()
        : [];
    const waiterCallCountBySession = new Map(
      waiterCallCounts.map((row) => [row.sessionId, Number(row.count)]),
    );

    // Avatares predefinidos são gravados como CAMINHO RELATIVO (ex:
    // "/avatars/male-3.svg") — resolvido pelo próprio frontend-cardapio,
    // que serve esses arquivos na raiz dele. Isso funciona certo dentro
    // do app do cliente, mas quebra silenciosamente aqui: o painel admin
    // é um domínio DIFERENTE, então um `<img>` com esse caminho relativo
    // tentava carregar do domínio do ADMIN, onde o arquivo não existe —
    // por isso o avatar não aparecia. Fotos enviadas de verdade (upload
    // no Supabase) já são absolutas e não passam por aqui.
    const customerAppUrl = (process.env.CUSTOMER_APP_URL ?? '').replace(/\/$/, '');
    function resolveAvatarUrl(avatarUrl: string | null): string | null {
      if (!avatarUrl) return null;
      if (!avatarUrl.startsWith('/')) return avatarUrl;
      return customerAppUrl ? `${customerAppUrl}${avatarUrl}` : null;
    }

    for (const session of sessions) {
      const orders = sessionOrdersMap.get(session.id) ?? [];
      const totalCents = orders
        .filter((o) => o.status !== 'cancelado')
        .reduce((sum, o) => sum + toCents(o.total), 0);

      // Identifica quem está na mesa a partir dos próprios pedidos —
      // com conta, usa nome/foto ATUAIS do perfil (não o que ficou
      // gravado no pedido, que pode ficar desatualizado se a pessoa
      // trocar de nome/foto depois); sem conta, usa o nome digitado no
      // checkout (agora obrigatório).
      //
      // BUG CORRIGIDO: o mesmo cliente podia aparecer DUAS vezes — uma
      // vez com o nome digitado no primeiro pedido (ainda sem login) e
      // outra com o nome da conta, depois de logar no meio da mesma
      // visita. Deduplica por NOME (comparando sem diferença de
      // maiúsculas/espaço) através das duas categorias, não só dentro
      // de cada uma — e sempre que uma entrada de CONTA aparece pra um
      // nome que já tinha entrado como convidado, ela SUBSTITUI a
      // anterior (nunca o contrário — convidado nunca rebaixa conta).
      //
      // `isVerified` é o selo de verdade (sistema de Cliente
      // Verificado — foto + aprovação do admin), bem diferente de
      // `hasAccount` (só significa "estava logado ao pedir"). NUNCA usa
      // hasAccount como substituto de verificação real.
      const customers: Array<{
        name: string;
        avatarUrl: string | null;
        hasAccount: boolean;
        isVerified: boolean;
        isOpener: boolean;
      }> = [];
      function upsertCustomer(entry: {
        name: string;
        avatarUrl: string | null;
        hasAccount: boolean;
        isVerified: boolean;
        isOpener: boolean;
      }) {
        const key = entry.name.trim().toLowerCase();
        const idx = customers.findIndex((c) => c.name.trim().toLowerCase() === key);
        if (idx === -1) {
          customers.push(entry);
        } else if (entry.hasAccount && !customers[idx].hasAccount) {
          // Nunca perde o selo de "abriu a mesa" numa fusão — se a
          // entrada que já estava lá era a que abriu, mantém isso
          // mesmo trocando o resto dos dados por uma versão mais
          // completa (ex: convidado que depois logou).
          customers[idx] = { ...entry, isOpener: entry.isOpener || customers[idx].isOpener };
        } else if (entry.isOpener && !customers[idx].isOpener) {
          customers[idx] = { ...customers[idx], isOpener: true };
        }
      }
      // Pedido do Felipe (14/09, sessão I): todo participante ainda
      // presente (confirmou entrar e não saiu) aparece aqui, na ordem
      // em que entrou — ANTES do loop de pedidos, que só enriquece com
      // dados mais recentes ou adiciona convidados (sem conta, não têm
      // como estar em `participantsBySession`, que é só de clientes
      // logados). Substitui o antigo "só quem abriu a mesa" por "todos
      // os que confirmaram entrar", já que agora várias pessoas podem
      // se juntar à mesma mesa. `isOpener` marca especificamente quem
      // abriu a mesa (session.openedByCustomerId) — pedido do Felipe
      // pra distinguir visualmente no painel quem começou a conta.
      const participants = participantsBySession.get(session.id) ?? [];
      for (const participant of participants) {
        const account = accountCustomerById.get(participant.customerId);
        if (account) {
          upsertCustomer({
            name: account.name,
            avatarUrl: resolveAvatarUrl(account.avatarUrl ?? null),
            hasAccount: true,
            isVerified: this.verificationService.verifyIntegritySync(account),
            isOpener: participant.customerId === session.openedByCustomerId,
          });
        }
      }
      // Fallback pra sessões de antes dessa migration (sem nenhuma linha
      // em table_session_participants ainda) — continua mostrando quem
      // abriu a mesa mesmo sem registro de participante.
      if (participants.length === 0 && session.openedByCustomerId) {
        const account = accountCustomerById.get(session.openedByCustomerId);
        if (account) {
          upsertCustomer({
            name: account.name,
            avatarUrl: resolveAvatarUrl(account.avatarUrl ?? null),
            hasAccount: true,
            isVerified: this.verificationService.verifyIntegritySync(account),
            isOpener: true,
          });
        }
      }
      for (const order of orders) {
        if (order.status === 'cancelado') continue;
        if (order.customerId) {
          const account = accountCustomerById.get(order.customerId);
          upsertCustomer({
            name: account?.name ?? order.customerName ?? 'Cliente',
            avatarUrl: resolveAvatarUrl(account?.avatarUrl ?? null),
            hasAccount: true,
            isVerified: account ? this.verificationService.verifyIntegritySync(account) : false,
            isOpener: order.customerId === session.openedByCustomerId,
          });
        } else if (order.customerName) {
          upsertCustomer({
            name: order.customerName,
            avatarUrl: null,
            hasAccount: false,
            isVerified: false,
            isOpener: false,
          });
        }
      }

      overview.push({
        table: session.table,
        session,
        total: fromCents(totalCents),
        openedAt: session.openedAt,
        customers,
        waiterCallCount: waiterCallCountBySession.get(session.id) ?? 0,
      });
    }
    return overview;
  }

  // Endpoint público que o app do cliente fica consultando a cada poucos
  // segundos enquanto mostra o QR do Pix da MESA — mesmo padrão de
  // OrdersService.checkPixStatus. Confirma automaticamente (fecha a
  // sessão de verdade) assim que o Mercado Pago disser que aprovou, sem
  // precisar do admin clicar em nada.
  async checkSessionPixStatus(
    tenantId: string,
    sessionId: string,
  ): Promise<{ status: string; paymentStatus: string | null; pixExpiresAt: Date | null }> {
    const session = await this.findSession(tenantId, sessionId);

    if (session.status === 'fechamento_solicitado' && session.mpPaymentId && session.paymentStatus === 'pendente') {
      const tenant = await this.orderRepo.manager
        .getRepository(Tenant)
        .findOne({ where: { id: tenantId } });
      if (tenant?.mercadoPagoAccessTokenEncrypted) {
        try {
          const { status } = await this.mercadoPagoService.getPaymentStatus(
            decryptSecret(tenant.mercadoPagoAccessTokenEncrypted),
            session.mpPaymentId,
          );
          await this.applyMercadoPagoStatusToSession(tenantId, session, status);
        } catch {
          // Falha pontual na consulta ao Mercado Pago — não derruba a
          // tela do cliente por isso, só tenta de novo no próximo poll.
        }
      }
    }

    if (
      session.paymentStatus === 'pendente' &&
      session.pixExpiresAt &&
      session.pixExpiresAt.getTime() < Date.now()
    ) {
      // Expira só a COBRANÇA — a mesa continua em 'fechamento_solicitado'
      // (nunca volta sozinha pra 'aberta'), o cliente só perde o QR e
      // precisa escolher a forma de pagamento de novo.
      const expiredMpPaymentId = session.mpPaymentId;
      session.paymentStatus = 'falhou';
      session.requestedPaymentMethod = null;
      session.mpPaymentId = null;
      session.pixPayload = null;
      await this.sessionRepo.save(session);
      // O gateway aceita pagar por mais alguns minutos além do prazo do
      // app (mínimo de 30 min do Mercado Pago) — cancela pra não entrar
      // dinheiro que o sistema já esqueceu. Best-effort.
      if (expiredMpPaymentId) {
        try {
          const tenant = await this.orderRepo.manager
            .getRepository(Tenant)
            .findOne({ where: { id: tenantId } });
          if (tenant?.mercadoPagoAccessTokenEncrypted) {
            await this.mercadoPagoService.cancelPayment(
              decryptSecret(tenant.mercadoPagoAccessTokenEncrypted),
              expiredMpPaymentId,
            );
          }
        } catch {
          // Segue sem cancelar — o pior caso é o de antes.
        }
      }
    }

    return { status: session.status, paymentStatus: session.paymentStatus, pixExpiresAt: session.pixExpiresAt };
  }

  // Traduz o status do Mercado Pago pro fechamento de mesa — chamado
  // tanto pelo polling (checkSessionPixStatus) quanto pelo webhook (ver
  // OrdersService.handleMercadoPagoWebhook, que delega pra cá quando o
  // externalReference começa com "mesa:"). 'approved' fecha a conta de
  // verdade sozinho — mesma lógica de closeSession, sem precisar do
  // admin clicar em nada, igual iFood.
  async applyMercadoPagoStatusToSession(
    tenantId: string,
    session: TableSession,
    mpStatus: string,
  ): Promise<void> {
    if (session.status !== 'fechamento_solicitado' || session.paymentStatus !== 'pendente') return;

    if (mpStatus === 'approved') {
      // Trava atômica (28/09): o mesmo pagamento aprovado pode chegar
      // por DOIS caminhos quase ao mesmo tempo — o poll do cliente
      // (checkSessionPixStatus) e o webhook do Mercado Pago — e sem
      // isso os dois conseguiam passar pela checagem acima antes de
      // qualquer um salvar, executando closeSession (e o crédito de
      // cashback) DUAS vezes pro mesmo pagamento. O UPDATE...WHERE é
      // uma operação atômica no Postgres: só UM dos dois concorrentes
      // consegue affected=1; o outro vê 0 e desiste sem fazer nada.
      const result = await this.sessionRepo
        .createQueryBuilder()
        .update(TableSession)
        .set({ paymentStatus: 'pago' })
        .where('id = :id AND payment_status = :pending', { id: session.id, pending: 'pendente' })
        .execute();
      if ((result.affected ?? 0) === 0) return; // outro caminho já ganhou a corrida
      await this.closeSession(tenantId, session.id, 'pix');
    } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      // Não fecha nada — só limpa a cobrança falha pra o cliente poder
      // tentar de novo (outra forma de pagamento, ou gerar outro Pix).
      session.paymentStatus = 'falhou';
      session.requestedPaymentMethod = null;
      session.mpPaymentId = null;
      session.pixPayload = null;
      await this.sessionRepo.save(session);
    }
    // 'pending'/'in_process' — continua aguardando, nada muda.
  }

  // Usado pelo painel admin/garçom pra encerrar de fato a mesa, com o
  // pagamento já resolvido. Todo cálculo de troco é feito aqui, em
  // centavos, nunca confiando em nenhum valor pré-calculado do frontend.
  async closeSession(
    tenantId: string,
    sessionId: string,
    paymentMethod?: string,
    amountReceived?: number,
  ): Promise<TableSession> {
    // grandTotal aqui já vem com o PREVIEW de cashback abatido (ver
    // getSessionSummary) — mas preview não é débito de verdade ainda.
    const { session, total, tipAmount } = await this.getSessionSummary(tenantId, sessionId);

    // BUG CORRIGIDO: sem essa guarda, um duplo-clique em "Confirmar
    // fechamento" (ou o garçom reenviando a requisição após um refresh)
    // reprocessava o pagamento por cima do que já tinha sido registrado —
    // podendo sobrescrever paymentMethod/amountReceived/changeGiven de uma
    // conta que já tinha sido paga corretamente.
    if (session.status === 'fechada') {
      throw new BadRequestException('Esta conta já foi fechada anteriormente.');
    }

    const totalPlusTipCents = toCents(total) + toCents(tipAmount);

    // Débito de cashback DE VERDADE — só agora, dentro do fechamento que
    // não tem mais volta (comida já servida/consumida). `consumeForTableSession`
    // trava as linhas do ledger (`pessimistic_write`) e devolve o quanto
    // REALMENTE conseguiu consumir, nunca supondo que o preview de
    // getSessionSummary ainda é válido (o saldo pode ter mudado nesse
    // meio-tempo, ex: cliente gastou em outro pedido).
    let cashbackUsedCents = 0;
    if (session.cashbackRequestedByCustomerId) {
      const { appliedCents: previewCents } = await this.previewCashbackCents(
        tenantId,
        session,
        totalPlusTipCents,
      );
      if (previewCents > 0) {
        cashbackUsedCents = await this.cashbackService.consumeForTableSession(
          this.orderRepo.manager,
          tenantId,
          session.cashbackRequestedByCustomerId,
          session.id,
          previewCents,
        );
      }
    }

    const grandTotalCents = Math.max(0, totalPlusTipCents - cashbackUsedCents);
    const grandTotal = fromCents(grandTotalCents);

    let changeGiven: number | null = null;
    let resolvedPaymentMethod = paymentMethod ?? null;

    if (grandTotalCents === 0) {
      // Cashback cobriu a conta inteira — não existe forma de pagamento
      // pra escolher, o admin só confirma. Ignora qualquer paymentMethod
      // que tenha vindo do frontend nesse caso (a fonte da verdade é o
      // valor, não o que foi clicado).
      resolvedPaymentMethod = 'cashback';
    } else {
      if (!resolvedPaymentMethod || !['dinheiro', 'cartao', 'pix'].includes(resolvedPaymentMethod)) {
        throw new BadRequestException('Escolha a forma de pagamento pra fechar a conta.');
      }
      if (resolvedPaymentMethod === 'dinheiro') {
        if (amountReceived === undefined) {
          throw new BadRequestException(
            'Informe o valor recebido em dinheiro para calcular o troco.',
          );
        }
        const changeCents = toCents(amountReceived) - grandTotalCents;
        if (changeCents < 0) {
          throw new BadRequestException(
            'Valor recebido é menor que o total da conta (incluindo gorjeta e descontando o cashback usado).',
          );
        }
        changeGiven = fromCents(changeCents);
      }
    }

    session.status = 'fechada';
    session.closedAt = new Date();
    session.paymentMethod = resolvedPaymentMethod;
    session.amountReceived = resolvedPaymentMethod === 'dinheiro' ? amountReceived ?? null : null;
    session.changeGiven = changeGiven;
    session.cashbackUsed = fromCents(cashbackUsedCents);
    const savedSession = await this.sessionRepo.save(session);

    // BUG CORRIGIDO (v2): a versão anterior forçava QUALQUER pedido não
    // finalizado (pendente/preparando/pronto) direto pra 'entregue' ao
    // fechar a conta. Isso fazia um pedido feito segundos antes de o
    // garçom confirmar o pagamento — que a cozinha nem chegou a ver —
    // sumir da fila de "Pedidos ativos" sem nunca ter sido preparado de
    // fato, mesmo o valor dele já entrando corretamente na conta paga
    // (grandTotal é sempre recalculado fresco no início desta função).
    // Agora só 'pronto' (comida já pronta, só esperando ser servida/levada)
    // é finalizado automaticamente. 'pendente'/'preparando' continuam
    // visíveis pra cozinha terminar, ainda que a sessão já esteja fechada.
    await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ status: 'entregue' })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status = :readyStatus', { readyStatus: 'pronto' })
      .execute();

    // Cashback: cada pedido da mesa gera seu próprio crédito, calculado
    // sobre o valor dos itens já líquido de promoção — mesma base usada
    // em OrdersService.creditCashbackForPaidOrder. Diferente de
    // balcão/entrega (onde o crédito acontece no instante em que CADA
    // pedido é pago), aqui quem "paga" é a SESSÃO inteira de uma vez só,
    // então o ganho só acontece agora, ao fechar a conta — nunca antes,
    // pra não creditar cashback de um pedido que ainda pudesse ser
    // cancelado antes do fechamento. Pedidos cancelados e pedidos sem
    // cliente logado (convidado, sem carteira) são pulados.
    const sessionOrders = await this.orderRepo.find({ where: { tableSessionId: sessionId, tenantId } });
    const tenantForNotify = await this.orderRepo.manager
      .getRepository(Tenant)
      .findOne({ where: { id: tenantId }, select: { slug: true, logoUrl: true } });

    // BUG CORRIGIDO: antes, cada PEDIDO da sessão disparava 3
    // notificações (avaliação + pagamento + cashback) na hora — uma
    // mesa com 3 pedidos virava 9 notificações de uma vez só (e
    // multiplicado de novo por cada navegador/dispositivo em que o
    // cliente tem push cadastrado). Agora o crédito de cashback
    // continua acontecendo POR PEDIDO (cada um precisa do próprio
    // registro de auditoria), mas a notificação é consolidada: no
    // máximo 3 avisos por CLIENTE ao fim de toda a mesa, cobrindo o
    // total de todos os pedidos dele nessa sessão — não um por pedido.
    //
    // Dois mapas SEPARADOS (pedido do Felipe, 28/09 — divisão de
    // cashback): "pagamento confirmado" é sempre sobre o total do
    // PRÓPRIO pedido de quem pediu; "você ganhou cashback" é sobre quem
    // de fato RECEBEU o crédito — os dois só coincidem quando
    // cashbackSplitMode não é 'pagador' (o caso de sempre).
    const paymentByOrderer = new Map<string, number>();
    const cashbackByRecipient = new Map<string, number>();
    const lastOrderIdByOrderer = new Map<string, string>();

    for (const order of sessionOrders) {
      if (order.status === 'cancelado' || !order.customerId) continue;
      // Trava definitiva já aqui, ANTES do `continue` de elegibilidade
      // abaixo — mesmo um pedido que não gera cashback (ex: muito
      // pequeno) pode ter USADO cashback, e a sessão fechando é o ponto
      // sem volta pra ele também (comida já servida). Sempre salva,
      // mesmo quando não há crédito a dar.
      order.cashbackLocked = true;

      paymentByOrderer.set(
        order.customerId,
        (paymentByOrderer.get(order.customerId) ?? 0) + toCents(order.total),
      );
      lastOrderIdByOrderer.set(order.customerId, order.id);

      // Mesmo raciocínio de OrdersService.creditCashbackForPaidOrder:
      // `order.total` já está líquido de cashback usado, então NUNCA
      // somar `cashbackUsed` de volta aqui — só tirar a entrega (que
      // pra mesa é sempre 0, mas mantido pela mesma fórmula por
      // consistência).
      const eligibleCents = toCents(order.total) - toCents(order.deliveryFee);
      if (eligibleCents > 0) {
        // Divisão do cashback GANHO (pedido do Felipe, 28/09): por
        // padrão cada cliente recebe o cashback dos PRÓPRIOS pedidos
        // ('por_pedido'/null); em 'pagador', tudo vai pra quem fechou a
        // conta (closingRequestedByCustomerId) — mas o crédito continua
        // sendo registrado UM POR PEDIDO (auditoria por pedido intacta),
        // só muda o destinatário.
        const creditRecipientId =
          session.cashbackSplitMode === 'pagador' && session.closingRequestedByCustomerId
            ? session.closingRequestedByCustomerId
            : order.customerId;
        const result = await this.cashbackService.credit(
          this.orderRepo.manager,
          tenantId,
          creditRecipientId,
          order.locationId,
          eligibleCents,
          'order',
          order.id,
        );
        if (result.creditedCents > 0) {
          order.cashbackEarned = fromCents(result.creditedCents);
          cashbackByRecipient.set(
            creditRecipientId,
            (cashbackByRecipient.get(creditRecipientId) ?? 0) + result.creditedCents,
          );
        }
      }
      await this.orderRepo.save(order);
    }

    if (tenantForNotify) {
      const allCustomerIds = new Set([...paymentByOrderer.keys(), ...cashbackByRecipient.keys()]);
      for (const customerId of allCustomerIds) {
        const totalCents = paymentByOrderer.get(customerId);
        if (totalCents) {
          await this.pushService.sendToCustomer(tenantId, customerId, {
            title: 'Pagamento confirmado',
            body: `Recebemos o pagamento de R$ ${fromCents(totalCents).toFixed(2).replace('.', ',')} da sua conta.`,
            url: `/${tenantForNotify.slug}/conta-cliente/pedidos/mesa/${sessionId}`,
            tag: 'payment_completed',
            groupTag: `payment-session-${sessionId}-${customerId}`,
            icon: tenantForNotify.logoUrl ?? undefined,
          });
        }
        const cashbackCents = cashbackByRecipient.get(customerId);
        if (cashbackCents) {
          await this.pushService.sendToCustomer(tenantId, customerId, {
            title: 'Você ganhou cashback',
            body: `R$ ${fromCents(cashbackCents).toFixed(2).replace('.', ',')} caíram na sua carteira desse restaurante. Toque pra ver o saldo.`,
            url: `/${tenantForNotify.slug}/conta-cliente/cashback`,
            tag: 'cashback',
            groupTag: `cashback-session-${sessionId}-${customerId}`,
            icon: tenantForNotify.logoUrl ?? undefined,
          });
        }
      }
      // Convite pra avaliar só vai pra quem de fato PEDIU algo (um único
      // pedido "leva" o convite — o mais recente da sessão daquele
      // cliente — não um por pedido). Quem só pagou (modo 'pagador' de
      // cashback) mas não pediu nada não recebe: não tem o que avaliar.
      for (const customerId of paymentByOrderer.keys()) {
        await this.pushService.sendToCustomer(tenantId, customerId, {
          title: 'Como foi seu pedido?',
          body: 'Sua opinião ajuda outros clientes e o restaurante a melhorar. Toque pra avaliar.',
          url: `/${tenantForNotify.slug}/conta-cliente/pedidos/mesa/${sessionId}?avaliar=${lastOrderIdByOrderer.get(customerId)}`,
          tag: 'review_prompt',
          groupTag: `review-session-${sessionId}-${customerId}`,
          icon: tenantForNotify.logoUrl ?? undefined,
        });
      }
    }

    // Chamado de garçom pendente dessa mesa não faz mais sentido depois
    // que a conta foi paga e encerrada — fecha junto, pra não ficar
    // piscando pedindo atenção de uma mesa que já foi resolvida.
    await this.waiterCallRepo
      .createQueryBuilder()
      .update(WaiterCall)
      .set({ status: 'atendido', attendedAt: new Date() })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status = :status', { status: 'pendente' })
      .execute();

    return savedSession;
  }

  // Encerramento forçado, sem exigir pagamento — escape-hatch
  // administrativo, pensado pra corrigir sessão travada/de teste, nunca
  // pra fechar conta de cliente de verdade sem cobrar. Exige motivo por
  // escrito (não é só um "OK" de confirmação) e fica auditado: quem fez
  // e quando, gravado na própria sessão (forceClosedReason/
  // forceClosedByUserId/forceClosedByEmail — NULL em toda sessão
  // fechada normalmente, então já funciona como filtro de auditoria
  // sozinho). Os pedidos continuam no histórico normalmente, só a
  // sessão é marcada como encerrada, e a mesa fica livre pra uma sessão
  // nova no próximo QR code escaneado.
  async forceResetSession(
    tenantId: string,
    sessionId: string,
    reason: string,
    performedBy: { userId: string; email: string },
  ): Promise<TableSession> {
    const session = await this.findSession(tenantId, sessionId);
    session.status = 'fechada';
    session.closedAt = new Date();
    session.paymentMethod = session.paymentMethod ?? 'nao_informado';
    session.forceClosedReason = reason;
    session.forceClosedByUserId = performedBy.userId;
    session.forceClosedByEmail = performedBy.email;
    const savedSession = await this.sessionRepo.save(session);

    await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ status: 'cancelado' })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status NOT IN (:...finalStatuses)', {
        finalStatuses: ['entregue', 'cancelado'],
      })
      .execute();

    await this.waiterCallRepo
      .createQueryBuilder()
      .update(WaiterCall)
      .set({ status: 'atendido', attendedAt: new Date() })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status = :status', { status: 'pendente' })
      .execute();

    return savedSession;
  }

  // ---------- Chamar garçom ----------

  async callWaiter(tenantId: string, sessionId: string): Promise<WaiterCall> {
    const session = await this.findSession(tenantId, sessionId);
    const table = await this.tableRepo.findOne({ where: { id: session.tableId } });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada.');
    }
    await this.assertOpen(table.locationId);
    const call = this.waiterCallRepo.create({
      tenantId,
      tableSessionId: session.id,
      status: 'pendente',
    });
    return this.waiterCallRepo.save(call);
  }

  async findPendingWaiterCalls(tenantId: string): Promise<WaiterCall[]> {
    return this.waiterCallRepo.find({
      where: { tenantId, status: 'pendente' },
      order: { createdAt: 'ASC' },
      relations: { tableSession: { table: true } } as any,
    });
  }

  // Usado pelo cliente pra saber quando o chamado dele foi atendido, sem
  // precisar de WebSocket — só pergunta "qual o status do meu último
  // chamado?" a cada poucos segundos e esconde a mensagem quando virar
  // 'atendido'.
  async getLatestWaiterCallStatus(
    tenantId: string,
    sessionId: string,
  ): Promise<{ status: 'pendente' | 'atendido' | 'cancelado' | null }> {
    const call = await this.waiterCallRepo.findOne({
      where: { tenantId, tableSessionId: sessionId },
      order: { createdAt: 'DESC' },
    });
    return {
      status: (call?.status as 'pendente' | 'atendido' | 'cancelado' | undefined) ?? null,
    };
  }

  // "Cancelar chamar garçom" — pro caso do cliente ter clicado sem
  // querer. Só cancela o chamado mais recente, e só se ainda estiver
  // 'pendente' (se o garçom já foi atender, não faz sentido desfazer).
  async cancelWaiterCall(tenantId: string, sessionId: string): Promise<{ cancelled: boolean }> {
    const call = await this.waiterCallRepo.findOne({
      where: { tenantId, tableSessionId: sessionId },
      order: { createdAt: 'DESC' },
    });
    if (!call || call.status !== 'pendente') {
      return { cancelled: false };
    }
    call.status = 'cancelado';
    await this.waiterCallRepo.save(call);
    return { cancelled: true };
  }

  async attendWaiterCall(tenantId: string, callId: string): Promise<WaiterCall> {
    const call = await this.waiterCallRepo.findOne({ where: { id: callId, tenantId } });
    if (!call) {
      throw new NotFoundException('Chamado não encontrado.');
    }
    call.status = 'atendido';
    call.attendedAt = new Date();
    return this.waiterCallRepo.save(call);
  }
}
