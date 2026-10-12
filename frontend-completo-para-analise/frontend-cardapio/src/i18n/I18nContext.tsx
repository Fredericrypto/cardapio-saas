import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  readStoredLanguage,
  storeLanguage,
  type AppLanguage,
} from './languages';
import { translate, type TranslationParams } from './translate';
import type { TranslationKey } from './dictionaries/pt-BR';

interface I18nContextValue {
  language: AppLanguage;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  // Troca o idioma (estado + localStorage + <html lang>). A tela de idioma
  // chama isso no meio da splash; o servidor é sincronizado por quem chama.
  setLanguage: (language: AppLanguage) => void;
  // Datas/horas no idioma escolhido (valores monetários NÃO passam por aqui).
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => readStoredLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: AppLanguage) => {
    storeLanguage(next);
    setLanguageState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dateLocale = LANGUAGE_OPTIONS.find((o) => o.code === language)?.dateLocale ?? 'pt-BR';
    return {
      language,
      t: (key, params) => translate(language, key, params),
      setLanguage,
      formatDate: (input, options) => new Date(input).toLocaleDateString(dateLocale, options),
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Fora do provider (ex.: testes) devolve pt-BR em vez de quebrar a tela.
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    language: DEFAULT_LANGUAGE,
    t: (key, params) => translate(DEFAULT_LANGUAGE, key, params),
    setLanguage: () => undefined,
    formatDate: (v, o) => new Date(v).toLocaleDateString('pt-BR', o),
  };
}
