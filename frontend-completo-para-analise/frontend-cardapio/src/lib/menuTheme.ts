// Paleta única do cardápio do cliente (página do Menu e seus componentes).
//
// Modo claro = as cores originais do app (equivalem a white / gray-50 /
// gray-100 / gray-400 / gray-500 / gray-700 / gray-900 do Tailwind).
// Modo escuro = a paleta oficial do projeto (docs/TEMA.md): fundo #131314,
// superfícies #1E1E20, nível 2 #282A2C, texto #E3E2E6, secundário #C4C7C5 e
// terciário #8E918F.
//
// Por que hex explícito em vez de `bg-white` / `text-gray-*`: essas classes
// podem ser remapeadas pelo tema global (index.css) e o resultado dependeria
// da ordem das regras. Com o hex nos dois modos o par claro/escuro é
// determinístico e nenhuma superfície fica branca por acidente no escuro.
//
// Cada constante é uma string COMPLETA de classes (o Tailwind só gera o que
// encontra escrito por extenso no código-fonte — mesmo padrão de
// lib/uiClasses.ts e CLOSED_MUTED_CLASS).

/** Fundo da página (atrás de tudo). */
export const MENU_PAGE_BG = 'bg-[#FFFFFF] dark:bg-[#131314]';

/** Cards e painéis (nível 1). */
export const MENU_SURFACE = 'bg-[#FFFFFF] dark:bg-[#1E1E20]';

/** Blocos internos de um card (campos, cartão de entrega, chips). */
export const MENU_SURFACE_SUBTLE = 'bg-[#F9FAFB] dark:bg-[#282A2C]';

/** Cor de borda suave (só define a COR; a largura vem de `border`). */
export const MENU_BORDER = 'border-[#F3F4F6] dark:border-white/10';

/** Divisores um pouco mais marcados que a borda dos cards. */
export const MENU_DIVIDER = 'border-[#E5E7EB] dark:border-white/10';

/** Texto principal (títulos, preços). */
export const MENU_TEXT = 'text-[#111827] dark:text-[#E3E2E6]';

/** Texto secundário forte (rótulos, cabeçalhos de seção). */
export const MENU_TEXT_SOFT = 'text-[#374151] dark:text-[#C4C7C5]';

/** Texto corrido de apoio (informações do estabelecimento). */
export const MENU_TEXT_BODY = 'text-[#6B7280] dark:text-[#C4C7C5]';

/** Texto terciário (descrições, legendas, ícones discretos). */
export const MENU_TEXT_MUTED = 'text-[#9CA3AF] dark:text-[#8E918F]';

/** Quase invisível (preço riscado, placeholder de foto). */
export const MENU_TEXT_FAINT = 'text-[#D1D5DB] dark:text-[#5F6368]';

// ---- Cabeçalho da loja (MenuHeader e TableMenuHeader) -------------------
//
// Celular: banner + "sheet" que sobe sobre ele, sem borda (desenho original).
// Desktop (md+): UM único cartão arredondado e com borda que encapsula banner,
// logo, nome, status e informações — em vez de dois blocos soltos.

/** Casca do cabeçalho: só aparece como cartão a partir de md. */
export const MENU_HEADER_SHELL = `md:rounded-3xl md:border md:shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${MENU_BORDER}`;

/** Base do banner (as alturas ficam em cada cabeçalho). Cantos de cima
 *  acompanham a casca no desktop. */
export const MENU_BANNER_BASE = 'relative w-full overflow-hidden md:rounded-t-3xl';

/** "Sheet" do cabeçalho. No celular segue a cor da página (sem degrau no
 *  escuro); no desktop assume a cor de superfície do cartão. */
export const MENU_HEADER_SHEET =
  'relative z-10 -mt-6 md:mt-0 rounded-t-3xl md:rounded-t-none md:rounded-b-3xl ' +
  'bg-[#FFFFFF] dark:bg-[#131314] md:bg-[#FFFFFF] dark:md:bg-[#1E1E20] ' +
  'px-4 pt-3.5 pb-1 md:px-6 md:py-5';
