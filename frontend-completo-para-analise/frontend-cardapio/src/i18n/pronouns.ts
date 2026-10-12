import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// O backend guarda os pronomes como lista fechada em português ("ela/dela").
// A exibição segue o idioma do app (pt: ela/dela - en: she/her - es: ella/de ella).
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const GROUP_KEY_BY_LABEL: Record<string, string> = {
  'Tradicionais Femininos': 'groupFeminine',
  'Tradicionais Masculinos': 'groupMasculine',
};

function has(key: string): key is TranslationKey {
  return key in getDictionary(DEFAULT_LANGUAGE);
}

export function pronounLabel(token: string, t: Translate): string {
  const key = `pronoun.${token}`;
  return has(key) ? t(key) : token;
}

export function pronounGroupLabel(label: string, t: Translate): string {
  const id = GROUP_KEY_BY_LABEL[label];
  const key = `pronoun.${id ?? ''}`;
  return id && has(key) ? t(key) : label;
}

export function formatPronouns(value: string, t: Translate): string {
  return value
    .split('/')
    .map((token) => pronounLabel(token.trim(), t))
    .join('/');
}
