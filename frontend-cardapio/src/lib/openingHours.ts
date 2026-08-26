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

// Só informativo (mostra "Hoje: 18:00 - 23:00" etc.) — quem decide se dá
// pra pedir de verdade é o toggle `isOpen` do tenant, sempre.
export function getTodayHoursLabel(openingHours: Record<string, string> | null): string | null {
  if (!openingHours) return null;
  const key = DAY_KEYS[new Date().getDay()];
  const raw = openingHours[key];
  if (!raw || raw === 'fechado') return `Fechado ${DAY_LABELS[key]}`;
  const [open, close] = raw.split('-');
  if (!open || !close) return null;
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
      if (open && close) hours = `${open} às ${close}`;
    }
    return { day: SHORT_DAY_LABELS[key], hours };
  });
}
