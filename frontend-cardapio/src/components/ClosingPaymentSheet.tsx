import { paymentMethodLabel } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CashbackLoginNotice } from './CashbackLoginNotice';
import { fetchMyCashbackBalance } from '../lib/customer-api';
import type { RequestClosingPayload } from '../lib/menu-api';

interface ClosingPaymentSheetProps {
  tenantId: string;
  primaryColor: string;
  subtotal: number;
  tipAmount: number;
  customerToken: string | null;
  // Quantos clientes DISTINTOS e logados pediram algo nessa mesa — só
  // pergunta como dividir o cashback ganho quando é mais de 1 (pedido
  // do Felipe, 28/09). Ver MyAccountPage, que conta isso a partir de
  // summary.orders.
  distinctPayingCustomers: number;
  isSubmitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (payload: RequestClosingPayload) => void;
}

const PAYMENT_METHODS: { value: 'pix' | 'cartao' | 'dinheiro' }[] = [{ value: 'pix' }, { value: 'cartao' }, { value: 'dinheiro' }];

// Folha de pagamento aberta ao tocar em "Solicitar fechamento" (pedido
// do Felipe, 28/09, revisado no mesmo dia pra NUNCA pular direto pra
// "nada a pagar" mesmo quando o cashback cobre tudo — sempre uma
// escolha explícita) — antes disso o cliente só apertava um botão e o
// admin tinha que decidir tudo sozinho, sem nenhum sinal de forma de
// pagamento nem chance de usar cashback. Formata em reais só pra
// exibição; tudo que sai daqui pro backend continua em número puro
// (RequestClosingPayload), que por sua vez SEMPRE recalcula contra o
// saldo ao vivo do cliente (ver TablesService.requestClosing/
// getSessionSummary) — o valor mostrado aqui é só uma prévia.
export function ClosingPaymentSheet({
  tenantId,
  primaryColor,
  subtotal,
  tipAmount,
  customerToken,
  distinctPayingCustomers,
  isSubmitting,
  error,
  onCancel,
  onConfirm,
}: ClosingPaymentSheetProps) {
  const { t } = useI18n();
  // Com o modal aberto a página atrás NÃO rola (02/10).
  useScrollLock(true);
  const location = useLocation();
  const [cashbackBalance, setCashbackBalance] = useState<number | null>(null);
  const [useCashback, setUseCashback] = useState(false);
  // Escolha EXPLÍCITA de "pagar tudo com cashback" quando ele cobre
  // 100% — nunca assumida sozinha, mesmo com useCashback ligado; o
  // cliente ainda pode preferir "usar outra forma" nesse caso.
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao' | 'dinheiro' | null>(null);
  const [cashDeliveryPreference, setCashDeliveryPreference] = useState<'balcao' | 'mesa' | null>(
    null,
  );
  const [cashbackSplitMode, setCashbackSplitMode] = useState<'pagador' | 'por_pedido' | null>(
    null,
  );

  // Convidado sem login não tem carteira — nem tenta buscar saldo.
  useEffect(() => {
    if (!customerToken) return;
    fetchMyCashbackBalance(tenantId, customerToken)
      .then(setCashbackBalance)
      .catch(() => setCashbackBalance(null));
  }, [tenantId, customerToken]);

  const preTotal = subtotal + tipAmount;
  const cashbackApplied = useCashback && cashbackBalance ? Math.min(cashbackBalance, preTotal) : 0;
  const remaining = Math.max(0, Math.round((preTotal - cashbackApplied) * 100) / 100);
  const cashbackCoversAll = useCashback && cashbackApplied > 0 && remaining === 0;
  // O saldo, sozinho, cobre a conta inteira? Muda só o RÓTULO do botão
  // (um botão só — "Pagar com cashback" em vez de "Usar meu cashback"):
  // tocar nele já escolhe pagar tudo com cashback, tocar de novo desfaz.
  // Sempre uma escolha explícita do cliente, nunca assumida.
  const balanceCoversAll =
    cashbackBalance !== null &&
    preTotal > 0 &&
    Math.round(cashbackBalance * 100) >= Math.round(preTotal * 100);
  const askSplitMode = distinctPayingCustomers > 1;

  const canConfirm = cashbackCoversAll
    ? !askSplitMode || cashbackSplitMode !== null
    : paymentMethod !== null &&
      (paymentMethod !== 'dinheiro' || cashDeliveryPreference !== null) &&
      (!askSplitMode || cashbackSplitMode !== null);

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({
      tipAmount,
      paymentMethod: cashbackCoversAll ? 'cashback' : paymentMethod!,
      useCashback,
      cashDeliveryPreference:
        !cashbackCoversAll && paymentMethod === 'dinheiro' ? cashDeliveryPreference! : undefined,
      cashbackSplitMode: askSplitMode ? cashbackSplitMode! : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <p className="font-display font-bold text-gray-900 text-center">{t('closingPaymentSheet.fechar_minha_conta')}</p>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>{t('closingPaymentSheet.subtotal')}</span>
            <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
          </div>
          {tipAmount > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>{t('closingPaymentSheet.gorjeta')}</span>
              <span>R$ {tipAmount.toFixed(2).replace('.', ',')}</span>
            </div>
          )}
          {cashbackApplied > 0 && (
            <div className="flex justify-between text-red-600">
              <span>{t('closingPaymentSheet.cashback_aplicado')}</span>
              <span>- R$ {cashbackApplied.toFixed(2).replace('.', ',')}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100 mt-1">
            <span>{t('closingPaymentSheet.total')}</span>
            <span>R$ {remaining.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        {/* Convidado: nenhum acesso ao cashback — só o aviso + botão pro
            login. Volta pra ESTA tela com a folha de pagamento já aberta
            (?fechar=1, ver MyAccountPage). */}
        {!customerToken && (
          <CashbackLoginNotice
            returnTo={`${location.pathname}?fechar=1`}
            primaryColor={primaryColor}
          />
        )}

        {cashbackBalance !== null && cashbackBalance > 0 && (
          <button
            onClick={() => setUseCashback((v) => !v)}
            className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2.5 text-left"
          >
            <span className="text-sm text-gray-700">
              {balanceCoversAll ? t('closingPaymentSheet.pagar_com_cashback') : t('closingPaymentSheet.usar_meu_cashback')}
              <span className="block text-xs text-gray-400">
                {balanceCoversAll ? t('closingPaymentSheet.cobre_a_conta_inteira') : ''}
                {t('closing.availableBalance', { amount: cashbackBalance.toFixed(2).replace('.', ',') })}
              </span>
            </span>
            <span
              className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
              style={
                useCashback
                  ? { backgroundColor: primaryColor, borderColor: primaryColor }
                  : { borderColor: '#d1d5db' }
              }
            >
              {useCashback && <span className="w-2 h-2 rounded-sm bg-white" />}
            </span>
          </button>
        )}

        {cashbackCoversAll ? null : (
          <>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">{t('closingPaymentSheet.como_voce_vai_pagar')}</p>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => {
                      setPaymentMethod(method.value);
                      if (method.value !== 'dinheiro') setCashDeliveryPreference(null);
                    }}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold border"
                    style={
                      paymentMethod === method.value
                        ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                        : { borderColor: '#e5e5e5', color: '#666' }
                    }
                  >
                    {paymentMethodLabel(method.value, t)}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'dinheiro' && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">
                  {t('closingPaymentSheet.prefere_pagar_onde')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCashDeliveryPreference('balcao')}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold border"
                    style={
                      cashDeliveryPreference === 'balcao'
                        ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                        : { borderColor: '#e5e5e5', color: '#666' }
                    }
                  >
                    {t('closingPaymentSheet.vou_pagar_no_balcao')}
                  </button>
                  <button
                    onClick={() => setCashDeliveryPreference('mesa')}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold border"
                    style={
                      cashDeliveryPreference === 'mesa'
                        ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                        : { borderColor: '#e5e5e5', color: '#666' }
                    }
                  >
                    {t('closingPaymentSheet.atendente_vem_a_mesa')}
                  </button>
                </div>
              </div>
            )}

            {paymentMethod === 'pix' && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                {t('closingPaymentSheet.se_o_restaurante_tiver')}
              </p>
            )}
            {paymentMethod === 'cartao' && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                {t('closingPaymentSheet.o_garcom_vai_levar')}
              </p>
            )}
          </>
        )}

        {askSplitMode && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              {t('closingPaymentSheet.essa_mesa_teve_mais')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setCashbackSplitMode('por_pedido')}
                className="w-full py-2.5 rounded-xl text-xs text-left px-3 border"
                style={
                  cashbackSplitMode === 'por_pedido'
                    ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                    : { borderColor: '#e5e5e5', color: '#374151' }
                }
              >
                {t('closingPaymentSheet.cada_pessoa_recebe_o')}
              </button>
              <button
                onClick={() => setCashbackSplitMode('pagador')}
                className="w-full py-2.5 rounded-xl text-xs text-left px-3 border"
                style={
                  cashbackSplitMode === 'pagador'
                    ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                    : { borderColor: '#e5e5e5', color: '#374151' }
                }
              >
                {t('closingPaymentSheet.so_pra_mim_ja')}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

        <div className="flex gap-2 mt-1">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {isSubmitting ? 'Enviando...' : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
