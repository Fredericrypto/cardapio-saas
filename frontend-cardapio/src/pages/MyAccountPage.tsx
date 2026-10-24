import { orderStatusLabel } from '../i18n/labels';
import { activeDateLocale } from '../i18n/languages';
import { useI18n } from '../i18n/I18nContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { PeopleOrders } from '../components/PeopleOrders';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Bell, LogOut } from 'lucide-react';
import { fetchSessionSummary, requestSessionClosing, leaveTable } from '../lib/menu-api';
import type { RequestClosingPayload } from '../lib/menu-api';
import { ClosingPaymentSheet } from '../components/ClosingPaymentSheet';
import { TableSessionPixWaitingPanel } from '../components/TableSessionPixWaitingPanel';
import type { SessionSummary } from '../types';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { clearActiveMesaToken, markLeftLocally } from '../lib/seat';

export function MyAccountPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { slug, qrCodeToken } = useParams<{ slug: string; qrCodeToken: string }>();
  const { session } = useTableSessionContext()!;
  const { tenant } = useTenant();
  const { token: customerToken, customer } = useCustomerAuth();
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  async function handleLeaveTable() {
    if (!qrCodeToken) return;
    setConfirmingLeave(false);
    setIsLeaving(true);
    setLeaveError(null);
    try {
      await leaveTable(qrCodeToken, customerToken);
      finishLeaving();
    } catch (err) {
      // Pedido do Felipe (16/09): se o backend recusou de propósito
      // (já tem pedido nessa conta — ver TablesService.leaveTable), tem
      // que PARAR aqui e avisar, nunca sair mesmo assim. Só numa falha
      // de rede/inesperada de verdade (sem mensagem 4xx reconhecível
      // vinda do backend) é que ainda faz sentido deixar sair mesmo
      // assim — pior caso, a pessoa continua aparecendo pro admin até a
      // próxima ação, mas não fica presa nessa tela por causa de
      // instabilidade. Nunca mostra texto cru de um erro 5xx — só
      // confia em mensagens de erro 4xx (as que eu mesmo escrevo de
      // propósito em português simples).
      const response =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number; data?: { message?: string } } }).response
          : undefined;
      const status = response?.status;
      const backendMessage =
        status && status >= 400 && status < 500 ? response?.data?.message : undefined;
      if (backendMessage) {
        setLeaveError(backendMessage);
      } else {
        // Falha de rede: NÃO finge que saiu (o servidor pode ainda
        // considerar o assento ativo). Pede pra tentar de novo.
        setLeaveError(t('myAccountPage.nao_foi_possivel_sair'));
      }
    } finally {
      setIsLeaving(false);
    }
  }

  // Saída confirmada pelo servidor: o assento morreu. Vai pra tela final
  // "Você saiu desta mesa" (que NÃO tem caminho de volta — só novo QR).
  function finishLeaving() {
    if (qrCodeToken) markLeftLocally(customerToken, qrCodeToken);
    if (slug) clearActiveMesaToken(customerToken, slug);
    navigate(`/${slug}/mesa/${qrCodeToken}`, { replace: true });
  }

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [closingRequested, setClosingRequested] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [tipPercent, setTipPercent] = useState<number | 'custom' | null>(null);
  const [customTip, setCustomTip] = useState('');
  // Altura real da barra fixa de fechamento (muda com gorjeta personalizada,
  // erros, cashback...). O conteúdo reserva exatamente esse espaço no mobile;
  // um padding fixo deixava pedidos escondidos atrás da barra.
  const [barHeight, setBarHeight] = useState(0);
  const barObserver = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((el: HTMLDivElement | null) => {
    barObserver.current?.disconnect();
    barObserver.current = null;
    if (!el) return;
    const update = () => setBarHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    barObserver.current = new ResizeObserver(update);
    barObserver.current.observe(el);
  }, []);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  // Folha de pagamento (forma de pagamento + cashback) aberta ao tocar
  // em "Solicitar fechamento" — pedido do Felipe, 28/09.
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  // Voltando do login/cadastro feito a partir do aviso de cashback: cai de
  // volta EXATAMENTE na folha de pagamento (?fechar=1), com a sessão da
  // mesa intacta. O parâmetro é consumido na hora (não reabre em refresh).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('fechar') === '1') {
      setShowPaymentSheet(true);
      const next = new URLSearchParams(searchParams);
      next.delete('fechar');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Guarda o último status conhecido de cada pedido pra detectar mudanças
  // entre uma atualização (poll) e outra, e avisar o cliente na tela.
  const previousStatusesRef = useRef<Record<string, string> | null>(null);

  function detectStatusChanges(newSummary: SessionSummary) {
    const previous = previousStatusesRef.current;
    const current: Record<string, string> = {};
    newSummary.orders.forEach((order) => {
      current[order.id] = order.status;
    });

    // Só compara a partir da segunda atualização — na primeira carga não
    // existe "mudança" de verdade, é só o estado inicial.
    if (previous) {
      for (const order of newSummary.orders) {
        const before = previous[order.id];
        if (before && before !== order.status) {
          const label = orderStatusLabel(order.status, t);
          setStatusNotification(t('myAccountPage.seu_pedido_agora_esta', { label: label }));
          setTimeout(() => setStatusNotification(null), 5000);
          break; // mostra uma notificação por vez, mesmo se vários mudarem juntos
        }
      }
    }
    previousStatusesRef.current = current;
  }

  useEffect(() => {
    if (!tenant || !session) return;
    const tenantId = tenant.id;

    async function load() {
      const summaryData = await fetchSessionSummary(tenantId, session!.id, customerToken);
      setSummary(summaryData);
      setClosingRequested(summaryData.session.status === 'fechamento_solicitado');
      detectStatusChanges(summaryData);
      setIsLoading(false);
    }

    load();

    // Atualiza a cada poucos segundos — assim o cliente vê em tempo real
    // quando o garçom avança o status do pedido, ou quando a conta é
    // efetivamente fechada (pagamento confirmado), sem precisar recarregar
    // a página manualmente.
    // Não consulta com a aba escondida / celular bloqueado, nunca empilha
    // uma consulta em cima da outra (o Render gratuito pode levar mais de
    // 4s pra responder) e não deixa uma falha de rede pontual virar erro
    // não tratado. Ao voltar pra aba, atualiza na hora.
    let inFlight = false;
    async function refresh() {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const summaryData = await fetchSessionSummary(tenantId, session!.id, customerToken);
        // Meu assento saiu (ex: saí por outra aba): fim, definitivo.
        if (summaryData.mySeat && !summaryData.mySeat.active) {
          finishLeaving();
          return;
        }
        setSummary(summaryData);
        setClosingRequested(summaryData.session.status === 'fechamento_solicitado');
        detectStatusChanges(summaryData);
      } catch {
        // Tenta de novo no próximo ciclo.
      } finally {
        inFlight = false;
      }
    }
    const interval = setInterval(refresh, 4000);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [tenant, session, customerToken]);

  function calculateTipAmount(): number {
    if (!summary) return 0;
    if (tipPercent === 'custom') {
      const value = Number(customTip.replace(',', '.'));
      return isNaN(value) || value < 0 ? 0 : Math.round(value * 100) / 100;
    }
    if (typeof tipPercent === 'number') {
      const totalCents = Math.round(summary.total * 100);
      const tipCents = Math.round((totalCents * tipPercent) / 100);
      return tipCents / 100;
    }
    return 0;
  }

  async function handleConfirmClosing(payload: RequestClosingPayload) {
    if (!tenant || !session) return;
    setIsRequesting(true);
    setRequestError(null);
    try {
      await requestSessionClosing(tenant.id, session.id, payload, customerToken);
      setShowPaymentSheet(false);
      setClosingRequested(true);
    } catch (err) {
      // Mostra o motivo que o backend escreveu de propósito (só 4xx, como
      // no resto do app) em vez de sempre a mesma frase genérica, que
      // escondia a causa real. 5xx/falha de rede continuam genéricos.
      const response =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number; data?: { message?: string } } }).response
          : undefined;
      const status = response?.status;
      const backendMessage =
        status && status >= 400 && status < 500 && typeof response?.data?.message === 'string'
          ? response.data.message
          : undefined;
      setRequestError(
        backendMessage ??
          t('myAccountPage.nao_foi_possivel_solicitar'),
      );
    } finally {
      setIsRequesting(false);
    }
  }

  if (isLoading || !tenant || !summary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (summary.session.status === 'fechada') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl mb-4"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          ✓
        </div>
        <h1 className="font-display text-xl font-bold text-gray-900">
          {t('myAccountPage.conta_fechada')}
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          {t('myAccountPage.obrigado_pela_visita_sua')}
        </p>
      </div>
    );
  }

  // Pedido do Felipe (18/09): repensado quem pode ver "Sair da mesa" —
  // nunca pra quem ABRIU a mesa (não faz sentido "sair" de algo que é
  // seu; a única saída pra quem abriu é fechar a conta de verdade), e
  // só pra quem ainda não fez NENHUM pedido — assim que a pessoa pede
  // algo, a única forma de sair é a conta ser fechada com pagamento
  // (ver TablesService.leaveTable, que já bloqueia nesse caso).
  const isOpener = Boolean(customer && summary.session.openedByCustomerId === customer.id);
  // Quantos clientes DISTINTOS e logados pediram algo nessa mesa —
  // pergunta como dividir o cashback ganho só quando é mais de 1 (ver
  // ClosingPaymentSheet). Conta só pedidos não cancelados com cliente
  // logado (convidado não recebe cashback de qualquer forma).
  const distinctPayingCustomers = new Set(
    summary.orders.filter((o) => o.status !== 'cancelado' && o.customer?.id).map((o) => o.customer!.id),
  ).size;
  // Decisão final (30/09): qualquer cliente — logado ou convidado, inclusive quem
  // abriu a mesa — sai se não tem pedido seu (cancelado não conta). Quem decide
  // é o servidor (`mySeat.canLeave`); o botão só obedece.
  const canLeaveTable =
    Boolean(summary.mySeat?.active && summary.mySeat.canLeave) &&
    summary.session.status === 'aberta';

  return (
    <div
      className="min-h-screen bg-white md:bg-gray-50 pb-[calc(var(--account-bar-h,8rem)+1.75rem)] md:pb-12"
      style={barHeight > 0 ? ({ '--account-bar-h': `${barHeight}px` } as CSSProperties) : undefined}
    >
     <div className="max-w-md mx-auto md:max-w-5xl md:px-6">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 md:px-0 md:pt-8 md:pb-5 md:border-b-0">
        <button onClick={() => navigate(-1)} aria-label={t('common.back')} className="md:w-10 md:h-10 md:rounded-full md:bg-white md:border md:border-gray-100 md:flex md:items-center md:justify-center md:hover:bg-gray-50">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg md:text-2xl flex-1">{t('tableMenuHeader.minha_conta')}</h1>
      </div>
      {/* Fora da barra do cabeçalho de propósito — o relógio de prazo
          (TableSessionTimer, variant="fixed") flutua no canto superior
          direito da tela nessa mesma página, e ficava por cima desse
          botão quando os dois moravam na mesma linha. */}
      {/* Desktop: pedidos à esquerda, painel de fechamento fixo à direita. */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_360px] md:gap-6 md:items-start">
      <div className="min-w-0 md:bg-white md:rounded-2xl md:border md:border-gray-100 md:shadow-sm md:overflow-hidden">
      {canLeaveTable && (
        <div className="px-4 pt-3 flex md:px-6 md:pt-5 md:justify-start">
          {/* Mesmo visual do botão "Minha conta" do header da mesa. */}
          <button
            onClick={() => setConfirmingLeave(true)}
            disabled={isLeaving}
            className="flex-1 md:flex-none md:px-5 rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-100 disabled:opacity-50 md:hover:bg-gray-100"
          >
            <LogOut size={14} />
            {isLeaving ? 'Saindo...' : t('myAccountPage.sair_da_mesa')}
          </button>
        </div>
      )}
      {confirmingLeave && (
        <ConfirmModal
          message={t('myAccountPage.tem_certeza_que_quer', { v0: isOpener ? t('myAccountPage.voce_abriu_a_mesa') : '' })}
          confirmLabel={t('myAccountPage.sim_sair_da_mesa')}
          onConfirm={handleLeaveTable}
          onCancel={() => setConfirmingLeave(false)}
        />
      )}
      {leaveError && (
        <p className="px-4 pt-3 md:px-6 text-xs text-red-500 text-center md:text-left">{leaveError}</p>
      )}

      {statusNotification && (
        <div
          className="mx-4 md:mx-6 mt-3 rounded-lg px-4 py-2.5 text-sm font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: tenant.secondaryColor }}
        >
          <Bell size={15} />
          {statusNotification}
        </div>
      )}

      {/* Pessoas na mesa (decisão de 01/10): todo mundo que está presente,
          com nome e avatar, e cada pedido logo abaixo de quem fez. */}
      {summary.people && summary.people.length > 0 ? (
        <div className="p-4 md:p-6">
          <PeopleOrders
            people={summary.people}
            orders={summary.orders}
            unassignedOrderIds={summary.unassignedOrderIds ?? []}
            dark
            renderOrder={(order) => (
              <div className="bg-white/[0.06] border border-white/10 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-400">
                  {new Date(order.createdAt).toLocaleTimeString(activeDateLocale(), {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    color: '#E5E7EB',
                  }}
                >
                  {orderStatusLabel(order.status, t)}
                </span>
              </div>

              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-100">
                    {item.quantity}x {item.productName}
                  </span>
                  <span className="text-gray-400">
                    R$ {Number(item.subtotal).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ))}
            </div>
            )}
          />
        </div>
      ) : summary.orders.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-12">
          {t('myAccountPage.voce_ainda_nao_fez')}
        </p>
      ) : (
        <div className="p-4 md:p-6 flex flex-col gap-4 md:grid md:grid-cols-2">
          {summary.orders.map((order) => (
            <div key={order.id}>
            <div className="border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-400">
                  {new Date(order.createdAt).toLocaleTimeString(activeDateLocale(), {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${tenant.primaryColor}1A`,
                    color: tenant.primaryColor,
                  }}
                >
                  {orderStatusLabel(order.status, t)}
                </span>
              </div>

              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-700">
                    {item.quantity}x {item.productName}
                  </span>
                  <span className="text-gray-500">
                    R$ {Number(item.subtotal).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ))}
            </div>
            </div>
          ))}
        </div>
      )}

      </div>

      <div ref={barRef} className="fixed z-30 bottom-[calc(var(--bottom-nav-h,0px)+0.75rem)] left-3 right-3 max-w-md mx-auto p-4 bg-white rounded-2xl border border-gray-100 shadow-xl flex flex-col gap-3 md:sticky md:top-24 md:bottom-auto md:left-auto md:right-auto md:max-w-none md:mx-0 md:rounded-2xl md:border md:shadow-sm md:p-5">
        {!closingRequested && summary.orders.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              {t('myAccountPage.gorjeta_opcional')}
            </p>
            <div className="flex gap-2">
              {[0, 10, 15].map((percent) => (
                <button
                  key={percent}
                  onClick={() => setTipPercent(percent === 0 ? null : percent)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                  style={
                    (percent === 0 && tipPercent === null) || tipPercent === percent
                      ? {
                          backgroundColor: tenant.primaryColor,
                          color: 'white',
                          borderColor: tenant.primaryColor,
                        }
                      : { borderColor: '#e5e5e5', color: '#666' }
                  }
                >
                  {percent === 0 ? t('cartPage.sem_gorjeta') : `${percent}%`}
                </button>
              ))}
              <button
                onClick={() => setTipPercent('custom')}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                style={
                  tipPercent === 'custom'
                    ? {
                        backgroundColor: tenant.primaryColor,
                        color: 'white',
                        borderColor: tenant.primaryColor,
                      }
                    : { borderColor: '#e5e5e5', color: '#666' }
                }
              >
                {t('myAccountPage.outro')}
              </button>
            </div>
            {tipPercent === 'custom' && (
              <input
                type="number"
                step="0.01"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                placeholder={t('myAccountPage.valor_da_gorjeta_r')}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              />
            )}
          </div>
        )}

        <div className="flex justify-between items-center text-sm text-gray-500">
          <span>{t('closingPaymentSheet.subtotal')}</span>
          <span>R$ {summary.total.toFixed(2).replace('.', ',')}</span>
        </div>

        {/* Depois de solicitado o fechamento, usa o valor de gorjeta já
            confirmado pelo backend (summary.tipAmount) em vez do cálculo
            local — que reseta ao recarregar a página e fazia a linha
            "Gorjeta" sumir mesmo com gorjeta aplicada. */}
        {(closingRequested ? summary.tipAmount : calculateTipAmount()) > 0 && (
          <div className="flex justify-between items-center text-sm text-gray-500">
            <span>{t('closingPaymentSheet.gorjeta')}</span>
            <span>
              R${' '}
              {(closingRequested ? summary.tipAmount : calculateTipAmount())
                .toFixed(2)
                .replace('.', ',')}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-500">{t('closingPaymentSheet.total')}</span>
          <span className="text-lg font-bold" style={{ color: tenant.primaryColor }}>
            R${' '}
            {closingRequested
              ? summary.grandTotal.toFixed(2).replace('.', ',')
              : (summary.total + calculateTipAmount()).toFixed(2).replace('.', ',')}
          </span>
        </div>

        {requestError && (
          <p className="text-xs text-red-500 text-center">{requestError}</p>
        )}

        {closingRequested ? (
          summary.session.paymentStatus === 'pendente' && summary.session.pixPayload ? (
            <TableSessionPixWaitingPanel
              tenant={tenant}
              session={summary.session}
              onConfirmed={() => {
                /* fetchSessionSummary do polling já vai pegar o status
                   'fechada' no próximo tick e trocar de tela sozinho. */
              }}
              onFailed={() => {
                /* idem — o próximo poll vai ver paymentStatus:'falhou'
                   e cair no ramo de abaixo automaticamente. */
              }}
            />
          ) : summary.session.paymentStatus === 'falhou' ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-sm font-semibold text-red-500 text-center">
                {t('myAccountPage.o_pix_nao_foi')}
              </p>
              <button
                onClick={() => setShowPaymentSheet(true)}
                className="w-full py-3 rounded-xl text-white font-semibold"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {t('optionalCustomerAuth.tentar_de_novo')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-gray-500">
              <CheckCircle2 size={16} />
              {t('myAccountPage.fechamento_solicitado_aguarde_o')}
            </div>
          )
        ) : (
          <button
            onClick={() => setShowPaymentSheet(true)}
            disabled={isRequesting || summary.orders.length === 0}
            className="w-full py-3.5 rounded-xl text-white font-semibold disabled:opacity-60"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {t('myAccountPage.solicitar_fechamento_da_conta')}
          </button>
        )}
      </div>
      </div>
     </div>

      {showPaymentSheet && (
        <ClosingPaymentSheet
          tenantId={tenant.id}
          primaryColor={tenant.primaryColor}
          subtotal={summary.total}
          tipAmount={calculateTipAmount()}
          customerToken={customerToken}
          distinctPayingCustomers={distinctPayingCustomers}
          isSubmitting={isRequesting}
          error={requestError}
          onCancel={() => setShowPaymentSheet(false)}
          onConfirm={handleConfirmClosing}
        />
      )}
    </div>
  );
}
