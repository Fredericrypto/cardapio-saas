import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE, readStoredLanguage } from './languages';
import { translateFromGlossary } from './menuGlossary';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

// Nome da categoria no idioma do app. Categorias do CATÁLOGO (têm `key`) vêm
// do dicionário (`category.<key>`); categorias personalizadas do restaurante
// passam pelo glossário de termos de cardápio e, se não houver, mostram o nome
// cadastrado, intacto.
export function categoryLabel(category: { key: string | null; name: string }, t: Translate): string {
  if (category.key) {
    const key = `category.${category.key}` as TranslationKey;
    if (key in getDictionary(DEFAULT_LANGUAGE)) return t(key);
  }
  const language = readStoredLanguage();
  return language === 'en' || language === 'es' ? (translateFromGlossary(category.name, language) ?? category.name) : category.name;
}

// Nome/descrição de prato, promoção etc. com fallback transparente:
// idioma ativo -> pt-BR -> pt -> qualquer valor. Para entidades com
// `translations` use `localizedField` (i18n/contentText.ts).
export type LocalizedValue = string | Partial<Record<string, string>> | null | undefined;

export function localizedText(value: LocalizedValue, language: string = readStoredLanguage()): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[language] ?? value['pt-BR'] ?? value.pt ?? Object.values(value).find(Boolean) ?? '';
}
