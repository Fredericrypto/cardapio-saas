import {
  Apple,
  BookOpen,
  Camera,
  Check,
  ChefHat,
  Flame,
  Hand,
  Heart,
  Hourglass,
  Leaf,
  Lock,
  Milk,
  ShoppingBasket,
  Snowflake,
  Thermometer,
  TrendingUp,
  Wheat,
} from 'lucide-react';
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

// Ícones (traço fino) de cada selo declarativo. Os automáticos usam os mesmos ícones
// que o cliente vê na tela do item (Flame, Heart, TrendingUp).
const DECLARED_ICON: Record<DeclaredBadgeCode, LucideIcon> = {
  illustrative_image: Camera,
  selected_ingredients: ShoppingBasket,
  artisanal: Hand,
  always_fresh: Snowflake,
  house_recipe: BookOpen,
  chef_recommended: ChefHat,
  limited_edition: Hourglass,
  vegan: Leaf,
  gluten_free: Wheat,
  lactose_free: Milk,
  spicy: Thermometer,
  healthy_option: Apple,
};

const AUTO_INFO: ReadonlyArray<{ code: string; icon: LucideIcon; description: string }> = [
  { code: 'top_ordered', icon: Flame, description: 'Entre os itens mais vendidos dos últimos 30 dias.' },
  { code: 'customer_favorite', icon: Heart, description: 'Nota média muito alta, com um mínimo de avaliações.' },
  { code: 'trending', icon: TrendingUp, description: 'Vendas crescendo na última semana em relação à anterior.' },
];

// Cor SÓ no traço de cada ícone (claro / escuro), igual à tela do cliente.
const DECLARED_ICON_COLOR: Record<DeclaredBadgeCode, string> = {
  illustrative_image: 'text-[#64748B] dark:text-[#94A3B8]',
  selected_ingredients: 'text-[#65A30D] dark:text-[#A3E635]',
  artisanal: 'text-[#C2410C] dark:text-[#FB923C]',
  always_fresh: 'text-[#0284C7] dark:text-[#38BDF8]',
  house_recipe: 'text-[#7C3AED] dark:text-[#A78BFA]',
  chef_recommended: 'text-[#0D9488] dark:text-[#2DD4BF]',
  limited_edition: 'text-[#C026D3] dark:text-[#E879F9]',
  vegan: 'text-[#16A34A] dark:text-[#4ADE80]',
  gluten_free: 'text-[#CA8A04] dark:text-[#FACC15]',
  lactose_free: 'text-[#4F46E5] dark:text-[#818CF8]',
  spicy: 'text-[#DC2626] dark:text-[#F87171]',
  healthy_option: 'text-[#E11D48] dark:text-[#FB7185]',
};
const AUTO_ICON_COLOR: Record<string, string> = {
  top_ordered: 'text-[#EA580C] dark:text-[#FB923C]',
  customer_favorite: 'text-[#E11D48] dark:text-[#FB7185]',
  trending: 'text-[#059669] dark:text-[#34D399]',
};

interface ProductBadgesEditorProps {
  value: readonly DeclaredBadgeCode[];
  onChange: (next: DeclaredBadgeCode[]) => void;
  /** Selos automáticos do produto (só leitura; o sistema calcula). */
  autoBadges?: readonly AutoBadge[];
}

// Seção "Badges do produto": cartões selecionáveis dos selos DECLARATIVOS (o que só o
// restaurante pode afirmar) + painel só-leitura dos selos AUTOMÁTICOS.
export function ProductBadgesEditor({ value, onChange, autoBadges = [] }: ProductBadgesEditorProps) {
  const selected = new Set<DeclaredBadgeCode>(value);
  const chips = countChipBadges(value);
  const atLimit = chips >= MAX_DECLARED_CHIP_BADGES;
  const activeAuto = new Set(autoBadges.filter((b) => b.kind === 'behavioral').map((b) => b.code));

  function toggle(code: DeclaredBadgeCode, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    // Sempre na ordem do catálogo (a mesma que o servidor devolve).
    onChange(DECLARED_BADGE_CODES.filter((c) => next.has(c)));
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-gray-100 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Badges do produto</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Opcionais. Aparecem na tela do item para o cliente. Marque só o que realmente se aplica.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5" aria-label={`${chips} de ${MAX_DECLARED_CHIP_BADGES} badges escolhidos`}>
          <span className="text-xs font-semibold tabular-nums text-gray-500">
            {chips}/{MAX_DECLARED_CHIP_BADGES}
          </span>
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: MAX_DECLARED_CHIP_BADGES }, (_, i) => (
              <span key={i} className={`h-1.5 w-5 rounded-full transition-colors ${i < chips ? 'bg-[#111827] dark:bg-[#E3E2E6]' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
      </header>

      {DECLARED_BADGE_GROUPS.map((group) => (
        <fieldset key={group.title} className="flex flex-col gap-2">
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.title}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.codes.map((code) => {
              const Icon = DECLARED_ICON[code];
              const checked = selected.has(code);
              const locked = !checked && code !== IMAGE_NOTICE_BADGE && atLimit;
              const wide = code === IMAGE_NOTICE_BADGE;
              return (
                <label
                  key={code}
                  title={locked ? `Limite de ${MAX_DECLARED_CHIP_BADGES} badges. Desmarque outro para escolher este.` : undefined}
                  className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    checked
                      ? 'border-[#111827] bg-[#F3F4F6] dark:border-[#E3E2E6] dark:bg-[#282A2C]'
                      : 'border-gray-200 hover:border-gray-300'
                  } has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-400 ${
                    wide ? 'sm:col-span-2' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(e) => toggle(code, e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      checked
                        ? 'bg-white ring-1 ring-black/10 dark:bg-[#131314] dark:ring-white/15'
                        : 'bg-gray-100'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.5} aria-hidden="true" className={DECLARED_ICON_COLOR[code]} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm leading-tight text-gray-700">
                    {DECLARED_BADGE_LABEL[code]}
                    {wide && (
                      <span className="mt-0.5 block text-xs text-gray-400">
                        Mostra um selo discreto sobre a foto e não conta no limite.
                      </span>
                    )}
                  </span>
                  <Check
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="shrink-0 text-[#111827] opacity-0 dark:text-[#E3E2E6] transition-opacity group-has-[:checked]:opacity-100"
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3.5">
        <div className="flex items-center gap-2">
          <Lock size={14} strokeWidth={1.5} aria-hidden="true" className="text-gray-400" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Calculados pelo sistema</h4>
        </div>
        <ul className="flex flex-col gap-2">
          {AUTO_INFO.map(({ code, icon: Icon, description }) => {
            const active = activeAuto.has(code);
            return (
              <li key={code} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    active ? 'bg-white ring-1 ring-black/10 dark:bg-[#131314] dark:ring-white/15' : 'bg-gray-100'
                  }`}
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden="true" className={active ? AUTO_ICON_COLOR[code] : 'text-gray-400'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight text-gray-700">{AUTO_BADGE_LABEL[code]}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-gray-400">{description}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {active ? 'Ativo' : 'Não ativo'}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-relaxed text-gray-400">
          Calculados a partir dos pedidos e das avaliações. Não podem ser marcados à mão: é isso que mantém o selo confiável.
        </p>
      </div>
    </section>
  );
}
