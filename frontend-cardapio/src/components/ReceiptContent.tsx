import { activeDateLocale } from '../i18n/languages';
import { useI18n } from '../i18n/I18nContext';
import { PersonHeader } from './PeopleOrders';
import { VerifiedBadge } from './VerifiedBadge';
import type { Tenant, SessionSummary } from '../types';
import { ReceiptAuthenticityCode } from './ReceiptAuthenticityCode';

// Mesmo layout do cupom usado no painel do admin (ReceiptContent) — de
// propósito idêntico, char por char no essencial, pra que se o cliente e
// o restaurante precisarem comparar recibos, os dois batam exatamente.
export function ReceiptContent({ tenant, summary }: { tenant: Tenant; summary: SessionSummary }) {
  const { t } = useI18n();
  const { session, orders, total, tipAmount, grandTotal, cashbackApplied, customerName, participants, people: rawPeople, receiptVerificationCode } = summary;
  // UM avatar por cliente em "Mesa compartilhada por": o mesmo cliente podia
  // vir duas vezes (assento de convidado + conta) — dedupe por id e por nome.
  const people = rawPeople
    ? rawPeople.filter(
        (p, i, all) =>
          all.findIndex((q) => q.id === p.id || q.name.trim().toLowerCase() === p.name.trim().toLowerCase()) === i,
      )
    : rawPeople;
  const isClosed = session.status === 'fechada';

  const discountTotal = orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((sum, o) => sum + Number(o.discountAmount ?? 0), 0);
  const cashbackUsedTotal = orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((sum, o) => sum + Number(o.cashbackUsed ?? 0), 0);
  const cashbackEarnedTotal = orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((sum, o) => sum + Number(o.cashbackEarned ?? 0), 0);
  // `promotionTitlesSnapshot` cobre pedidos que usaram MAIS DE UM cupom
  // ao mesmo tempo — cai pro singular só em pedidos bem antigos, de
  // antes dessa coluna existir.
  const promotionTitles = Array.from(
    new Set(
      orders
        .filter((o) => o.status !== 'cancelado')
        .flatMap((o) =>
          o.promotionTitlesSnapshot?.length
            ? o.promotionTitlesSnapshot
            : o.promotionTitleSnapshot
              ? [o.promotionTitleSnapshot]
              : [],
        ),
    ),
  );

  const renderOrder = (order: (typeof orders)[number]) => {
        const orderCashback = Number(order.cashbackEarned ?? 0);
        const createdAt = new Date(order.createdAt);
        return (
          <div className="flex flex-col gap-0.5">
            {/* Na listagem dos pedidos: só hora e data — nada de foto ou
                nome do cliente (quem é quem já está em "Mesa compartilhada
                por"). */}
            <p className="text-[10px] text-[#9CA3AF] flex justify-between">
              <span>{createdAt.toLocaleTimeString(activeDateLocale(), { hour: '2-digit', minute: '2-digit' })}</span>
              <span>{createdAt.toLocaleDateString(activeDateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            </p>
            {(order.items ?? []).map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span>
                  {item.quantity}x {item.productName}
                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <span className="block text-[10px] text-[#9CA3AF]">
                      {item.selectedOptions.map((o) => o.label).join(', ')}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap pl-3 shrink-0">R$ {Number(item.subtotal).toFixed(2).replace('.', ',')}</span>
              </div>
            ))}
            {orderCashback > 0 && (
              <p className="text-[10px] text-[#16A34A] text-right">
                + R$ {orderCashback.toFixed(2).replace('.', ',')} {t('receiptContent.de_cashback')}
              </p>
            )}
          </div>
        );
  };

  // ISOLAMENTO DO TEMA (Etapa 1, item 2): o cupom é papel impresso e NUNCA herda
  // o tema escuro. Todas as cores são hex explícito (nenhuma classe `gray-*`/
  // `red-*`/`green-*`, que o tema global pode remapear). No claro nada muda
  // (sem fundo/padding extra); no escuro o cupom vira uma folha branca
  // (`dark:bg-[#FFFFFF]`) com respiro, com texto #1F2937 sobre ela.
  return (
    <div className="w-full dark:bg-[#FFFFFF] dark:rounded-xl dark:p-4 [color-scheme:light]">
      <div className="font-mono text-xs md:text-[13px] text-[#1F2937] flex flex-col gap-2 w-full max-w-[280px] md:max-w-[340px] mx-auto">
        <div className="text-center flex flex-col gap-0.5">
          <p className="font-bold text-sm">{tenant.name}</p>
        </div>

        <div className="border-t border-dashed border-[#D1D5DB] my-1" />

        <p className="text-center">{t('receiptContent.simples_conferencia_da_conta')}</p>
        <p className="text-center">{t('receiptContent.nao_e_documento_fiscal')}</p>

        <div className="border-t border-dashed border-[#D1D5DB] my-1" />

        <div className="flex justify-between">
          <span>{session.table?.number ?? t('receiptContent.mesa')}</span>
          <span>{isClosed ? 'FECHADA' : 'EM ABERTO'}</span>
        </div>
        {/* Pedido do Felipe (14/09, sessão I): mostrar TODO MUNDO que
            esteve na mesa (conta compartilhada), não só um nome único —
            com destaque pra quem abriu. Cai pro `customerName` antigo
            (uma pessoa só) em sessões de antes dessa mudança, que não têm
            `participants` preenchido. */}
        {people && people.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span>{t('receiptContent.mesa_compartilhada_por')}</span>
            {people.map((person) => (
              <PersonHeader key={person.id} person={person} compact />
            ))}
          </div>
        ) : participants.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            <span>{t('receiptContent.mesa_compartilhada_por')}</span>
            {participants.map((p, idx) => (
              <div key={idx} className="flex justify-between pl-2">
                <ReceiptPerson name={p.name} avatarUrl={p.avatarUrl} verified={Boolean((p as { isVerified?: boolean }).isVerified)} />
                <span className="text-[10px] text-[#9CA3AF]">{p.isOpener ? t('receiptContent.abriu_a_mesa') : ''}</span>
              </div>
            ))}
          </div>
        ) : (
          customerName && (
            <div className="flex justify-between">
              <span>{t('receiptContent.cliente')}</span>
              <span>{customerName}</span>
            </div>
          )
        )}
        <div className="flex justify-between">
          <span>{t('receiptContent.aberto_em')}</span>
          <span>
            {new Date(session.openedAt).toLocaleString(activeDateLocale(), {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        {isClosed && session.closedAt && (
          <div className="flex justify-between">
            <span>{t('receiptContent.fechado_em')}</span>
            <span>
              {new Date(session.closedAt).toLocaleString(activeDateLocale(), {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        <div className="border-t border-dashed border-[#D1D5DB] my-1" />

        {/* Lista simples dos pedidos (itens, hora e data) — sem repetir foto/nome. */}
        {orders.length === 0 ? (
          <p className="text-center text-[#9CA3AF]">{t('receiptContent.sem_pedidos')}</p>
        ) : (
          orders.map((order) => <div key={order.id}>{renderOrder(order)}</div>)
        )}

        <div className="border-t border-dashed border-[#D1D5DB] my-1" />

        <div className="flex justify-between">
          <span>{t('closingPaymentSheet.subtotal')}</span>
          <span className="whitespace-nowrap pl-3 shrink-0">R$ {total.toFixed(2).replace('.', ',')}</span>
        </div>
        {discountTotal > 0 && (
          <div className="flex justify-between text-[#DC2626]">
            <span>
              {t('receiptContent.desconto_aplicado')}{promotionTitles.length > 0 ? ` (${promotionTitles.join(', ')})` : ''}
              <span className="block text-[10px] text-[#9CA3AF]">{t('receiptContent.ja_refletido_no_subtotal')}</span>
            </span>
            <span className="whitespace-nowrap pl-3 shrink-0">- R$ {discountTotal.toFixed(2).replace('.', ',')}</span>
          </div>
        )}
        {cashbackUsedTotal > 0 && (
          <div className="flex justify-between text-[#DC2626]">
            <span>{t('receiptContent.cashback_usado')}</span>
            <span className="whitespace-nowrap pl-3 shrink-0">- R$ {cashbackUsedTotal.toFixed(2).replace('.', ',')}</span>
          </div>
        )}
        {tipAmount > 0 && (
          <div className="flex justify-between">
            <span>{t('closingPaymentSheet.gorjeta')}</span>
            <span className="whitespace-nowrap pl-3 shrink-0">R$ {tipAmount.toFixed(2).replace('.', ',')}</span>
          </div>
        )}
        {cashbackApplied > 0 && (
          <div className="flex justify-between text-[#DC2626]">
            <span>{t('receiptContent.cashback_usado_no_fechamento')}</span>
            <span className="whitespace-nowrap pl-3 shrink-0">- R$ {cashbackApplied.toFixed(2).replace('.', ',')}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm">
          <span>{t('receiptContent.total')}</span>
          <span className="whitespace-nowrap pl-3 shrink-0">R$ {grandTotal.toFixed(2).replace('.', ',')}</span>
        </div>
        {cashbackEarnedTotal > 0 && (
          <div className="flex justify-between text-[#16A34A] text-[11px]">
            <span>{t('receiptContent.cashback_recebido_nesse_pedido')}</span>
            <span>+ R$ {cashbackEarnedTotal.toFixed(2).replace('.', ',')}</span>
          </div>
        )}

        {isClosed && session.paymentMethod && (
          <>
            <div className="border-t border-dashed border-[#D1D5DB] my-1" />
            <div className="flex justify-between">
              <span>{t('receiptContent.pagamento')}</span>
              <span className="capitalize">{session.paymentMethod}</span>
            </div>
            {session.paymentMethod === 'dinheiro' && session.amountReceived != null && (
              <>
                <div className="flex justify-between">
                  <span>{t('receiptContent.recebido')}</span>
                  <span className="whitespace-nowrap pl-3 shrink-0">R$ {Number(session.amountReceived).toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('receiptContent.troco')}</span>
                  <span className="whitespace-nowrap pl-3 shrink-0">R$ {Number(session.changeGiven ?? 0).toFixed(2).replace('.', ',')}</span>
                </div>
              </>
            )}
          </>
        )}

        <div className="border-t border-dashed border-[#D1D5DB] my-1" />

        <p className="text-center pt-1">{t('receiptContent.obrigado_pela_preferencia')}</p>
        <p className="text-center">{t('receiptContent.volte_sempre')}</p>

        {receiptVerificationCode && (
          <>
            <div className="border-t border-dashed border-[#D1D5DB] my-1" />
            {/* Só existe depois que a mesa fecha de verdade — ver
                TablesService.getSessionSummary. Mesmo princípio do cupom
                avulso: confere autenticidade sem depender de esconder o
                código, já que a verificação sempre recalcula a partir dos
                dados reais no banco. */}
            <ReceiptAuthenticityCode code={receiptVerificationCode} />
          </>
        )}
      </div>
    </div>
  );
}

// Pessoa na lista simples do cupom: foto (ou inicial) + nome, com o selo se for verificada.
function ReceiptPerson({ name, avatarUrl, verified }: { name: string; avatarUrl: string | null; verified: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="relative inline-flex shrink-0">
        <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-[#E5E7EB] text-[10px] font-bold text-[#6B7280]">
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name.trim().charAt(0).toUpperCase()}
        </span>
        {verified && (
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex">
            <VerifiedBadge size={9} />
          </span>
        )}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
