import { DEFAULT_LANGUAGE, type AppLanguage } from './languages';
import { ptBR, type TranslationKey } from './dictionaries/pt-BR';
import { en } from './dictionaries/en';
import { es } from './dictionaries/es';

export type TranslationParams = Record<string, string | number>;

const DICTIONARIES: Record<AppLanguage, Record<TranslationKey, string>> = { 'pt-BR': ptBR, en, es };

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

// Tradução pura (sem React): `{nome}` é substituído por params.nome. Chave
// ausente no idioma cai em pt-BR — nunca mostra a chave crua na tela.
export function translate(language: AppLanguage, key: TranslationKey, params?: TranslationParams): string {
  const text = DICTIONARIES[language]?.[key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
  return interpolate(text, params);
}

export function getDictionary(language: AppLanguage): Record<TranslationKey, string> {
  return DICTIONARIES[language];
}
