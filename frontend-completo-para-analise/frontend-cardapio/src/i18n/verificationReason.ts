import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// O backend grava o motivo de recusa em português (lista fechada). Aqui o texto
// volta à chave e sai no idioma do app; motivo desconhecido aparece como veio.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const REASON_KEY_BY_TEXT: Record<string, string> = {
  "A foto não mostra seu rosto claramente": "foto_sem_rosto_claro",
  "A foto está com qualidade baixa (borrada, escura ou cortada)": "foto_baixa_qualidade",
  "A foto parece ser de uma tela, impressão ou imagem da internet": "suspeita_falsificacao",
  "A foto não parece condizer com o restante do seu perfil": "nao_condiz_com_perfil",
  "A foto mostra mais de uma pessoa": "multiplas_pessoas",
  "Outro motivo": "outro_motivo"
};

export function verificationReasonLabel(reason: string, t: Translate): string {
  const id = REASON_KEY_BY_TEXT[reason.trim()];
  if (!id) return reason;
  const key = `verification.reasons.${id}` as TranslationKey;
  return key in getDictionary(DEFAULT_LANGUAGE) ? t(key) : reason;
}
