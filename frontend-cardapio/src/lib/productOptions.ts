// Escolha de adicionais de um produto — lógica PURA (sem React), compartilhada
// pela página de detalhe do item e pelo painel do Modo Promoção, para as duas
// telas aplicarem exatamente as mesmas regras de mínimo/máximo e o mesmo preço.
import type { Product, ProductOptionGroup, SelectedCartOption } from '../types';

// groupId -> ids dos valores escolhidos nesse grupo.
export type OptionSelections = Record<string, string[]>;

// Grupo sem nenhuma opção cadastrada não aparece pro cliente: ficaria um título
// "morto" sem nada clicável embaixo (bug visto em produção).
export function visibleOptionGroups(product: Pick<Product, 'options'>): ProductOptionGroup[] {
  return (product.options ?? []).filter((group) => group.values.length > 0);
}

export type OptionToggleError = { type: 'max'; maxSelect: number; groupName: string };

export interface OptionToggleResult {
  selections: OptionSelections;
  error: OptionToggleError | null;
}

// Liga/desliga um valor. maxSelect === 1 age como rádio (escolher o mesmo de
// novo desmarca — permitido até em grupo obrigatório; o mínimo só barra no
// "Adicionar"). Acima do máximo, a seleção não muda e devolve o erro.
export function toggleOptionValue(
  selections: OptionSelections,
  group: Pick<ProductOptionGroup, 'id' | 'name' | 'maxSelect'>,
  valueId: string,
): OptionToggleResult {
  const current = selections[group.id] ?? [];

  if (group.maxSelect === 1) {
    const next = current[0] === valueId ? [] : [valueId];
    return { selections: { ...selections, [group.id]: next }, error: null };
  }

  if (current.includes(valueId)) {
    return { selections: { ...selections, [group.id]: current.filter((id) => id !== valueId) }, error: null };
  }
  if (current.length >= group.maxSelect) {
    return { selections, error: { type: 'max', maxSelect: group.maxSelect, groupName: group.name } };
  }
  return { selections: { ...selections, [group.id]: [...current, valueId] }, error: null };
}

// Escolhas no formato do carrinho, na ordem dos grupos/valores do cadastro.
export function buildSelectedOptions(
  groups: readonly ProductOptionGroup[],
  selections: OptionSelections,
): SelectedCartOption[] {
  return groups.flatMap((group) =>
    (selections[group.id] ?? []).flatMap((valueId) => {
      const value = group.values.find((v) => v.id === valueId);
      if (!value) return [];
      return [{ valueId: value.id, groupName: group.name, label: value.label, priceDelta: Number(value.priceDelta) }];
    }),
  );
}

// Primeiro grupo obrigatório ainda sem escolhas suficientes (null = pode adicionar).
// Mesma regra que o backend confere de novo; aqui é só feedback rápido.
export function findUnmetOptionGroup(
  groups: readonly ProductOptionGroup[],
  selections: OptionSelections,
): ProductOptionGroup | null {
  return groups.find((group) => (selections[group.id] ?? []).length < group.minSelect) ?? null;
}
