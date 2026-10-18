import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { addonGroupHint } from '../i18n/labels';
import { formatBRL } from '../lib/cartFormat';
import type { OptionSelections } from '../lib/productOptions';
import { PROFILE_CARD } from '../lib/profileTheme';
import { MENU_BORDER, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED, MENU_TEXT_SOFT } from '../lib/menuTheme';
import type { ProductOptionGroup } from '../types';

interface ProductOptionGroupListProps {
  groups: readonly ProductOptionGroup[];
  selections: OptionSelections;
  onToggle: (group: ProductOptionGroup, valueId: string) => void;
  brand: string;
  // 'page' = página de detalhe (cartões folgados); 'panel' = painel lateral /
  // bottom-sheet do Modo Promoção (mais compacto).
  density?: 'page' | 'panel';
}

// Grupos de adicionais (rádio quando maxSelect === 1, caixa de seleção nos
// demais). Markup único das duas telas — a regra de escolha fica em
// lib/productOptions.ts.
export function ProductOptionGroupList({
  groups,
  selections,
  onToggle,
  brand,
  density = 'page',
}: ProductOptionGroupListProps) {
  const { t } = useI18n();
  const compact = density === 'panel';

  return (
    <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
      {groups.map((group) => {
        const hint = addonGroupHint(group.minSelect, group.maxSelect, t);
        const isMulti = group.maxSelect > 1;
        return (
          <div
            key={group.id}
            className={`${
              compact
                ? PROFILE_CARD
                : `rounded-2xl border bg-[#FFFFFF]/55 backdrop-blur-xl dark:bg-[#131314]/55 ${MENU_BORDER}`
            } ${compact ? 'p-3.5' : 'p-4 md:p-5'}`}
          >
            <div className="flex items-baseline flex-wrap gap-x-1.5 mb-3">
              <p className={`text-sm font-bold ${MENU_TEXT}`}>{group.name}</p>
              {hint && <span className={`text-xs ${MENU_TEXT_MUTED}`}>· {hint}</span>}
            </div>

            <div className="flex flex-col gap-2" role={isMulti ? 'group' : 'radiogroup'} aria-label={group.name}>
              {group.values.map((value) => {
                const isSelected = (selections[group.id] ?? []).includes(value.id);
                return (
                  <button
                    key={value.id}
                    type="button"
                    role={isMulti ? 'checkbox' : 'radio'}
                    aria-checked={isSelected}
                    onClick={() => onToggle(group, value.id)}
                    style={{ '--brand': brand } as CSSProperties}
                    className={`loc-card [--glow:var(--brand)] w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                      isSelected
                        ? 'border-[var(--brand)] dark:border-[#E3E2E6] bg-black/[0.05] dark:bg-white/[0.09]'
                        : 'border-[#E5E7EB] dark:border-white/10 bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className={`text-sm min-w-0 break-words ${MENU_TEXT_SOFT}`}>{value.label}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      {Number(value.priceDelta) > 0 && (
                        <span
                          className={`text-xs font-medium tabular-nums rounded-full px-2 py-0.5 bg-[#F3F4F6] dark:bg-white/10 ${MENU_TEXT_BODY}`}
                        >
                          + {formatBRL(Number(value.priceDelta))}
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        className={`w-5 h-5 flex items-center justify-center border-2 shrink-0 transition ${
                          isMulti ? 'rounded-md' : 'rounded-full'
                        } ${
                          isSelected
                            ? 'border-[var(--brand)] bg-[var(--brand)] dark:border-[#E3E2E6] dark:bg-[#E3E2E6]'
                            : 'border-[#D1D5DB] dark:border-white/25 bg-transparent'
                        }`}
                      >
                        {isSelected && (
                          <Check size={12} strokeWidth={2} className="text-[#FFFFFF] dark:text-[#131314]" />
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
