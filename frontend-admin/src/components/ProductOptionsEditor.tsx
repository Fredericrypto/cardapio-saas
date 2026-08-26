import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { setProductOptions } from '../lib/admin-api';
import type { Product, ProductOptionGroup } from '../types';

type DraftValue = { label: string; priceDelta: string; isAvailable: boolean };
type DraftGroup = { name: string; minSelect: number; maxSelect: number; values: DraftValue[] };

function toDraft(groups: ProductOptionGroup[] | undefined): DraftGroup[] {
  return (groups ?? []).map((g) => ({
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    values: g.values.map((v) => ({
      label: v.label,
      priceDelta: String(v.priceDelta),
      isAvailable: v.isAvailable,
    })),
  }));
}

// Seção "Opções e adicionais" na edição do produto — mesmo modelo que
// iFood usa pra isso: cada grupo tem uma quantidade MÍNIMA e MÁXIMA de
// escolhas (não dois checkboxes soltos e desconectados). min=0 é
// opcional; min>=1 obriga escolher pelo menos essa quantidade; max=1 se
// comporta como rádio (uma opção só), max>1 como caixa de seleção com
// teto. Isso cobre "Tamanho" (min 1, max 1), "Adicionais" (min 0, max
// 4) e "Escolha 2 sabores" (min 2, max 2) com o mesmo par de campos.
// Edita tudo localmente e só grava no backend em "Salvar opções"
// (substitui a lista inteira — ver ProductsService.setOptions).
export function ProductOptionsEditor({
  product,
  onSaved,
}: {
  product: Product;
  onSaved: (updated: Product) => void;
}) {
  const [groups, setGroups] = useState<DraftGroup[]>(() => toDraft(product.options));
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addGroup() {
    setGroups((prev) => [...prev, { name: '', minSelect: 0, maxSelect: 1, values: [] }]);
  }

  function removeGroup(index: number) {
    setGroups((prev) => prev.filter((_, i) => i !== index));
  }

  function updateGroup(index: number, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function addValue(groupIndex: number) {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g;
        const values = [...g.values, { label: '', priceDelta: '0', isAvailable: true }];
        // Se o admin já tem mais opções cadastradas do que o máximo
        // permite, sobe o máximo sozinho — evita o erro comum de
        // cadastrar 4 adicionais e esquecer de liberar escolher mais de 1.
        const maxSelect = Math.max(g.maxSelect, values.length);
        return { ...g, values, maxSelect };
      }),
    );
  }

  function removeValue(groupIndex: number, valueIndex: number) {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex ? { ...g, values: g.values.filter((_, vi) => vi !== valueIndex) } : g,
      ),
    );
  }

  function updateValue(groupIndex: number, valueIndex: number, patch: Partial<DraftValue>) {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              values: g.values.map((v, vi) => (vi === valueIndex ? { ...v, ...patch } : v)),
            }
          : g,
      ),
    );
  }

  function toggleRequired(groupIndex: number, required: boolean) {
    updateGroup(groupIndex, { minSelect: required ? 1 : 0 });
  }

  async function handleSave() {
    setError(null);

    const namedGroups = groups.filter((g) => g.name.trim());
    const emptyGroup = namedGroups.find((g) => g.values.every((v) => !v.label.trim()));
    if (emptyGroup) {
      setError(
        `O grupo "${emptyGroup.name.trim()}" não tem nenhuma opção preenchida. Adicione ao menos uma opção (ex: "Bacon", "Grande") ou remova o grupo — um grupo vazio aparece sem nada pro cliente escolher.`,
      );
      return;
    }
    const invalidRange = namedGroups.find((g) => g.maxSelect < g.minSelect);
    if (invalidRange) {
      setError(`No grupo "${invalidRange.name.trim()}", o máximo não pode ser menor que o mínimo.`);
      return;
    }

    setIsSaving(true);
    try {
      const updated = await setProductOptions(
        product.id,
        namedGroups.map((g) => ({
          name: g.name.trim(),
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          values: g.values
            .filter((v) => v.label.trim())
            .map((v) => ({
              label: v.label.trim(),
              priceDelta: Number(v.priceDelta) || 0,
              isAvailable: v.isAvailable,
            })),
        })),
      );
      onSaved(updated);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3 mt-1 flex flex-col gap-3">
      <p className="text-xs font-semibold text-gray-500">
        Opções e adicionais (tamanho, ingredientes, adicionais com custo extra...)
      </p>

      {groups.map((group, gi) => (
        <div key={gi} className="border border-gray-100 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <input
              value={group.name}
              onChange={(e) => updateGroup(gi, { name: e.target.value })}
              placeholder='Nome do grupo (ex: "Tamanho", "Adicionais")'
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none"
            />
            <button onClick={() => removeGroup(gi)} className="shrink-0">
              <Trash2 size={14} className="text-gray-300" />
            </button>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={group.minSelect > 0}
                onChange={(e) => toggleRequired(gi, e.target.checked)}
              />
              Obrigatório
              {group.minSelect > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>mín.</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, group.values.length)}
                    value={group.minSelect}
                    onChange={(e) => updateGroup(gi, { minSelect: Number(e.target.value) || 1 })}
                    className="w-11 border border-gray-200 rounded px-1 py-0.5 text-[11px] outline-none"
                  />
                </>
              )}
            </label>

            <label className="flex items-center gap-1.5">
              Máximo por pedido
              <input
                type="number"
                min={1}
                value={group.maxSelect}
                onChange={(e) => updateGroup(gi, { maxSelect: Number(e.target.value) || 1 })}
                className="w-11 border border-gray-200 rounded px-1 py-0.5 text-[11px] outline-none"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            {group.values.map((value, vi) => (
              <div key={vi} className="flex items-center gap-1.5">
                <input
                  value={value.label}
                  onChange={(e) => updateValue(gi, vi, { label: e.target.value })}
                  placeholder='Opção (ex: "Grande", "Bacon", "Sem cebola")'
                  className={`flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none ${
                    !value.isAvailable ? 'opacity-40' : ''
                  }`}
                />
                <input
                  type="number"
                  step="0.01"
                  value={value.priceDelta}
                  onChange={(e) => updateValue(gi, vi, { priceDelta: e.target.value })}
                  placeholder="+R$"
                  className={`w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none ${
                    !value.isAvailable ? 'opacity-40' : ''
                  }`}
                />
                <label
                  className="flex items-center gap-1 text-[10px] text-gray-500 shrink-0"
                  title="Disponível"
                >
                  <input
                    type="checkbox"
                    checked={value.isAvailable}
                    onChange={(e) => updateValue(gi, vi, { isAvailable: e.target.checked })}
                  />
                  Disp.
                </label>
                <button onClick={() => removeValue(gi, vi)} className="shrink-0">
                  <Trash2 size={13} className="text-gray-300" />
                </button>
              </div>
            ))}
            <button
              onClick={() => addValue(gi)}
              className="text-[11px] font-semibold text-gray-500 flex items-center gap-1 self-start"
            >
              <Plus size={12} />
              Adicionar opção
            </button>
          </div>
        </div>
      ))}

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={addGroup}
        className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 flex items-center justify-center gap-1.5"
      >
        <Plus size={13} />
        Adicionar grupo de opções
      </button>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-60"
      >
        {isSaving ? 'Salvando...' : savedMessage ? 'Opções salvas!' : 'Salvar opções'}
      </button>
    </div>
  );
}
