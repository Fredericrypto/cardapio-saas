import { Flame, Heart, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AUTO_BADGE_LABEL,
  DECLARED_BADGE_GROUPS,
  DECLARED_BADGE_LABEL,
  IMAGE_NOTICE_BADGE,
  MAX_DECLARED_CHIP_BADGES,
  countChipBadges,
} from '../lib/productBadges';
import { DECLARED_BADGE_CODES } from '../types/productBadges';
import type { AutoBadge, DeclaredBadgeCode } from '../types/productBadges';

const AUTO_ICON: Record<string, LucideIcon> = {
  top_ordered: Flame,
  customer_favorite: Heart,
  trending: TrendingUp,
};

interface ProductBadgesEditorProps {
  value: readonly DeclaredBadgeCode[];
  onChange: (next: DeclaredBadgeCode[]) => void;
  /** Selos automáticos do produto (só leitura; o sistema calcula). */
  autoBadges?: readonly AutoBadge[];
}

// Seção "Badges do produto": checkboxes dos selos DECLARATIVOS (o que só o
// restaurante pode afirmar) + lista só-leitura dos selos AUTOMÁTICOS.
export function ProductBadgesEditor({ value, onChange, autoBadges = [] }: ProductBadgesEditorProps) {
  const selected = new Set<DeclaredBadgeCode>(value);
  const chips = countChipBadges(value);
  const atLimit = chips >= MAX_DECLARED_CHIP_BADGES;
  const knownAuto = autoBadges.filter((b) => b.kind === 'behavioral' && AUTO_BADGE_LABEL[b.code] !== undefined);

  function toggle(code: DeclaredBadgeCode, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    // Sempre na ordem do catálogo (a mesma que o servidor devolve).
    onChange(DECLARED_BADGE_CODES.filter((c) => next.has(c)));
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-gray-100 p-3 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-[#E3E2E6]">Badges do produto</p>
        <span className="text-xs tabular-nums text-gray-400 dark:text-[#8E918F]">
          {chips}/{MAX_DECLARED_CHIP_BADGES}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-[#C4C7C5]">
        Opcionais. Aparecem na tela do item para o cliente. Marque só o que realmente se aplica (até{' '}
        {MAX_DECLARED_CHIP_BADGES}).
      </p>

      {DECLARED_BADGE_GROUPS.map((group) => (
        <fieldset key={group.title} className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-[#8E918F]">
            {group.title}
          </legend>
          {group.codes.map((code) => {
            const checked = selected.has(code);
            const locked = !checked && code !== IMAGE_NOTICE_BADGE && atLimit;
            return (
              <label
                key={code}
                className={`flex items-start gap-2 text-sm text-gray-700 dark:text-[#E3E2E6] ${
                  locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
                title={
                  locked ? `Limite de ${MAX_DECLARED_CHIP_BADGES} badges. Desmarque outro para escolher este.` : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={(e) => toggle(code, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-gray-900 dark:accent-[#E3E2E6]"
                />
                <span>
                  {DECLARED_BADGE_LABEL[code]}
                  {code === IMAGE_NOTICE_BADGE && (
                    <span className="block text-xs text-gray-400 dark:text-[#8E918F]">
                      Mostra um selo discreto sobre a foto e não conta no limite.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}

      {knownAuto.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3 dark:border-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-[#8E918F]">
            Calculados pelo sistema
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {knownAuto.map((b) => {
              const Icon = AUTO_ICON[b.code];
              return (
                <li
                  key={b.code}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-white/20 dark:text-[#E3E2E6]"
                >
                  {Icon && <Icon size={13} strokeWidth={1.75} aria-hidden="true" />}
                  {AUTO_BADGE_LABEL[b.code]}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs text-gray-400 dark:text-[#8E918F]">
        Mais pedido, favorito dos clientes e tendência são calculados automaticamente pelo sistema a partir dos pedidos
        e avaliações. Não dá para marcá-los à mão.
      </p>
    </section>
  );
}
