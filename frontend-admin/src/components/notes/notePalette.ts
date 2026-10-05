// Paleta do mural: cada cor de fundo já traz o texto que combina (o usuário
// ainda pode trocar a cor da fonte separadamente).
export interface Swatch {
  name: string;
  bg: string;
  text: string;
  group: 'pastel' | 'claro' | 'escuro';
}

export const BG_SWATCHES: Swatch[] = [
  { name: 'Amarelo', bg: '#FEF08A', text: '#422006', group: 'pastel' },
  { name: 'Verde', bg: '#BBF7D0', text: '#14532D', group: 'pastel' },
  { name: 'Rosa', bg: '#FBCFE8', text: '#831843', group: 'pastel' },
  { name: 'Azul', bg: '#BFDBFE', text: '#1E3A8A', group: 'pastel' },
  { name: 'Roxo', bg: '#DDD6FE', text: '#4C1D95', group: 'pastel' },
  { name: 'Laranja', bg: '#FED7AA', text: '#7C2D12', group: 'pastel' },
  { name: 'Branco', bg: '#FFFFFF', text: '#1F2937', group: 'claro' },
  { name: 'Cinza claro', bg: '#E5E7EB', text: '#1F2937', group: 'claro' },
  { name: 'Grafite', bg: '#3D3846', text: '#F9FAFB', group: 'escuro' },
  { name: 'Azul escuro', bg: '#1E3A8A', text: '#EFF6FF', group: 'escuro' },
  { name: 'Verde escuro', bg: '#14532D', text: '#F0FDF4', group: 'escuro' },
  { name: 'Vinho', bg: '#7F1D1D', text: '#FEF2F2', group: 'escuro' },
];

export const TEXT_COLORS: { name: string; value: string }[] = [
  { name: 'Preto', value: '#111827' },
  { name: 'Marrom', value: '#422006' },
  { name: 'Azul', value: '#1E3A8A' },
  { name: 'Verde', value: '#14532D' },
  { name: 'Vermelho', value: '#991B1B' },
  { name: 'Roxo', value: '#4C1D95' },
  { name: 'Cinza', value: '#4B5563' },
  { name: 'Branco', value: '#FFFFFF' },
];

export const DEFAULT_NOTE_COLORS = { color: BG_SWATCHES[0].bg, textColor: BG_SWATCHES[0].text };

// Cor de destaque da etiqueta (o #Urgente sempre chama atenção).
export const TAG_STYLES: Record<string, { bg: string; fg: string }> = {
  Geral: { bg: 'rgba(0,0,0,0.08)', fg: 'inherit' },
  Cozinha: { bg: 'rgba(217,119,6,0.18)', fg: 'inherit' },
  Caixa: { bg: 'rgba(37,99,235,0.16)', fg: 'inherit' },
  Urgente: { bg: '#DC2626', fg: '#FFFFFF' },
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
