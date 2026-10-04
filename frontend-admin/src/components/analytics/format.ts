// Formatação do módulo de Análise. `null`/`undefined` = "Sem dados".
export const NO_DATA = 'Sem dados';

export function brl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_DATA;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function int(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_DATA;
  return value.toLocaleString('pt-BR');
}

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
