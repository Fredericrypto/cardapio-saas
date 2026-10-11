import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE, readStoredLanguage } from './languages';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

// Nome da categoria no idioma do app. Categorias do CATÁLOGO (têm `key`) vêm
// do dicionário (`category.<key>`); categorias personalizadas do restaurante
// (sem key) e qualquer chave sem tradução mostram o nome cadastrado, intacto.
export function categoryLabel(category: { key: string | null; name: string }, t: Translate): string {
  if (!category.key) return category.name;
  const key = `category.${category.key}` as TranslationKey;
  return key in getDictionary(DEFAULT_LANGUAGE) ? t(key) : category.name;
}

// Nome/descrição de prato, promoção etc. com fallback transparente:
// idioma ativo -> pt-BR -> pt -> qualquer valor. Hoje o banco guarda texto
// simples (devolvido como está); quando houver traduções por idioma
// ({ 'pt-BR': '...', en: '...' }) o helper já as usa, sem mexer nas telas.
export type LocalizedValue = string | Partial<Record<string, string>> | null | undefined;

export function localizedText(value: LocalizedValue, language: string = readStoredLanguage()): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[language] ?? value['pt-BR'] ?? value.pt ?? Object.values(value).find(Boolean) ?? '';
}
