import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/dictionaries/pt-BR';
import { checkPixStatus, payOrderWithCard } from '../../lib/menu-api';
import type { CardRejectionCode, PayCardResult } from '../../lib/menu-api';
import {
  loadMercadoPagoSdk,
  loadMercadoPagoSecurity,
  mercadoPagoLocale,
  readMercadoPagoDeviceId,
} from '../../lib/mercadopagoSdk';
import type { BrickController, CardPaymentFormData } from '../../lib/mercadopagoSdk';
import { formatBRL } from '../../lib/cartFormat';
import {
  CART_CARD,
  CART_NOTICE_WARN,
  CART_TEXT,
  CART_TEXT_BODY,
  CART_TEXT_ERROR,
  CART_TEXT_MUTED,
  CART_TITLE,
} from '../../lib/cartTheme';
import type { CreatedOrder, Tenant } from '../../types';

const POLL_INTERVAL_MS = 3000;
const MAX_INSTALLMENTS = 1; // só à vista

type Phase = 'form' | 'challenge' | 'confirming' | 'cancelled';

interface CardPaymentPanelProps {
  tenant: Tenant;
  order: CreatedOrder;
  /** Valor só para EXIBIR (o backend sempre cobra o total gravado no pedido). */
  displayAmount: number;
  onConfirmed: () => void;
  onExpired: () => void;
  onBackToMenu: () => void;
}

const REJECTION_KEYS: Record<CardRejectionCode, TranslationKey> = {
  insufficient_funds: 'cartPayment.reject.insufficient_funds',
  bad_card_data: 'cartPayment.reject.bad_card_data',
  call_issuer: 'cartPayment.reject.call_issuer',
  card_disabled: 'cartPayment.reject.card_disabled',
  max_attempts: 'cartPayment.reject.max_attempts',
  duplicated: 'cartPayment.reject.duplicated',
  high_risk: 'cartPayment.reject.high_risk',
  invalid_installments: 'cartPayment.reject.invalid_installments',
  other: 'cartPayment.reject.other',
};

const BLOCK_KEYS: Record<string, TranslationKey> = {
  not_card: 'cartPayment.blocked.not_card',
  already_paid: 'cartPayment.blocked.already_paid',
  not_awaiting: 'cartPayment.blocked.not_awaiting',
  expired: 'cartPayment.blocked.expired',
  in_flight: 'cartPayment.blocked.in_flight',
  too_many_attempts: 'cartPayment.blocked.too_many_attempts',
};

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Lê { code } de um erro do axios sem depender do tipo dele.
function errorCode(err: unknown): string | null {
  const data = (err as { response?: { data?: { code?: unknown } } })?.response?.data;
  return typeof data?.code === 'string' ? data.code : null;
}

// Tela de pagamento por CARTÃO (Mercado Pago, Card Payment Brick), mostrada
// depois que o pedido é criado em "aguardando pagamento".
//
// SEGURANÇA: o número, a validade e o CVV só existem dentro dos campos seguros
// do SDK. Daqui só sai o card token (uso único) para o backend, que cobra o
// valor GRAVADO no pedido — este componente nunca manda valor.
export function CardPaymentPanel({
  tenant,
  order,
  displayAmount,
  onConfirmed,
  onExpired,
  onBackToMenu,
}: CardPaymentPanelProps) {
  const { t, language } = useI18n();
  const [phase, setPhase] = useState<Phase>('form');
  const [brickKey, setBrickKey] = useState(0);
  const [sdkReady, setSdkReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<{ url: string; creq: string } | null>(null);
  const [msRemaining, setMsRemaining] = useState(() =>
    order.pixExpiresAt ? new Date(order.pixExpiresAt).getTime() - Date.now() : 0,
  );

  const settledRef = useRef(false);
  const phaseRef = useRef<Phase>('form');
  const controllerRef = useRef<BrickController | null>(null);
  const challengeFormRef = useRef<HTMLFormElement | null>(null);
  const containerId = `mp-card-brick-${order.id}`;
  const publicKey = tenant.mercadoPagoPublicKey ?? '';
  const brickActive = phase === 'form';

  const settle = useCallback((fn: () => void) => {
    if (settledRef.current) return;
    settledRef.current = true;
    fn();
  }, []);

  const rejectionText = useCallback(
    (code: CardRejectionCode | null | undefined) => t(REJECTION_KEYS[code ?? 'other']),
    [t],
  );

  // Resultado de uma tentativa de pagamento (resposta do backend).
  const handleResult = useCallback(
    (result: PayCardResult): 'ok' | 'retry' => {
      setAttemptsLeft(result.attemptsLeft);
      if (result.status === 'approved') {
        setPhase('confirming');
        settle(onConfirmed);
        return 'ok';
      }
      if (result.status === 'processing') {
        if (result.threeDs) {
          setChallenge({ url: result.threeDs.externalResourceUrl, creq: result.threeDs.creq });
          setPhase('challenge');
        } else {
          setPhase('confirming'); // em análise: aguarda o status pelo polling
        }
        return 'ok';
      }
      // rejected
      if (result.orderCancelled) {
        setPhase('cancelled');
        return 'ok';
      }
      setErrorText(rejectionText(result.rejectionCode));
      return 'retry';
    },
    [onConfirmed, rejectionText, settle],
  );

  // Callbacks sempre na versão mais recente SEM entrar nas dependências dos
  // efeitos: o Brick não pode ser remontado (perderia o que a pessoa digitou)
  // só porque a tela-mãe renderizou de novo com funções novas.
  const latest = useRef({ handleResult, rejectionText, t, onConfirmed, onExpired });
  useEffect(() => {
    latest.current = { handleResult, rejectionText, t, onConfirmed, onExpired };
    phaseRef.current = phase;
  });

  // Contador de 1 em 1 segundo; ao zerar, expira na tela sem esperar o poll.
  useEffect(() => {
    if (!order.pixExpiresAt) return;
    const expiresAtMs = new Date(order.pixExpiresAt).getTime();
    const interval = setInterval(() => setMsRemaining(expiresAtMs - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [order.pixExpiresAt]);

  useEffect(() => {
    if (order.pixExpiresAt && msRemaining <= 0) settle(() => latest.current.onExpired());
  }, [msRemaining, order.pixExpiresAt, settle]);

  // Monta o Card Payment Brick (e desmonta ao sair do formulário).
  useEffect(() => {
    if (!brickActive) return;
    let disposed = false;
    setSdkReady(false);
    setLoadFailed(false);
    loadMercadoPagoSecurity();

    void (async () => {
      try {
        const MercadoPago = await loadMercadoPagoSdk();
        if (disposed) return;
        const mp = new MercadoPago(publicKey, { locale: mercadoPagoLocale(language) });
        const controller = await mp.bricks().create('cardPayment', containerId, {
          initialization: { amount: displayAmount },
          customization: {
            visual: {
              style: { theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' },
            },
            paymentMethods: { minInstallments: 1, maxInstallments: MAX_INSTALLMENTS },
          },
          callbacks: {
            onReady: () => {
              if (!disposed) setSdkReady(true);
            },
            onSubmit: async (formData: CardPaymentFormData) => {
              setErrorText(null);
              try {
                const result = await payOrderWithCard(tenant.id, order.id, {
                  token: formData.token,
                  paymentMethodId: formData.payment_method_id,
                  issuerId: formData.issuer_id != null ? String(formData.issuer_id) : undefined,
                  installments: MAX_INSTALLMENTS,
                  payerEmail: formData.payer?.email,
                  identificationType: formData.payer?.identification?.type,
                  identificationNumber: formData.payer?.identification?.number,
                  deviceId: readMercadoPagoDeviceId(),
                });
                // Recusado: rejeita a promessa para o Brick liberar o formulário.
                if (latest.current.handleResult(result) === 'retry') throw new Error('rejected');
              } catch (err) {
                const code = errorCode(err);
                if (code && code in BLOCK_KEYS) {
                  setErrorText(latest.current.t(BLOCK_KEYS[code]));
                } else if (code === 'bad_card_data') {
                  setErrorText(latest.current.rejectionText('bad_card_data'));
                } else if (!(err instanceof Error && err.message === 'rejected')) {
                  setErrorText(latest.current.t('cartPayment.requestError'));
                }
                throw err;
              }
            },
            onError: () => {
              // Erro de validação do próprio formulário do Brick (campo inválido):
              // ele já mostra a mensagem no campo — nada a fazer aqui.
            },
          },
        });
        if (disposed) {
          controller.unmount();
          return;
        }
        controllerRef.current = controller;
      } catch {
        if (!disposed) setLoadFailed(true);
      }
    })();

    return () => {
      disposed = true;
      controllerRef.current?.unmount();
      controllerRef.current = null;
    };
    // `brickKey` força remontar o formulário depois de uma recusa pós-3DS.
  }, [brickActive, brickKey, containerId, displayAmount, language, order.id, publicKey, tenant.id]);

  // Envia o desafio 3DS para o iframe assim que ele aparece.
  useEffect(() => {
    if (phase === 'challenge' && challenge) challengeFormRef.current?.submit();
  }, [phase, challenge]);

  // Consulta o status a cada poucos segundos: pagamento aprovado depois do
  // 3DS/da análise, recusa pós-3DS, cancelamento e expiração.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (settledRef.current) return;
      try {
        const result = await checkPixStatus(tenant.id, order.id);
        if (result.status === 'pendente' || result.status === 'confirmado') {
          settle(() => latest.current.onConfirmed());
        } else if (result.status === 'cancelado') {
          const alreadyExpired = !result.pixExpiresAt || new Date(result.pixExpiresAt).getTime() <= Date.now();
          if (alreadyExpired) settle(() => latest.current.onExpired());
          else setPhase('cancelled');
        } else if (result.status === 'aguardando_pagamento' && result.paymentStatus === 'recusado' && phaseRef.current !== 'form') {
          // Recusado depois do desafio 3DS / da análise: volta ao formulário.
          setErrorText(latest.current.rejectionText(result.rejectionCode));
          setChallenge(null);
          setPhase('form');
          setBrickKey((k) => k + 1);
        }
      } catch {
        // Falha de rede pontual: tenta de novo no próximo ciclo.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tenant.id, order.id, settle]);

  if (phase === 'cancelled') {
    return (
      <div className={`w-full max-w-md mx-auto ${CART_CARD} flex flex-col items-center gap-4 text-center`}>
        <p className={`text-sm ${CART_TEXT_BODY}`}>{t('cartPayment.orderCancelled')}</p>
        <button
          type="button"
          onClick={onBackToMenu}
          className="text-white px-5 py-2.5 rounded-xl text-sm font-semibold ring-1 ring-black/5 dark:ring-white/15"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          {t('cartPage.voltar_ao_cardapio')}
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-md mx-auto ${CART_CARD} flex flex-col gap-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={`text-lg ${CART_TITLE}`}>{t('cartPayment.title')}</h1>
          <p className={`text-sm tabular-nums ${CART_TEXT}`}>{formatBRL(displayAmount)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[11px] ${CART_TEXT_MUTED}`}>{t('cartPayment.timeLeft')}</p>
          <p
            className={`font-display text-2xl font-bold tabular-nums ${
              msRemaining < 60000 ? 'text-red-500' : CART_TEXT
            }`}
          >
            {formatCountdown(msRemaining)}
          </p>
        </div>
      </div>

      {errorText && (
        <div role="alert" className={`rounded-xl px-3 py-2.5 text-sm ${CART_NOTICE_WARN}`}>
          <p className={CART_TEXT_ERROR}>{errorText}</p>
          {attemptsLeft !== null && attemptsLeft > 0 && (
            <p className={`mt-1 text-xs ${CART_TEXT_BODY}`}>{t('cartPayment.attemptsLeft', { count: attemptsLeft })}</p>
          )}
        </div>
      )}

      {brickActive && (
        <>
          {!sdkReady && !loadFailed && (
            <p className={`text-sm text-center py-6 ${CART_TEXT_MUTED}`}>{t('cartPayment.loading')}</p>
          )}
          {loadFailed && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className={`text-sm ${CART_TEXT_ERROR}`}>{t('cartPayment.loadError')}</p>
              <button
                type="button"
                onClick={() => setBrickKey((k) => k + 1)}
                className="text-white px-5 py-2.5 rounded-xl text-sm font-semibold ring-1 ring-black/5 dark:ring-white/15"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {t('cartPayment.retry')}
              </button>
            </div>
          )}
          <div id={containerId} />
        </>
      )}

      {phase === 'challenge' && challenge && (
        <div className="flex flex-col gap-3">
          <p className={`text-sm ${CART_TEXT_BODY}`}>{t('cartPayment.challenge')}</p>
          <iframe
            name={`mp-3ds-${order.id}`}
            title={t('cartPayment.challenge')}
            className="w-full h-[28rem] rounded-xl border border-[#E5E7EB] dark:border-white/10 bg-white"
          />
          <form
            ref={challengeFormRef}
            action={challenge.url}
            method="POST"
            target={`mp-3ds-${order.id}`}
            className="hidden"
          >
            <input type="hidden" name="creq" value={challenge.creq} />
          </form>
        </div>
      )}

      {phase === 'confirming' && (
        <p className={`text-sm text-center py-4 ${CART_TEXT_BODY}`}>{t('cartPayment.processing')}</p>
      )}

      <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${CART_TEXT_MUTED}`}>
        <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" className="shrink-0 mt-0.5" />
        {t('cartPayment.secureNote')}
      </p>
    </div>
  );
}
