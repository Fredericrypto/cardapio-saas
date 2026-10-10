// Baixa o logo do estabelecimento e devolve PNG (aceita WebP, SVG raster, etc.:
// passa por um canvas). Qualquer falha (CORS, 404, formato) vira null e o PDF
// sai só com o nome — o relatório nunca deixa de ser gerado por causa do logo.
export async function loadLogoForPdf(url: string | null | undefined): Promise<{ bytes: Uint8Array; kind: 'png' } | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const maxSide = 400; // basta para um logo de 46pt, mesmo impresso
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'png' };
  } catch {
    return null;
  }
}
