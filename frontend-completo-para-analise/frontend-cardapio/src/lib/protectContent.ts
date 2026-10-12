// Bloqueios de "ações indesejadas" no app do cliente (pedido do Felipe, 03/10):
//  - botão direito (contextmenu) e toque longo (que no celular dispara o mesmo
//    evento "contextmenu") — some o menu "Salvar imagem / Abrir em nova guia";
//  - arrastar imagem/link para fora da página;
//  - copiar, recortar e selecionar texto das páginas;
//  - abrir link em nova guia por Ctrl/Cmd/Shift+clique ou clique do meio;
//  - atalhos de salvar página / ver código-fonte.
//
// EXCEÇÃO CONSCIENTE: campos de digitação (input, textarea, contenteditable)
// continuam funcionando normalmente — senão ninguém consegue digitar/colar o
// próprio telefone, e-mail, endereço, cupom ou código no login e no checkout.
//
// HONESTIDADE TÉCNICA: isto impede o caminho comum (menu do botão direito,
// toque longo, arrastar, selecionar/copiar). Nenhum site consegue impedir
// captura de tela nem quem abre as ferramentas do navegador e baixa o arquivo
// — é dissuasão, não proteção absoluta.

function isEditable(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

export function installContentProtection(): void {
  if (typeof document === 'undefined') return;
  const w = window as unknown as { __contentProtectionInstalled?: boolean };
  if (w.__contentProtectionInstalled) return;
  w.__contentProtectionInstalled = true;

  const opts: AddEventListenerOptions = { capture: true };
  const block = (e: Event) => e.preventDefault();

  // Botão direito + toque longo (mobile dispara "contextmenu" no toque longo).
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (!isEditable(e.target)) e.preventDefault();
    },
    opts,
  );

  // Copiar/recortar e seleção de texto fora dos campos de digitação.
  document.addEventListener('copy', (e) => !isEditable(e.target) && block(e), opts);
  document.addEventListener('cut', (e) => !isEditable(e.target) && block(e), opts);
  document.addEventListener('selectstart', (e) => !isEditable(e.target) && block(e), opts);

  // Arrastar imagem/link/texto.
  document.addEventListener('dragstart', block, opts);

  // Clique do meio (abre link em nova guia).
  document.addEventListener(
    'auxclick',
    (e) => {
      if ((e as MouseEvent).button === 1) e.preventDefault();
    },
    opts,
  );

  // Ctrl/Cmd/Shift + clique em link (nova guia/janela).
  document.addEventListener(
    'click',
    (e) => {
      const me = e as MouseEvent;
      if (!(me.ctrlKey || me.metaKey || me.shiftKey)) return;
      if ((e.target as Element | null)?.closest?.('a[href]')) e.preventDefault();
    },
    opts,
  );

  // Atalhos: salvar página (Ctrl+S), ver código-fonte (Ctrl+U), copiar tudo fora de campos.
  document.addEventListener(
    'keydown',
    (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'u') e.preventDefault();
      if ((k === 'c' || k === 'x' || k === 'a') && !isEditable(e.target)) e.preventDefault();
    },
    opts,
  );
}
