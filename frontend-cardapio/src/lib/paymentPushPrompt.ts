import type { PushPermissionState } from '../hooks/usePushNotifications';

// Decide o que a tela do Pix mostra sobre os avisos de pagamento (push):
//  - hidden:         sem suporte do navegador ou sem login -> nada
//  - enable:         permissão ainda não pedida -> botão (pedir sem gesto do usuário é ignorado/bloqueado)
//  - auto_subscribe: permissão já concedida, ainda sem inscrição -> inscreve sozinho, sem pedir nada
//  - active:         inscrito -> só confirma
//  - blocked:        negado no navegador -> orienta a liberar nas configurações do site
export type PaymentPushPromptMode = 'hidden' | 'enable' | 'auto_subscribe' | 'active' | 'blocked';

export function decidePaymentPushPrompt(input: {
  supported: boolean;
  hasToken: boolean;
  permission: PushPermissionState;
  isSubscribed: boolean;
}): PaymentPushPromptMode {
  if (!input.supported || !input.hasToken || input.permission === 'unsupported') return 'hidden';
  if (input.permission === 'denied') return 'blocked';
  if (input.permission === 'granted') return input.isSubscribed ? 'active' : 'auto_subscribe';
  return 'enable';
}
