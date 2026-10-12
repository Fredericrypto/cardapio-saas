// Traduções opcionais do conteúdo cadastrado (prato / promoção). pt-BR é o
// próprio campo; aqui ficam só en e es. Espelha backend/src/common/i18n/content-translations.ts.
export type ContentLanguage = 'en' | 'es';
export type ContentTranslations = Partial<Record<ContentLanguage, Partial<Record<string, string>>>>;
export type TranslatableField = 'name' | 'title' | 'description';
