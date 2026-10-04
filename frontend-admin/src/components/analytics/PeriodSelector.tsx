import type { AnalyticsPeriod } from '../../types/analytics';

export const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string; hint: string }[] = [
  { value: 'hora', label: 'Hora', hint: 'Hoje, hora a hora' },
  { value: 'dia', label: 'Dia', hint: 'Últimas 24h' },
  { value: 'semana', label: 'Semana', hint: 'Últimos 7 dias' },
  { value: 'mes', label: 'Mês', hint: 'Últimos 30 dias' },
  { value: 'ano', label: 'Ano', hint: 'Últimos 12 meses' },
  { value: '5anos', label: '5 anos', hint: 'Últimos 60 meses' },
  { value: 'custom', label: 'Personalizado', hint: 'Intervalo de datas' },
];

interface Props {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  onPeriod: (p: AnalyticsPeriod) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}

export function PeriodSelector({ period, from, to, onPeriod, onFrom, onTo }: Props) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => onPeriod(o.value)}
            title={o.hint}
            aria-pressed={period === o.value}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              period === o.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <label className="flex items-center gap-1.5">
            De
            <input
              type="date"
              value={from}
              max={to || today}
              onChange={(e) => onFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5">
            até
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => onTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}
