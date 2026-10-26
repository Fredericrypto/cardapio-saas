// Pedido de login (modal global): decisões PURAS, sem React — cobertas por teste.
//
// O modal NÃO é um segundo mecanismo de autenticação: só decide se/qual aviso mostrar e leva
// para a MESMA rota de login que o resto do app usa (`/:slug/conta-cliente/entrar?redirect=`).
import type { TranslationKey } from '../i18n/dictionaries/pt-BR';
import { safeRedirectPath } from './safeRedirect';

/** Por que a ação precisa de conta. 'session' = o servidor recusou o token (sessão vencida). */
export type LoginPromptReason = 'order' | 'promotion' | 'session';

/**
 *  none        sem pedido de login pendente;
 *  wait        a sessão ainda está sendo confirmada: não mostra nada (nunca chamar de "convidado"
 *              quem pode estar logado);
 *  obsolete    já existe conta: o pedido de login perdeu o sentido (descartar em silêncio);
 *  unconfirmed existe token mas o servidor não deixou confirmar (5xx/rede/429): NÃO é "faça login";
 *  login       sem token e sem conta: pedir login.
 */
export type LoginPromptView = 'none' | 'wait' | 'obsolete' | 'unconfirmed' | 'login';

export interface LoginPromptState {
  reason: LoginPromptReason | null;
  isLoading: boolean;
  hasToken: boolean;
  hasCustomer: boolean;
  authError: boolean;
}

export function resolveLoginPromptView(state: LoginPromptState): LoginPromptView {
  if (!state.reason) return 'none';
  if (state.hasCustomer) return 'obsolete';
  if (state.isLoading) return 'wait';
  if (state.hasToken) return state.authError ? 'unconfirmed' : 'wait';
  return 'login';
}

export interface LoginPromptCopy {
  title: TranslationKey;
  message: TranslationKey;
}

const COPY: Record<LoginPromptReason, LoginPromptCopy> = {
  order: { title: 'loginRequired.title.order', message: 'loginRequired.message.order' },
  promotion: { title: 'loginRequired.title.promotion', message: 'loginRequired.message.promotion' },
  session: { title: 'loginRequired.title.session', message: 'loginRequired.message.session' },
};

export function loginPromptCopy(reason: LoginPromptReason): LoginPromptCopy {
  return COPY[reason];
}

/** Rota de login com retorno. O destino passa pelo mesmo saneador usado pela tela de login. */
export function buildLoginUrl(slug: string, returnTo: string): string {
  return `/${slug}/conta-cliente/entrar?redirect=${encodeURIComponent(safeRedirectPath(returnTo, slug))}`;
}
