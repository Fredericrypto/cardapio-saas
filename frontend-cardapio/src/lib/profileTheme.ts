// Classes compartilhadas pelas subpáginas da conta do cliente (Meus dados,
// Endereço, Carteira Pix, Cashback, Histórico de pedidos). Montadas sobre
// `menuTheme.ts` para manter a mesma paleta do cardápio: no escuro fundo
// #131314, cards #1E1E20, bordas white/10 e campos white/[0.05].
//
// Cada constante é uma string COMPLETA de classes (o Tailwind só gera o que
// encontra escrito por extenso no código-fonte).


/** Container largo — mesma margem/alinhamento do MenuPage. */
export const PAGE_CONTAINER = 'w-full max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10';

/** Card (nível 1). */
export const PROFILE_CARD = 'bg-[#FFFFFF]/70 dark:bg-[#161617]/70 border border-[#E5E7EB] dark:border-white/10 rounded-2xl';

/** Input / select / textarea. */
export const PROFILE_INPUT =
  'bg-transparent dark:bg-white/[0.03] border border-[#E5E7EB] dark:border-white/10 rounded-xl px-4 py-3 text-sm ' +
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

// ---- Etapa 2: design system das subpáginas (web app) ---------------------

/** Cartão translúcido (vidro): avisos, painéis de apoio, pré-visualizações. */
export const PROFILE_CARD_GLASS =
  'bg-[#FFFFFF]/70 dark:bg-[#161617]/70 border border-[#E5E7EB] dark:border-white/10 rounded-2xl';

/** Rótulo de campo. */
export const PROFILE_LABEL = 'text-xs font-semibold text-[#6B7280] dark:text-[#C4C7C5]';

/** Botão principal (a cor vem inline do restaurante). O anel garante contraste
 *  mesmo quando a cor da marca é escura sobre o fundo escuro. */
export const PROFILE_BTN_PRIMARY = 'glass-btn font-semibold transition';

/** Cartão selecionável (opção de grade): base + estado de hover. */
export const PROFILE_OPTION_CARD =
  'text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.05] disabled:opacity-60';

/** Anel neutro de seleção (a borda colorida do restaurante vai inline). */
export const PROFILE_SELECTED_RING = 'ring-2 ring-black/10 dark:ring-white/25';

/** Botão sólido de alto contraste (ex.: Salvar cupom): escuro no claro; no
 *  escuro vira claro (#E3E2E6) com texto escuro (#131314). Hex fixo, imune ao
 *  remapeamento de `bg-gray-*` do tema global. */
export const PROFILE_BTN_SOLID = 'glass-btn font-semibold transition';
