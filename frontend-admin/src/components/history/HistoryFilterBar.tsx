import { CalendarDays, ListFilter, Store, X } from 'lucide-react';
import {
  PERIOD_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  DEFAULT_HISTORY_FILTERS,
  hasActiveFilters,
  isCustomRangeInvalid,
  type HistoryFilters,
} from '../../lib/historyFilters';

interface HistoryFilterBarProps {
  filters: HistoryFilters;
  onChange: (next: HistoryFilters) => void;
  statusCounts: Record<string, number>;
  typeCounts: Record<string, number>;
}

function Chip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white dark:bg-[#1E1E20] text-gray-600 border-gray-200 hover:border-gray-400'
      } ${!active && count === 0 ? 'opacity-60' : ''}`}
    >
      {label}
      {typeof count === 'number' && (
        <span className={`text-[10px] font-bold ${active ? 'text-white/70' : 'text-gray-400'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function FilterGroup({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function HistoryFilterBar({
  filters,
  onChange,
  statusCounts,
  typeCounts,
}: HistoryFilterBarProps) {
  const rangeInvalid = isCustomRangeInvalid(filters);
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-100 p-4">
      <FilterGroup icon={<ListFilter size={13} strokeWidth={1.5} />} title="Status">
        {STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            count={statusCounts[option.key]}
            active={filters.status === option.key}
            onClick={() => onChange({ ...filters, status: option.key })}
          />
        ))}
      </FilterGroup>

      <FilterGroup icon={<Store size={13} strokeWidth={1.5} />} title="Tipo de pedido">
        {TYPE_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            count={typeCounts[option.key]}
            active={filters.type === option.key}
            onClick={() => onChange({ ...filters, type: option.key })}
          />
        ))}
      </FilterGroup>

      <FilterGroup icon={<CalendarDays size={13} strokeWidth={1.5} />} title="Período">
        {PERIOD_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            active={filters.period === option.key}
            onClick={() => onChange({ ...filters, period: option.key })}
          />
        ))}
      </FilterGroup>

      {filters.period === 'personalizado' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-500">
              Data inicial
              <input
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-gray-400"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-500">
              Data final
              <input
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-gray-400"
              />
            </label>
          </div>
          {rangeInvalid && (
            <p className="text-xs text-red-500">A data inicial não pode ser depois da data final.</p>
          )}
        </div>
      )}

      {active && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_HISTORY_FILTERS)}
          className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800"
        >
          <X size={13} strokeWidth={1.5} />
          Limpar filtros
        </button>
      )}
    </div>
  );
}
