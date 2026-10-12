import { readStoredLanguage } from './languages';
import { translateFromGlossary } from './menuGlossary';

// Conteúdo cadastrado pelo restaurante (prato, promoção) no idioma do app.
// Ordem de precedência (a primeira que existir vence):
//   1. tradução explícita cadastrada no painel (entity.translations[idioma][campo])
//   2. glossário de termos comuns de cardápio (correspondência exata do nome inteiro)
//   3. o texto original (pt-BR) — nunca some conteúdo
// Em pt-BR devolve sempre o original.
export type ContentTranslations = Partial<Record<'en' | 'es', Partial<Record<string, string>>>>;

export function localizedField<T extends { translations?: ContentTranslations | null }>(
  entity: T | null | undefined,
  field: Extract<keyof T, string>,
  language: string = readStoredLanguage(),
): string {
  if (!entity) return '';
  const original = entity[field];
  const base = typeof original === 'string' ? original : '';
  if (language !== 'en' && language !== 'es') return base;
  const explicit = entity.translations?.[language]?.[field];
  if (explicit && explicit.trim()) return explicit;
  return base ? (translateFromGlossary(base, language) ?? base) : base;
}

// Para textos soltos (sem entidade): só glossário -> original.
export function localizedPlain(text: string, language: string = readStoredLanguage()): string {
  if (!text || (language !== 'en' && language !== 'es')) return text;
  return translateFromGlossary(text, language) ?? text;
}
