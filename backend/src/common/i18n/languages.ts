// Idiomas do app do cliente. pt-BR é o padrão (e o fallback de qualquer valor
// desconhecido). Cópia da lista em frontend-cardapio/src/i18n/languages.ts.
export const SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'pt-BR';

export function normalizeLanguage(value: unknown): AppLanguage {
  return SUPPORTED_LANGUAGES.find((l) => l === value) ?? DEFAULT_LANGUAGE;
}
