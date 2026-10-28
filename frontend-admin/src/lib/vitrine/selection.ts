// Edição da lista de imagens da vitrine (PURO). Sempre devolve um VitrineSettings
// que o backend aceita (≤ 12, sem repetidos); lista vazia = null (volta ao padrão).
import { VITRINE_MAX_ITEMS } from '../../types/vitrine';
import type { VitrineItem, VitrineSettings } from '../../types/vitrine';

export function itemsOf(s: VitrineSettings | null | undefined): VitrineItem[] {
  return s ? s.items : [];
}

export function fromItems(items: VitrineItem[]): VitrineSettings | null {
  return items.length > 0 ? { v: 1, items } : null;
}

export function sameItem(a: VitrineItem, b: VitrineItem): boolean {
  if (a.k === 'banner') return b.k === 'banner';
  return b.k === 'product' && a.id === b.id;
}

export function hasItem(s: VitrineSettings | null | undefined, item: VitrineItem): boolean {
  return itemsOf(s).some((i) => sameItem(i, item));
}

export function addItem(s: VitrineSettings | null | undefined, item: VitrineItem): VitrineSettings | null {
  const items = itemsOf(s);
  if (items.length >= VITRINE_MAX_ITEMS || hasItem(s, item)) return fromItems([...items]);
  return fromItems([...items, item]);
}

export function removeAt(s: VitrineSettings | null | undefined, index: number): VitrineSettings | null {
  return fromItems(itemsOf(s).filter((_, i) => i !== index));
}

export function moveItem(s: VitrineSettings | null | undefined, index: number, delta: -1 | 1): VitrineSettings | null {
  const items = [...itemsOf(s)];
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return fromItems(items);
  [items[index], items[to]] = [items[to], items[index]];
  return fromItems(items);
}
