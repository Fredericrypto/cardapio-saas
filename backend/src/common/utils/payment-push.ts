import type { PushPayload } from '../../modules/push/push.service';
import { SCHEDULE_TIMEZONE } from './schedule';

// Push de pagamento Pix (pedido avulso e fechamento de mesa).
//
// Fluxo: ao criar a cobrança, o SERVIDOR envia "Aguardando pagamento · Pague até HH:MM".
// Quando o pagamento é confirmado, o push "Pagamento confirmado" usa o MESMO groupTag e
// SUBSTITUI a notificação anterior na tela do aparelho (uma só, nunca duas empilhadas).
// Por isso o groupTag de "aguardando" e o de "confirmado" saem das MESMAS funções abaixo:
// se um dia divergirem, a substituição para de funcionar sem nenhum erro visível.
//
// NOTA PARA O APP NATIVO (pedido explícito do Felipe): quando o app nativo estiver pronto,
// ele quer o COUNTDOWN em tempo real no próprio push (como o iFood). Em PWA isso é
// impossível com o app fechado: a notificação web não se atualiza sozinha (o service worker
// só roda quando chega um push). Por isso hoje o push traz o HORÁRIO-LIMITE fixo e a
// contagem regressiva em tempo real fica dentro do app, na tela do Pix.

// O sistema inteiro trabalha no fuso do Brasil (ver SCHEDULE_TIMEZONE): não existe fuso por cliente.
// hourCycle 'h23' evita "24:05" na meia-noite que algumas versões do ICU geram com hour12:false.
const CLOCK = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SCHEDULE_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatPaymentDeadline(date: Date): string {
  return CLOCK.format(date);
}

function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

// groupTag do pedido avulso (mesmo valor que o push de "confirmado" já usava).
export function orderPaymentGroupTag(orderId: string): string {
  return `payment-${orderId}`;
}

// groupTag da mesa: por sessão E por cliente (cada pessoa da mesa tem a sua notificação).
export function tablePaymentGroupTag(sessionId: string, customerId: string): string {
  return `payment-session-${sessionId}-${customerId}`;
}

// "Confirmado" substitui a notificação de "aguardando" (mesmo groupTag). Sem renotify, a
// substituição é SILENCIOSA em vários Androids (sem som/vibração) e o cliente não percebe.
export const PAYMENT_CONFIRMED_FLAGS = { renotify: true } as const;

export function buildPaymentPendingPush(params: {
  kind: 'order' | 'table';
  amountCents: number;
  expiresAt: Date;
  url: string;
  groupTag: string;
  icon?: string;
}): PushPayload {
  const amount = formatBRL(params.amountCents);
  const time = formatPaymentDeadline(params.expiresAt);
  const isTable = params.kind === 'table';
  return {
    // Fallback em pt-BR (o PushService troca pelo idioma do cliente via i18n).
    title: 'Aguardando pagamento',
    body: isTable
      ? `Pague ${amount} via Pix até ${time} para fechar sua conta.`
      : `Pague ${amount} via Pix até ${time} para confirmar seu pedido.`,
    i18n: { key: isTable ? 'payment_pending_table' : 'payment_pending_order', params: { amount, time } },
    url: params.url,
    // Mesma categoria do "confirmado": uma única preferência (Perfil > Notificações) controla os dois.
    tag: 'payment_completed',
    groupTag: params.groupTag,
    icon: params.icon,
    // Tocar volta para o app sem navegar: navegar recarregaria a tela do Pix e perderia o QR.
    focusOnly: true,
  };
}
