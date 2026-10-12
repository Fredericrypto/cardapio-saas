import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CONTENT_LANGUAGES,
  MAX_TRANSLATION_LENGTH,
  sanitizeTranslations,
  type ContentLanguage,
  type ContentTranslations,
} from '../../common/i18n/content-translations';
import { translateFromGlossary } from '../../common/i18n/menu-glossary';

export type SuggestSource = 'glossary' | 'ai' | 'mixed' | 'none';

export interface SuggestResult {
  translations: ContentTranslations;
  source: SuggestSource;
  // 'ai_not_configured' | 'ai_unavailable' | 'untranslated_fields'
  warnings: string[];
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const ALLOWED_FIELDS = ['name', 'title', 'description'] as const;
const AI_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = [
  'You translate restaurant menu texts written in Brazilian Portuguese.',
  'Rules: keep brand and proper names; keep numbers, units and the R$ currency exactly as written;',
  'keep the same tone and roughly the same length; do not add or remove information; no explanations.',
  'Reply with ONLY a JSON object shaped as {"en": {"<field>": "<text>"}, "es": {"<field>": "<text>"}} containing',
  'exactly the requested languages and fields.',
].join(' ');

// Sugestão de tradução para o painel. 1) glossário local (determinístico, sem
// custo) para termos conhecidos; 2) IA só para o que sobrar, SE houver chave
// configurada (ANTHROPIC_API_KEY). Sem chave, ou se a IA falhar, devolve o que o
// glossário resolveu + aviso — o cadastro nunca fica travado por causa disso.
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  // Injetável nos testes.
  fetchFn: FetchLike = (url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>;

  async suggest(texts: Record<string, unknown>, targets?: ContentLanguage[]): Promise<SuggestResult> {
    const source = this.cleanTexts(texts);
    const fields = Object.keys(source);
    if (fields.length === 0) throw new BadRequestException('Informe ao menos um texto para traduzir.');
    const langs = (targets && targets.length > 0 ? targets : [...CONTENT_LANGUAGES]).filter((l): l is ContentLanguage =>
      (CONTENT_LANGUAGES as readonly string[]).includes(l),
    );

    const result: Record<string, Record<string, string>> = {};
    const pending: Array<{ lang: ContentLanguage; field: string }> = [];
    for (const lang of langs) {
      for (const field of fields) {
        const hit = translateFromGlossary(source[field], lang);
        if (hit) (result[lang] ??= {})[field] = hit;
        else pending.push({ lang, field });
      }
    }
    const fromGlossary = langs.length * fields.length - pending.length;
    const warnings: string[] = [];
    let fromAi = 0;

    if (pending.length > 0) {
      const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (!apiKey) {
        warnings.push('ai_not_configured');
      } else {
        try {
          const ai = await this.askAi(apiKey, source, pending);
          for (const { lang, field } of pending) {
            const text = ai?.[lang]?.[field];
            if (text) {
              (result[lang] ??= {})[field] = text;
              fromAi++;
            }
          }
        } catch (err) {
          this.logger.warn(`Tradução por IA indisponível: ${(err as Error).message}`);
          warnings.push('ai_unavailable');
        }
      }
      if (fromGlossary + fromAi < langs.length * fields.length) warnings.push('untranslated_fields');
    }

    const clean = sanitizeTranslations(result, ALLOWED_FIELDS) ?? {};
    const kind: SuggestSource = fromAi > 0 && fromGlossary > 0 ? 'mixed' : fromAi > 0 ? 'ai' : fromGlossary > 0 ? 'glossary' : 'none';
    return { translations: clean, source: kind, warnings };
  }

  private cleanTexts(texts: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of ALLOWED_FIELDS) {
      const value = texts[field];
      if (typeof value !== 'string') continue;
      const text = value.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (text.length > MAX_TRANSLATION_LENGTH[field]) {
        throw new BadRequestException(`O texto de "${field}" é longo demais para traduzir.`);
      }
      out[field] = text;
    }
    return out;
  }

  private async askAi(
    apiKey: string,
    source: Record<string, string>,
    pending: Array<{ lang: ContentLanguage; field: string }>,
  ): Promise<Record<string, Record<string, string>> | null> {
    const wanted: Record<string, Record<string, string>> = {};
    for (const { lang, field } of pending) (wanted[lang] ??= {})[field] = source[field];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const response = await this.fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.TRANSLATION_MODEL?.trim() || 'claude-haiku-5-5',
          max_tokens: 1200,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: JSON.stringify({ translate_from: 'pt-BR', requested: wanted }) }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return TranslationService.parseAiReply(await response.json(), wanted);
    } finally {
      clearTimeout(timer);
    }
  }

  // Extrai o JSON da resposta e aceita SÓ línguas/campos que foram pedidos.
  static parseAiReply(body: unknown, wanted: Record<string, Record<string, string>>): Record<string, Record<string, string>> | null {
    const content = (body as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
    const text = content?.find((c) => c.type === 'text')?.text;
    if (!text) return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
    if (parsed == null || typeof parsed !== 'object') return null;
    const out: Record<string, Record<string, string>> = {};
    for (const [lang, fields] of Object.entries(wanted)) {
      const got = (parsed as Record<string, unknown>)[lang];
      if (got == null || typeof got !== 'object') continue;
      for (const field of Object.keys(fields)) {
        const value = (got as Record<string, unknown>)[field];
        if (typeof value === 'string' && value.trim()) (out[lang] ??= {})[field] = value.trim();
      }
    }
    return out;
  }
}
