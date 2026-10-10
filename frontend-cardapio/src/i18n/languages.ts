// Idiomas do app do cliente. pt-BR é o padrão e o fallback de qualquer valor
// desconhecido. Lista espelhada em backend/src/common/i18n/languages.ts.
export const SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'pt-BR';
export const LANGUAGE_STORAGE_KEY = 'cardapio_language';

export interface LanguageOption {
  code: AppLanguage;
  // Nome na PRÓPRIA língua (nunca traduzido: quem não lê o idioma atual
  // precisa conseguir achar o seu).
  nativeName: string;
  // Código de país da bandeira (ícone em SVG; sem emoji).
  flag: 'BR' | 'US' | 'ES';
  // Locale usado só para DATAS e números genéricos. Moeda é sempre BRL/pt-BR.
  dateLocale: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'pt-BR', nativeName: 'Português (Brasil)', flag: 'BR', dateLocale: 'pt-BR' },
  { code: 'en', nativeName: 'English', flag: 'US', dateLocale: 'en-US' },
  { code: 'es', nativeName: 'Español', flag: 'ES', dateLocale: 'es-ES' },
];

export function normalizeLanguage(value: unknown): AppLanguage {
  return SUPPORTED_LANGUAGES.find((l) => l === value) ?? DEFAULT_LANGUAGE;
}

export function readStoredLanguage(): AppLanguage {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function storeLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* modo privado / storage cheio: a preferência continua valendo na sessão e no servidor */
  }
}
