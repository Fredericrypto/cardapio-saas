// Classes da página de detalhe da promoção, compostas a partir dos tokens do
// Menu (lib/menuTheme.ts) — mesmo par claro/escuro do resto do cardápio.
//
// Cada constante é uma string COMPLETA de classes (o Tailwind só gera o que
// encontra escrito por extenso). A cor do restaurante nunca entra aqui: vai
// inline (`tenant.primaryColor`) ou pelas variáveis CSS `--brand` (cor crua) e
// `--accent` (cor legível no tema atual, de useAccentColor), definidas na raiz
// da página.
import { MENU_SURFACE, MENU_DIVIDER } from './menuTheme';

/** Anel de foco visível, na cor de destaque legível nos dois temas. */
export const PROMO_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-[#FFFFFF] dark:focus-visible:ring-offset-[#131314]';

/** Botão principal: cor do restaurante no claro; sólido claro no escuro. */
export const PROMO_PRIMARY_BTN =
  'w-full py-3.5 md:py-4 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 text-[#FFFFFF] bg-[var(--brand)] ring-1 ring-black/5 ' +
  'dark:bg-[#E3E2E6] dark:text-[#131314] dark:ring-white/20 shadow-sm hover:brightness-110 dark:hover:brightness-95 ' +
  `active:brightness-95 transition ${PROMO_FOCUS}`;

/** Botão de texto discreto (ação secundária). */
export const PROMO_LINK_BTN =
  `inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.08] ${PROMO_FOCUS}`;

/** Cartão de apoio (benefício, condições). */
export const PROMO_CARD = `rounded-2xl border ${MENU_SURFACE} ${MENU_DIVIDER}`;

/** Cartão de sucesso (economia calculada). */
export const PROMO_SUCCESS_CARD =
  'rounded-2xl border bg-green-50 border-green-100 dark:bg-green-500/10 dark:border-green-400/20';

export const PROMO_SUCCESS_TEXT = 'text-green-700 dark:text-green-300';
