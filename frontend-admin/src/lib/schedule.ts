// Horário de funcionamento + toggle "Loja aberta".
//
// FUSO: tudo é calculado em America/Sao_Paulo (horário do Brasil), nunca no
// fuso do servidor (que no Render/cloud é UTC — daí o "Fecha em 54 min" errado
// e o dia da semana virando antes da hora). O Brasil não tem horário de verão
// desde 2019; mesmo assim usamos Intl com o fuso nomeado, sem somar offset na mão.
//
// FORMATO (inalterado, o cardápio já lê assim): { segunda: "18:00-23:00",
// domingo: "fechado", ... }.
//   - "00:00-00:00" (abre == fecha) significa ABERTO 24 HORAS naquele dia;
//   - fecha < abre (ex.: 18:00-02:00) cruza a meia-noite: a madrugada seguinte
//     ainda pertence à janela do dia anterior.
//
// TOGGLE x HORÁRIO (pedido do Felipe, 03/10): o toggle acompanha o horário
// sozinho — fechou pelo horário → vira Fechado; abriu pelo horário → vira
// Aberto — e o admin pode inverter manualmente a qualquer momento (abrir fora
// do horário ou fechar dentro dele). O ajuste manual vale até a PRÓXIMA
// transição do horário. Para saber "houve transição?" guardamos o último estado
// do horário (`scheduleOpenState`); quem persiste isso é o LocationsService
// (cron de 1 min). Enquanto a persistência não rodou, a transição pendente já
// vale aqui (o horário vence o toggle), então nada depende de o cron ter rodado.

export const SCHEDULE_TIMEZONE = 'America/Sao_Paulo';

const DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHEDULE_TIMEZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface ClockNow {
  dayIndex: number; // 0 = domingo
  minutes: number; // minutos desde 00:00 (horário de Brasília)
}

export function getBrazilClock(now: Date = new Date()): ClockNow {
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return { dayIndex: WEEKDAY_INDEX[get('weekday')] ?? 0, minutes: hour * 60 + minute };
}

interface Window {
  open: number;
  close: number;
  is24h: boolean;
  crossesMidnight: boolean;
}

function parseWindow(raw: string | undefined): Window | 'closed' | null {
  if (!raw || raw === 'fechado') return 'closed';
  const [openStr, closeStr] = raw.split('-');
  if (!openStr || !closeStr) return null; // formato inesperado — não bloqueia por engano
  const [oh, om] = openStr.split(':').map(Number);
  const [ch, cm] = closeStr.split(':').map(Number);
  if ([oh, om, ch, cm].some((n) => Number.isNaN(n))) return null;
  const open = oh * 60 + om;
  const close = ch * 60 + cm;
  if (open === close) return { open, close, is24h: true, crossesMidnight: false };
  return { open, close, is24h: false, crossesMidnight: close < open };
}

// Janela do dia `dayIndex` em que `minutes` cai dentro? Considera também a
// janela do DIA ANTERIOR que cruzou a meia-noite.
function findActiveWindow(
  openingHours: Record<string, string>,
  clock: ClockNow,
): { window: Window; startedYesterday: boolean } | null {
  const today = parseWindow(openingHours[DAY_KEYS[clock.dayIndex]]);
  if (today && today !== 'closed') {
    if (today.is24h) return { window: today, startedYesterday: false };
    if (!today.crossesMidnight && clock.minutes >= today.open && clock.minutes < today.close) {
      return { window: today, startedYesterday: false };
    }
    if (today.crossesMidnight && clock.minutes >= today.open) {
      return { window: today, startedYesterday: false };
    }
  }
  const yesterday = parseWindow(openingHours[DAY_KEYS[(clock.dayIndex + 6) % 7]]);
  if (yesterday && yesterday !== 'closed' && yesterday.crossesMidnight && clock.minutes < yesterday.close) {
    return { window: yesterday, startedYesterday: true };
  }
  return null;
}

// "Estou dentro do horário configurado agora?" (sem olhar o toggle).
// Sem horário configurado = sem restrição.
export function isWithinSchedule(openingHours: Record<string, string> | null, now: Date = new Date()): boolean {
  if (!openingHours) return true;
  const clock = getBrazilClock(now);
  const today = parseWindow(openingHours[DAY_KEYS[clock.dayIndex]]);
  // Formato inesperado hoje: não bloqueia por engano.
  if (today === null) return true;
  return findActiveWindow(openingHours, clock) !== null;
}

export function computeIsOpenNow(
  manualIsOpen: boolean,
  openingHours: Record<string, string> | null,
  scheduleOpenState?: boolean | null,
  now: Date = new Date(),
): boolean {
  if (!openingHours) return manualIsOpen;
  const within = isWithinSchedule(openingHours, now);
  // Estado ainda desconhecido (loja antiga, cron não rodou): comportamento
  // anterior — aberto só se o toggle está ligado E dentro do horário.
  if (scheduleOpenState == null) return manualIsOpen && within;
  // Houve transição do horário que ainda não foi persistida: o horário vence.
  if (scheduleOpenState !== within) return within;
  // Sem transição pendente: o toggle manda (abre/fecha fora do horário à vontade).
  return manualIsOpen;
}

// Loja aberta 24h hoje (não faz sentido mostrar "fecha em X").
export function isOpen24hNow(openingHours: Record<string, string> | null, now: Date = new Date()): boolean {
  if (!openingHours) return false;
  const clock = getBrazilClock(now);
  const active = findActiveWindow(openingHours, clock);
  return Boolean(active?.window.is24h);
}

// Minutos até fechar pelo horário, se está aberto agora. null = sem horário,
// fechado, 24h, ou sem fechamento previsto.
export function getMinutesUntilClose(
  isOpenNow: boolean,
  openingHours: Record<string, string> | null,
  now: Date = new Date(),
): number | null {
  if (!isOpenNow || !openingHours) return null;
  const clock = getBrazilClock(now);
  const active = findActiveWindow(openingHours, clock);
  if (!active || active.window.is24h) return null;
  const { close } = active.window;
  if (close >= clock.minutes && !(active.window.crossesMidnight && !active.startedYesterday)) {
    return close - clock.minutes;
  }
  // Janela de hoje que cruza a meia-noite: fecha amanhã às `close`.
  return close + 1440 - clock.minutes;
}

// Próxima abertura prevista pela MATRIZ de horários (America/Sao_Paulo), a
// partir de `now`. Serve para o aviso "Abre Hoje às 18:00" / "Abre
// Segunda-feira às 09:30" quando a loja está fechada.
//
//   - `daysAhead` 0 = hoje (ainda vai abrir hoje), 1 = amanhã, ... até 7
//     (mesmo dia da semana na semana seguinte, quando hoje é o único dia aberto
//     e o horário de hoje já passou).
//   - Janela "24h" (abre == fecha) conta como abertura às `HH:MM` configuradas.
//   - Loja fechada na mão dentro de uma janela aberta: a próxima abertura é a
//     do próximo horário de abertura da matriz (o ajuste manual vale até lá).
//   - null = a matriz não tem nenhum dia aberto (ou não há horário configurado).
export interface NextOpening {
  dayIndex: number; // 0 = domingo
  dayKey: string; // chave do dia no formato do horário ("segunda", "terca", ...)
  time: string; // "HH:MM"
  daysAhead: number;
}

export function getNextOpening(openingHours: Record<string, string> | null, now: Date = new Date()): NextOpening | null {
  if (!openingHours) return null;
  const clock = getBrazilClock(now);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const dayIndex = (clock.dayIndex + ahead) % 7;
    const window = parseWindow(openingHours[DAY_KEYS[dayIndex]]);
    if (!window || window === 'closed') continue;
    if (ahead === 0 && window.open <= clock.minutes) continue; // já passou da hora de abrir hoje
    const hh = String(Math.floor(window.open / 60)).padStart(2, '0');
    const mm = String(window.open % 60).padStart(2, '0');
    return { dayIndex, dayKey: DAY_KEYS[dayIndex], time: `${hh}:${mm}`, daysAhead: ahead };
  }
  return null;
}
