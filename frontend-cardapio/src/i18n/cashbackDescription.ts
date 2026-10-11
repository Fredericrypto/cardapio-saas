import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// O backend devolve a origem do cashback em português ("Cashback do pedido").
// Aqui o texto vira chave e sai no idioma do app; texto desconhecido fica como veio.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const KEY_BY_TEXT: Record<string, string> = {
  "Cashback do pedido": "desc.order",
  "Prêmio de fidelidade": "desc.loyalty",
  "Ajuste do restaurante": "desc.adjustment",
  "Usado em um pedido": "desc.usedInOrder"
};

export function cashbackDescriptionLabel(text: string, t: Translate): string {
  const id = KEY_BY_TEXT[text.trim()];
  const key = `cashback.${id ?? ''}`;
  return id && key in getDictionary(DEFAULT_LANGUAGE) ? t(key as TranslationKey) : text;
}
