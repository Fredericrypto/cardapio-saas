// Sanitização de texto livre (nome/descrição de cargo etc.):
//  - remove tags HTML e qualquer "<" / ">" restante (neutraliza <script>, <img onerror=…>);
//  - remove caracteres de controle e zero-width;
//  - colapsa espaços e faz trim.
// O React já escapa na renderização; isto é defesa em profundidade para que
// nada perigoso seja PERSISTIDO (e-mails, exportações, outros clientes).
export function sanitizeText(input: string): string {
  let out = input;
  // Repete até estabilizar: "<<script>script>" não pode sobrar nada após uma passada.
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/<[^>]*>/g, '');
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/[<>]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202F\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
