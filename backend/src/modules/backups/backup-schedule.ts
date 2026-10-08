// Matemática de agenda do backup automático e da retenção — funções PURAS
// (sem banco, sem relógio global): todo instante entra por parâmetro, o que
// permite testar com datas fixas.
//
// FUSO: America/Sao_Paulo, via Intl (nunca somando offset à mão), como em
// common/utils/schedule.ts. O cálculo é correto mesmo se o Brasil voltar a ter
// horário de verão (testado com um fuso que tem — ver backup-audit.ts).

export const BACKUP_TIMEZONE = 'America/Sao_Paulo';
export const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000; // falhou? tenta de novo em 1 h

export interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

export function isValidRunTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

// Data civil (ano/mês/dia) de um instante, no fuso dado.
export function zonedYMD(date: Date, timeZone = BACKUP_TIMEZONE): YMD {
  const p = parts(date, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

// Instante UTC em que o relógio do fuso marca `hh:mm` na data civil `ymd`.
// Duas iterações: a primeira estima, a segunda corrige a diferença de offset
// (cobre viradas de horário de verão).
export function zonedWallTimeToUtc(
  ymd: YMD,
  hour: number,
  minute: number,
  timeZone = BACKUP_TIMEZONE,
): Date {
  const wallAsUtc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute, 0, 0);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const diff = wallAsUtc - shownAsUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function addDays(ymd: YMD, days: number): YMD {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function splitRunTime(runTime: string): [number, number] {
  if (!isValidRunTime(runTime)) throw new Error(`Horário inválido: ${runTime}`);
  const [h, m] = runTime.split(':').map(Number);
  return [h, m];
}

// Primeira ocorrência de `runTime` ESTRITAMENTE depois de `from`.
// Usada ao ativar/alterar a agenda: o primeiro backup sai no próximo horário
// marcado (nunca "agora", nunca no passado).
export function nextOccurrenceAfter(from: Date, runTime: string, timeZone = BACKUP_TIMEZONE): Date {
  const [h, m] = splitRunTime(runTime);
  const today = zonedYMD(from, timeZone);
  const todaySlot = zonedWallTimeToUtc(today, h, m, timeZone);
  if (todaySlot.getTime() > from.getTime()) return todaySlot;
  return zonedWallTimeToUtc(addDays(today, 1), h, m, timeZone);
}

// Depois de um backup automático concluído em `completedAt`: o próximo é no
// horário marcado, `frequencyDays` dias depois do DIA em que ele de fato rodou.
// (Baseado no dia real e não no horário agendado: se o servidor ficou
// dormindo 40 dias com frequência de 3, NÃO sai uma rajada de 13 backups de
// recuperação — sai um e a cadência recomeça dali.)
export function nextRunAfterCompletion(
  completedAt: Date,
  frequencyDays: number,
  runTime: string,
  timeZone = BACKUP_TIMEZONE,
): Date {
  if (!Number.isInteger(frequencyDays) || frequencyDays <= 0) {
    throw new Error('frequencyDays precisa ser um inteiro positivo');
  }
  const [h, m] = splitRunTime(runTime);
  const day = zonedYMD(completedAt, timeZone);
  return zonedWallTimeToUtc(addDays(day, frequencyDays), h, m, timeZone);
}

export function isDue(nextRunAt: Date | null, now: Date): boolean {
  return nextRunAt !== null && nextRunAt.getTime() <= now.getTime();
}

// ---------------------------------------------------------------- retenção

export interface RetentionCandidate {
  id: string;
  status: string;
  createdAt: Date;
}

const PURGEABLE = new Set(['concluido', 'restaurado', 'falhou']);
const USABLE = new Set(['concluido', 'restaurado']);

// Quais backups a retenção apaga. Regras:
//  1. só os mais antigos que `retentionDays` (data de criação);
//  2. NUNCA operações em andamento (processando/restaurando);
//  3. NUNCA o backup utilizável (concluído/restaurado) mais recente, por mais
//     velho que seja — retenção de 7 dias com frequência de 30 não pode deixar
//     o restaurante sem nenhum backup.
export function selectBackupsToPurge(
  backups: RetentionCandidate[],
  retentionDays: number,
  now: Date,
): string[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const newestUsable = backups
    .filter((b) => USABLE.has(b.status))
    .reduce<RetentionCandidate | null>(
      (best, b) => (best === null || b.createdAt.getTime() > best.createdAt.getTime() ? b : best),
      null,
    );
  return backups
    .filter(
      (b) =>
        PURGEABLE.has(b.status) &&
        b.createdAt.getTime() < cutoff &&
        b.id !== newestUsable?.id,
    )
    .map((b) => b.id);
}
