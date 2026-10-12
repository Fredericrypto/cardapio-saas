import html2canvas from 'html2canvas-pro';

// Exporta um elemento da tela como PNG de verdade — substitui
// window.print() (que abre o diálogo de impressão do navegador e, ao
// "salvar como PDF", o PRÓPRIO NAVEGADOR cola cabeçalho/rodapé com a
// URL da página por cima, sem controle nenhum do app sobre isso).
// html2canvas desenha só o elemento pedido num canvas isolado, então o
// PNG final tem EXATAMENTE o conteúdo do cupom, nada mais.
//
// Usa `html2canvas-pro` (fork mantido do html2canvas), NÃO o
// `html2canvas` original — o Tailwind v4 desse projeto compila as cores
// padrão pra `oklch(...)`, e o html2canvas clássico simplesmente não
// sabe interpretar essa função de cor: ele joga uma exceção ao andar
// pelos estilos computados do elemento, a promise rejeita, e como quem
// chama isso não tinha um catch, o clique no botão não fazia
// literalmente nada (nem erro visível, nem o PNG). html2canvas-pro
// adiciona suporte a oklch/lab/lch, resolvendo isso na raiz.
export async function saveElementAsPng(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Elemento #${elementId} não encontrado na tela.`);
  }

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2, // nitidez maior que 1:1 — texto pequeno de cupom fica legível
    useCORS: true,
  });

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Não foi possível gerar a imagem do cupom.');
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
