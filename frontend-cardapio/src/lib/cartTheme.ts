// Classes do carrinho (CartPage e components/cart/*), compostas a partir dos
// tokens do Menu (lib/menuTheme.ts) — mesmo par claro/escuro em tudo, sem
// depender do remapeamento global de `bg-white`/`text-gray-*` do index.css.
//
// Cada constante é uma string COMPLETA de classes (o Tailwind só gera o que
// encontra escrito por extenso no código-fonte). A cor do restaurante nunca
// entra aqui: vai sempre inline, via `tenant.primaryColor`.
import {
  MENU_BORDER,
  MENU_DIVIDER,
  
  MENU_TEXT,
  MENU_TEXT_BODY,
  MENU_TEXT_MUTED,
  MENU_TEXT_SOFT,
} from './menuTheme';

/** Container do carrinho: o MESMO do Menu (largura, recuo lateral). */
export const CART_CONTAINER = 'w-full max-w-7xl mx-auto px-4 md:px-8';

/** Cartão de um bloco do carrinho (cupom, formulário, pagamento, revisão). */
export const CART_CARD = `rounded-2xl border p-4 md:p-6 bg-[#FFFFFF]/55 dark:bg-[#161617]/60 backdrop-blur-md ${MENU_DIVIDER}`;

/** Painel lateral (resumo/pagamento): tinta diferente do fundo e dos cartões. */
export const CART_PANEL =
  'rounded-3xl border p-5 md:p-6 bg-[#FFFFFF]/60 dark:bg-[#161617]/65 backdrop-blur-xl border-[#E5E7EB] dark:border-white/10';

/** Divisor fino entre as linhas de item (aplicado em `divide-y`). */
export const CART_DIVIDE = 'divide-y divide-[#E5E7EB] dark:divide-white/10';

/** Borda fina de separação (border-t / border-b). */
export const CART_RULE = `border-t ${MENU_DIVIDER}`;

/** Título de página / valores de destaque. */
export const CART_TITLE = `font-display font-bold ${MENU_TEXT}`;

/** Rótulo pequeno de seção. */
export const CART_SECTION_LABEL = `text-xs font-semibold ${MENU_TEXT_SOFT}`;

// ---- Campos: contorno fino + rótulo pequeno DENTRO, acima do valor ---------

/** Caixa do campo (contorno fino, foco e erro visíveis nos dois temas). */
export const CART_FIELD_BOX =
  'block rounded-xl border px-3.5 pt-2 pb-2 transition-colors bg-transparent ' +
  'border-[#D1D5DB] dark:border-white/20 ' +
  'focus-within:border-[#6B7280] dark:focus-within:border-white/50';

/** Mesma caixa em estado de erro. */
export const CART_FIELD_BOX_INVALID =
  'block rounded-xl border px-3.5 pt-2 pb-2 transition-colors bg-transparent ' +
  'border-red-500 dark:border-red-400 focus-within:border-red-600 dark:focus-within:border-red-300';

/** Rótulo pequeno dentro da caixa. */
export const CART_FIELD_LABEL = `block text-[11px] leading-4 font-medium ${MENU_TEXT_MUTED}`;

/** Input/textarea/select dentro da caixa (sem borda própria). */
export const CART_FIELD_INPUT =
  'block w-full min-w-0 bg-transparent p-0 text-sm outline-none appearance-none ' +
  'text-[#111827] dark:text-[#E3E2E6] ' +
  'placeholder:text-[#9CA3AF] dark:placeholder:text-[#8E918F]';

/** Opções de <select> legíveis nos dois temas. */
export const CART_SELECT_OPTION =
  '[&_option]:bg-white [&_option]:text-[#111827] dark:[&_option]:bg-[#1E1E20] dark:[&_option]:text-[#E3E2E6]';

// ---- Segmented control (tipo de pedido, gorjeta, crédito/débito) -----------

export const CART_SEGMENT_TRACK =
  'flex gap-1 p-1 rounded-xl border bg-[#F3F4F6] dark:bg-white/5 border-[#E5E7EB] dark:border-white/10';

export const CART_SEGMENT_BASE =
  'w-full flex-1 min-w-0 py-2 px-1.5 rounded-lg text-xs font-semibold leading-tight text-center break-words transition-colors';

export const CART_SEGMENT_ACTIVE = 'text-white ring-1 ring-black/5 dark:ring-white/15';

export const CART_SEGMENT_INACTIVE =
  'text-[#6B7280] hover:bg-black/5 hover:text-[#111827] dark:text-[#C4C7C5] dark:hover:bg-white/10 dark:hover:text-white';

// ---- Controles pequenos -----------------------------------------------------

/** Pílula com contorno do controle de quantidade (o ÚNICO elemento em pílula). */
export const CART_QTY_PILL =
  'inline-flex items-center rounded-full border px-1 border-[#D1D5DB] dark:border-white/25';

export const CART_QTY_BUTTON =
  'w-8 h-8 rounded-full flex items-center justify-center transition-colors ' +
  'text-[#374151] hover:bg-black/5 dark:text-[#C4C7C5] dark:hover:bg-white/10 dark:hover:text-white';

/** Botão de ícone discreto (remover, voltar). Cantos arredondados, nunca círculo. */
export const CART_ICON_BUTTON =
  'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ' +
  'text-[#6B7280] hover:bg-black/5 hover:text-[#111827] dark:text-[#C4C7C5] dark:hover:bg-white/10 dark:hover:text-white';

export const CART_ICON_BUTTON_DANGER =
  'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ' +
  'text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 dark:text-[#8E918F] dark:hover:bg-red-500/10 dark:hover:text-red-300';

/** Botão secundário com contorno (cancelar, chamar garçom...). */
export const CART_OUTLINE_BUTTON =
  'w-full py-2.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ' +
  'border-[#D1D5DB] text-[#374151] hover:bg-black/5 dark:border-white/20 dark:text-[#C4C7C5] dark:hover:bg-white/10';

// ---- Textos -----------------------------------------------------------------

export const CART_TEXT = MENU_TEXT;
export const CART_TEXT_SOFT = MENU_TEXT_SOFT;
export const CART_TEXT_BODY = MENU_TEXT_BODY;
export const CART_TEXT_MUTED = MENU_TEXT_MUTED;

/** Texto de erro / aviso / sucesso legíveis nos dois temas. */
export const CART_TEXT_ERROR = 'text-red-600 dark:text-red-300';
export const CART_TEXT_SUCCESS = 'text-green-700 dark:text-green-300';
export const CART_NOTICE_WARN =
  'text-amber-800 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/20';

/** Borda suave de cartão interno (ex.: bloco do endereço confirmado). */
export const CART_INNER_BLOCK = `rounded-xl border bg-[#F9FAFB] dark:bg-[#282A2C] ${MENU_BORDER}`;
