import type { NextOpening } from './schedule';
import type { TranslationKey } from '../i18n/dictionaries/pt-BR';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const DAY_NAME_KEYS: Record<string, TranslationKey> = {
  domingo: 'day.name.domingo',
  segunda: 'day.name.segunda',
  terca: 'day.name.terca',
  quarta: 'day.name.quarta',
  quinta: 'day.name.quinta',
  sexta: 'day.name.sexta',
  sabado: 'day.name.sabado',
};
const SHORT_DAY_KEYS: Record<string, TranslationKey> = {
  domingo: 'day.short.domingo',
  segunda: 'day.short.segunda',
  terca: 'day.short.terca',
  quarta: 'day.short.quarta',
  quinta: 'day.short.quinta',
  sexta: 'day.short.sexta',
  sabado: 'day.short.sabado',
};

// Chaves alinhadas com o editor de horários do admin (SettingsPage) —
// getDay() do JS retorna 0 pra domingo, por isso o array começa nele.
const DAY_KEYS = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
];

// Dia da semana no HORÁRIO DE BRASÍLIA (não no fuso do aparelho): quem está
// com o celular em outro fuso vê o mesmo "Hoje" do restaurante.
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function brazilDayIndex(now: Date = new Date()): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now);
  return WEEKDAY_INDEX[short] ?? now.getDay();
}

// "00:00-00:00" (abre == fecha) = aberto 24 horas.
function is24h(open: string, close: string): boolean {
  return open === close;
}

// Só informativo (mostra "Hoje: 18:00 às 23:00" etc.) — QUEM DECIDE se está
// aberto é `getStoreStatus` (storeStatus.ts). Só deve ser exibido com a loja
// ABERTA: com a loja fechada o app mostra a previsão do próximo expediente
// (`formatNextOpening`) e nunca "Hoje: aberto 24h".
export function getTodayHoursLabel(
  openingHours: Record<string, string> | null,
  t: Translate,
  now: Date = new Date(),
): string | null {
  if (!openingHours) return null;
  const key = DAY_KEYS[brazilDayIndex(now)];
  const raw = openingHours[key];
  if (!raw || raw === 'fechado') return t('store.todayClosed');
  const [open, close] = raw.split('-');
  if (!open || !close) return null;
  if (is24h(open, close)) return t('store.todayOpen24h');
  return t('store.todayHours', { open, close });
}

// "Abre Hoje às 18:00" / "Abre Segunda-feira às 09:30" (no idioma escolhido).
export function formatNextOpening(next: NextOpening | null, t: Translate): string | null {
  if (!next) return null;
  const when = next.daysAhead === 0 ? t('store.whenToday') : t(DAY_NAME_KEYS[next.dayKey] ?? 'store.whenToday');
  return t('store.opensWhen', { when, time: next.time });
}

// Semana completa, em ordem começando na segunda (mais natural de ler que
// começar no domingo) — usada no header do cardápio pra mostrar o
// horário de atendimento inteiro, não só o de hoje.
const WEEK_ORDER = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

export interface WeekScheduleLine {
  day: string;
  hours: string;
}

export function getWeekScheduleLines(
  openingHours: Record<string, string> | null,
  t: Translate,
): WeekScheduleLine[] | null {
  if (!openingHours) return null;
  return WEEK_ORDER.map((key) => {
    const raw = openingHours[key];
    let hours = t('store.hoursClosedDay');
    if (raw && raw !== 'fechado') {
      const [open, close] = raw.split('-');
      if (open && close) hours = is24h(open, close) ? t('store.open24h') : t('store.hoursRange', { open, close });
    }
    return { day: t(SHORT_DAY_KEYS[key]), hours };
  });
}
