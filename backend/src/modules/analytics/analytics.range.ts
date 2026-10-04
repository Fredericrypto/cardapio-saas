import { BadRequestException } from '@nestjs/common';
import type { AnalyticsPeriod, AnalyticsRange, Granularity } from './analytics.types';

export const ANALYTICS_TZ = 'America/Sao_Paulo';

// Brasília está em UTC-3 o ano todo desde 2019 (fim do horário de verão). Os
// limites dos períodos usam esse offset fixo; o agrupamento por hora/dia/mês é
// feito no SQL com `AT TIME ZONE 'America/Sao_Paulo'` (que conhece o histórico).
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function startOfDayBrt(ms: number): number {
  const shifted = new Date(ms - BRT_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + BRT_OFFSET_MS;
}
function startOfMonthBrt(ms: number, monthsBack = 0): number {
  const shifted = new Date(ms - BRT_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - monthsBack, 1) + BRT_OFFSET_MS;
}
const DAY = 24 * 60 * 60 * 1000;

const PERIODS: AnalyticsPeriod[] = ['hora', 'dia', 'semana', 'mes', 'ano', '5anos', 'custom'];

function parseDateOnly(value: string | undefined, field: string): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`"${field}" precisa estar no formato AAAA-MM-DD.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new BadRequestException(`"${field}" não é uma data válida.`);
  }
  return Date.UTC(y, m - 1, d) + BRT_OFFSET_MS;
}

export function resolveRange(
  periodRaw: string | undefined,
  fromRaw?: string,
  toRaw?: string,
  nowMs: number = Date.now(),
): AnalyticsRange {
  const period = (periodRaw ?? 'semana') as AnalyticsPeriod;
  if (!PERIODS.includes(period)) {
    throw new BadRequestException(`Período inválido. Use: ${PERIODS.join(', ')}.`);
  }
  let from: number;
  let to: number = nowMs;
  let granularity: Granularity;

  switch (period) {
    case 'hora': // hoje, hora a hora
      from = startOfDayBrt(nowMs);
      granularity = 'hour';
      break;
    case 'dia': // últimas 24h
      from = nowMs - DAY;
      granularity = 'hour';
      break;
    case 'semana': // últimos 7 dias (hoje incluído)
      from = startOfDayBrt(nowMs) - 6 * DAY;
      granularity = 'day';
      break;
    case 'mes': // últimos 30 dias (hoje incluído)
      from = startOfDayBrt(nowMs) - 29 * DAY;
      granularity = 'day';
      break;
    case 'ano': // 12 meses (mês atual incluído)
      from = startOfMonthBrt(nowMs, 11);
      granularity = 'month';
      break;
    case '5anos':
      from = startOfMonthBrt(nowMs, 59);
      granularity = 'month';
      break;
    default: {
      from = parseDateOnly(fromRaw, 'from');
      const toDayStart = parseDateOnly(toRaw, 'to');
      if (toDayStart < from) throw new BadRequestException('A data final não pode ser anterior à inicial.');
      to = Math.min(toDayStart + DAY, nowMs); // fim inclusivo, nunca no futuro
      if (to <= from) throw new BadRequestException('O período escolhido está no futuro.');
      const days = (to - from) / DAY;
      if (days > 366 * 10) throw new BadRequestException('Período personalizado máximo: 10 anos.');
      granularity = days <= 2 ? 'hour' : days <= 93 ? 'day' : 'month';
    }
  }
  return {
    period,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    granularity,
    timezone: ANALYTICS_TZ,
  };
}
