// Cor de destaque do restaurante (primaryColor) usada como TEXTO/ÍCONE no tema escuro.
// Cores escuras da marca (roxo, azul-marinho, preto…) somem sobre o fundo escuro;
// aqui elas são clareadas (misturadas com branco) até atingir contraste mínimo
// ~4,5:1 contra a superfície escura (#1E1E20). Cores já claras passam intactas.
// Usar só em texto/ícone/contorno — fundos de botão continuam com a cor original.
const MIN_LUMINANCE_ON_DARK = 0.24;

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) digits = digits.split('').map((c) => c + c).join('');
  const n = parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function accentOnDark(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  if (luminance(rgb) >= MIN_LUMINANCE_ON_DARK) return hex;
  for (let t = 0.1; t <= 1; t += 0.05) {
    const mixed = rgb.map((v) => Math.round(v + (255 - v) * t)) as [number, number, number];
    if (luminance(mixed) >= MIN_LUMINANCE_ON_DARK) return toHex(mixed);
  }
  return '#FFFFFF';
}
