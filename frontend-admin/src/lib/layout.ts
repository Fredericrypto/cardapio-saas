// Id da área rolável do painel (o <main> do AdminLayout). A janela NÃO rola:
// só esta área. Quem precisar rolar "ao topo" deve usar scrollMainToTop().
export const MAIN_SCROLL_ID = 'admin-main-scroll';

export function scrollMainToTop(behavior: ScrollBehavior = 'smooth'): void {
  document.getElementById(MAIN_SCROLL_ID)?.scrollTo({ top: 0, behavior });
}
