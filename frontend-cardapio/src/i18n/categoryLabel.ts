import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// Nome da categoria no idioma do app. Categorias do CATÁLOGO (têm `key`) vêm
// do dicionário (`category.<key>`); categorias personalizadas do restaurante
// (sem key) e qualquer chave sem tradução mostram o nome cadastrado, intacto.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function categoryLabel(category: { key: string | null; name: string }, t: Translate): string {
  if (!category.key) return category.name;
  const key = `category.${category.key}` as TranslationKey;
  return key in getDictionary(DEFAULT_LANGUAGE) ? t(key) : category.name;
}

// Texto de dado dinâmico com traduções opcionais ({ 'pt-BR': ..., en: ... }).
// Hoje o banco guarda só texto simples, então cai direto no valor original.
export function localizedText(value: string | Partial<Record<string, string>>, language: string): string {
  if (typeof value === 'string') return value;
  return value[language] ?? value['pt-BR'] ?? value.pt ?? Object.values(value).find(Boolean) ?? '';
}
