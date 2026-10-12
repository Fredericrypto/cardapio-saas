// Classes compartilhadas pelas subpáginas da conta do cliente (Meus dados,
// Endereço, Carteira Pix, Cashback, Histórico de pedidos). Montadas sobre
// `menuTheme.ts` para manter a mesma paleta do cardápio: no escuro fundo
// #131314, cards #1E1E20, bordas white/10 e campos white/[0.05].
//
// Cada constante é uma string COMPLETA de classes (o Tailwind só gera o que
// encontra escrito por extenso no código-fonte).
import { MENU_SURFACE, MENU_BORDER } from './menuTheme';

/** Container largo — mesma margem/alinhamento do MenuPage. */
export const PAGE_CONTAINER = 'w-full max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10';

/** Card (nível 1). */
export const PROFILE_CARD = `${MENU_SURFACE} border ${MENU_BORDER} rounded-2xl`;

/** Input / select / textarea. */
export const PROFILE_INPUT =
  'bg-white dark:bg-white/[0.05] border border-[#E5E7EB] dark:border-white/10 rounded-xl px-4 py-3 text-sm ' +
  'text-[#111827] dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none ' +
  'focus:border-gray-400 dark:focus:border-white/30 dark:[color-scheme:dark]';

/** Botão secundário (contorno). */
export const PROFILE_BTN_OUTLINE =
  'border border-[#E5E7EB] dark:border-white/10 text-[#4B5563] dark:text-[#C4C7C5] ' +
  'hover:bg-black/[0.03] dark:hover:bg-white/5 transition-colors';

/** Botão destrutivo (contorno vermelho). */
export const PROFILE_BTN_DANGER =
  'border border-red-100 dark:border-red-500/30 text-red-500 dark:text-red-400 ' +
  'hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors';
