// Traduções opcionais do CONTEÚDO que o restaurante cadastra (nome/descrição de
// prato, título/descrição de promoção). pt-BR é o próprio campo da entidade;
// aqui ficam só as demais línguas:
//   { en: { name: 'Beef dumplings' }, es: { description: '...' } }
export const CONTENT_LANGUAGES = ['en', 'es'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export type ContentTranslations = Partial<Record<ContentLanguage, Partial<Record<string, string>>>>;

export const MAX_TRANSLATION_LENGTH: Record<string, number> = { name: 150, title: 60, description: 1000 };

// Aceita QUALQUER entrada (vem de JSON do cliente) e devolve só o que é válido:
// línguas e campos conhecidos, texto aparado e dentro do limite. Nada sobrou = null.
export function sanitizeTranslations(input: unknown, fields: readonly string[]): ContentTranslations | null {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: ContentTranslations = {};
  for (const lang of CONTENT_LANGUAGES) {
    const raw = (input as Record<string, unknown>)[lang];
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const clean: Record<string, string> = {};
    for (const field of fields) {
      const value = (raw as Record<string, unknown>)[field];
      if (typeof value !== 'string') continue;
      const text = value.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      clean[field] = text.slice(0, MAX_TRANSLATION_LENGTH[field] ?? 500);
    }
    if (Object.keys(clean).length > 0) out[lang] = clean;
  }
  return Object.keys(out).length > 0 ? out : null;
}
