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

const DAY_LABELS: Record<string, string> = {
  domingo: 'domingo',
  segunda: 'segunda-feira',
  terca: 'terça-feira',
  quarta: 'quarta-feira',
  quinta: 'quinta-feira',
  sexta: 'sexta-feira',
  sabado: 'sábado',
};

// Dia da semana no HORÁRIO DE BRASÍLIA (não no fuso do aparelho): quem está
// com o celular em outro fuso vê o mesmo "Hoje" do restaurante.
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function brazilDayIndex(): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
  return WEEKDAY_INDEX[short] ?? new Date().getDay();
}

// "00:00-00:00" (abre == fecha) = aberto 24 horas.
function is24h(open: string, close: string): boolean {
  return open === close;
}

// Só informativo (mostra "Hoje: 18:00 - 23:00" etc.) — quem decide se dá
// pra pedir de verdade é o `isOpenNow` calculado no backend.
export function getTodayHoursLabel(openingHours: Record<string, string> | null): string | null {
  if (!openingHours) return null;
  const key = DAY_KEYS[brazilDayIndex()];
  const raw = openingHours[key];
  if (!raw || raw === 'fechado') return `Fechado ${DAY_LABELS[key]}`;
  const [open, close] = raw.split('-');
  if (!open || !close) return null;
  if (is24h(open, close)) return 'Hoje: aberto 24h';
  return `Hoje: ${open} às ${close}`;
}

// Semana completa, em ordem começando na segunda (mais natural de ler que
// começar no domingo) — usada no header do cardápio pra mostrar o
// horário de atendimento inteiro, não só o de hoje.
const WEEK_ORDER = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

const SHORT_DAY_LABELS: Record<string, string> = {
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

export interface WeekScheduleLine {
  day: string;
  hours: string;
}

export function getWeekScheduleLines(
  openingHours: Record<string, string> | null,
): WeekScheduleLine[] | null {
  if (!openingHours) return null;
  return WEEK_ORDER.map((key) => {
    const raw = openingHours[key];
    let hours = 'Fechado';
    if (raw && raw !== 'fechado') {
      const [open, close] = raw.split('-');
      if (open && close) hours = is24h(open, close) ? 'Aberto 24h' : `${open} às ${close}`;
    }
    return { day: SHORT_DAY_LABELS[key], hours };
  });
}
