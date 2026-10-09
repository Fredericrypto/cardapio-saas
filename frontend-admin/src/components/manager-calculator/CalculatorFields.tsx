import { Plus, Trash2 } from 'lucide-react';
import type { CalculatorCategory, RecipeIngredient } from '../../types/managerCalculator';
import { CurrencyField } from '../MaskedNumberField';
import { addPercentPoints } from '../../lib/calculator/calculatorMath';
import { FIELD_SPECS } from '../../lib/calculator/calculatorMeta';
import type { FieldSpec } from '../../lib/calculator/calculatorMeta';
import { createEmptyIngredient } from '../../lib/calculator/calculatorStorage';

const INPUT =
  'w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm font-mono outline-none focus:border-gray-400 transition-colors';

// Só dígitos e UM separador decimal (vírgula vira ponto), igual aos campos do painel.
function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const [head = '', ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${head}.${rest.join('')}` : head;
}

const sanitizeInteger = (raw: string): string => raw.replace(/\D/g, '').slice(0, 6);

function FieldShell({ spec, children }: { spec: FieldSpec; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label className="text-xs font-semibold text-gray-600">
        {spec.label}
        {spec.required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {spec.hint && <p className="text-[11px] text-gray-400 leading-snug">{spec.hint}</p>}
    </div>
  );
}

interface FieldsProps {
  category: CalculatorCategory;
  inputs: Record<string, number | string>;
  onChange: (key: string, value: string) => void;
}

// Campos de cada simulação: espaçados, com máscara de R$ e de %, e atalhos nos percentuais.
export function CalculatorFields({ category, inputs, onChange }: FieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
      {FIELD_SPECS[category].map((spec) => {
        const value = String(inputs[spec.key] ?? '');
        if (spec.kind === 'money') {
          return (
            <FieldShell key={spec.key} spec={spec}>
              <CurrencyField value={value} onChange={(v) => onChange(spec.key, v)} className={INPUT} />
            </FieldShell>
          );
        }
        if (spec.kind === 'integer') {
          return (
            <FieldShell key={spec.key} spec={spec}>
              <input
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) => onChange(spec.key, sanitizeInteger(e.target.value))}
                placeholder="0"
                className={INPUT}
              />
            </FieldShell>
          );
        }
        return (
          <FieldShell key={spec.key} spec={spec}>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => onChange(spec.key, sanitizeDecimal(e.target.value))}
                placeholder="0"
                className={`${INPUT} pr-9`}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-violet-500 dark:text-violet-300 pointer-events-none">%</span>
            </div>
            <div className="flex gap-1.5">
              {[5, 10].map((points) => (
                <button
                  key={points}
                  type="button"
                  onClick={() => onChange(spec.key, addPercentPoints(value, points))}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  +{points}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange(spec.key, '0')}
                className="px-2.5 py-1 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Zerar
              </button>
            </div>
          </FieldShell>
        );
      })}
    </div>
  );
}

// Ficha técnica: lista de ingredientes.
export function RecipeIngredientsEditor({
  ingredients,
  onChange,
}: {
  ingredients: RecipeIngredient[];
  onChange: (next: RecipeIngredient[]) => void;
}) {
  const patch = (id: string, change: Partial<RecipeIngredient>) =>
    onChange(ingredients.map((i) => (i.id === id ? { ...i, ...change } : i)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600">Ingredientes</p>
        <button
          type="button"
          onClick={() => onChange([...ingredients, createEmptyIngredient()])}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
        >
          <Plus size={14} strokeWidth={1.5} />
          Adicionar
        </button>
      </div>
      {ingredients.map((ing, idx) => (
        <div key={ing.id} className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-2 items-end rounded-xl border border-gray-100 p-3">
          <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">Ingrediente {idx + 1}</label>
            <input
              value={ing.name}
              maxLength={80}
              onChange={(e) => patch(ing.id, { name: e.target.value })}
              placeholder="Ex.: Queijo"
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">Qtd. usada</label>
            <input
              inputMode="decimal"
              value={ing.usedQty}
              onChange={(e) => patch(ing.id, { usedQty: sanitizeDecimal(e.target.value) })}
              placeholder="250"
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">Qtd. da embalagem</label>
            <input
              inputMode="decimal"
              value={ing.packQty}
              onChange={(e) => patch(ing.id, { packQty: sanitizeDecimal(e.target.value) })}
              placeholder="1000"
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">Preço da embalagem</label>
            <CurrencyField value={ing.packPrice} onChange={(v) => patch(ing.id, { packPrice: v })} className={INPUT} />
          </div>
          <button
            type="button"
            onClick={() => onChange(ingredients.length > 1 ? ingredients.filter((i) => i.id !== ing.id) : [createEmptyIngredient()])}
            aria-label={`Remover ingrediente ${idx + 1}`}
            className="h-[46px] px-3 rounded-xl bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center"
          >
            <Trash2 size={16} strokeWidth={1.5} className="text-red-500" />
          </button>
        </div>
      ))}
      <p className="text-[11px] text-gray-400">
        Use a mesma unidade na quantidade usada e na da embalagem (ex.: gramas nas duas). Custo da linha = usado ÷ embalagem × preço.
      </p>
    </div>
  );
}
