import { useMemo, useState } from 'react';
import { ChevronDown, Languages, Sparkles } from 'lucide-react';
import { suggestTranslations } from '../lib/admin-api';
import type { ContentLanguage, ContentTranslations, TranslatableField } from '../types/translations';

const LANGS: { code: ContentLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];
const FIELD_LABEL: Record<TranslatableField, string> = { name: 'Nome', title: 'Título', description: 'Descrição' };
const WARNING_TEXT: Record<string, string> = {
  ai_not_configured: 'A tradução por IA não está configurada: só termos comuns de cardápio foram sugeridos. Preencha o restante à mão.',
  ai_unavailable: 'A tradução por IA está indisponível agora. Tente de novo em instantes ou preencha à mão.',
  untranslated_fields: 'Alguns campos ficaram sem sugestão.',
};

interface Props {
  kind: 'product' | 'promotion';
  fields: TranslatableField[];
  // Textos em português digitados no formulário (a base da tradução).
  source: Partial<Record<TranslatableField, string>>;
  value: ContentTranslations;
  onChange: (next: ContentTranslations) => void;
}

// Bloco opcional "Traduções": o cardápio mostra estes textos para clientes em
// inglês/espanhol; campo vazio cai no glossário de termos comuns e, por fim, no
// texto original. A sugestão automática só PREENCHE os campos — nada é salvo
// até o formulário ser salvo, então dá para revisar.
export function TranslationFields({ kind, fields, source, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null);

  const filledCount = useMemo(
    () => LANGS.reduce((n, l) => n + fields.filter((f) => (value[l.code]?.[f] ?? '').trim() !== '').length, 0),
    [value, fields],
  );
  const hasSource = fields.some((f) => (source[f] ?? '').trim() !== '');

  function setField(lang: ContentLanguage, field: TranslatableField, text: string) {
    onChange({ ...value, [lang]: { ...(value[lang] ?? {}), [field]: text } });
  }

  async function suggest(overwrite: boolean) {
    const texts: Partial<Record<TranslatableField, string>> = {};
    for (const f of fields) {
      const text = (source[f] ?? '').trim();
      if (text) texts[f] = text;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await suggestTranslations(kind, texts);
      const next: ContentTranslations = { ...value };
      let applied = 0;
      for (const lang of LANGS) {
        const got = result.translations[lang.code] ?? {};
        for (const f of fields) {
          const text = got[f];
          if (!text) continue;
          const current = (next[lang.code]?.[f] ?? '').trim();
          if (current && !overwrite) continue;
          next[lang.code] = { ...(next[lang.code] ?? {}), [f]: text };
          applied++;
        }
      }
      onChange(next);
      const origin = result.source === 'ai' ? 'por IA' : result.source === 'mixed' ? 'do glossário e por IA' : 'do glossário de cardápio';
      const warnings = result.warnings.map((w) => WARNING_TEXT[w]).filter(Boolean);
      if (applied === 0 && warnings.length === 0) setMessage({ tone: 'info', text: 'Nada novo para preencher.' });
      else setMessage({ tone: warnings.length ? 'warn' : 'info', text: [applied > 0 ? `${applied} sugestão(ões) ${origin}. Revise antes de salvar.` : '', ...warnings].filter(Boolean).join(' ') });
    } catch {
      setMessage({ tone: 'error', text: 'Não foi possível sugerir a tradução agora.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-700"
      >
        <Languages size={16} strokeWidth={1.5} className="text-gray-400" />
        <span className="flex-1">Traduções (opcional)</span>
        {filledCount > 0 && <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{filledCount}</span>}
        <ChevronDown size={16} strokeWidth={1.5} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-400">
            Clientes em inglês/espanhol veem estes textos. Vazio = termo comum de cardápio traduzido automaticamente ou o texto original.
          </p>
          {LANGS.map((lang) => (
            <div key={lang.code} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-gray-500">{lang.label}</p>
              {fields.map((field) => (
                <input
                  key={field}
                  value={value[lang.code]?.[field] ?? ''}
                  onChange={(e) => setField(lang.code, field, e.target.value)}
                  placeholder={`${FIELD_LABEL[field]} em ${lang.label}${source[field] ? ` — ${source[field]}` : ''}`}
                  maxLength={field === 'description' ? 1000 : field === 'title' ? 60 : 150}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none w-full"
                />
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void suggest(false)}
              disabled={busy || !hasSource}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold px-3 py-2 disabled:opacity-40"
            >
              <Sparkles size={14} strokeWidth={1.5} />
              {busy ? 'Traduzindo...' : 'Traduzir campos vazios'}
            </button>
            {filledCount > 0 && (
              <button
                type="button"
                onClick={() => void suggest(true)}
                disabled={busy || !hasSource}
                className="rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 px-3 py-2 disabled:opacity-40"
              >
                Refazer todos
              </button>
            )}
          </div>
          {message && (
            <p
              role="status"
              className={`text-xs ${message.tone === 'error' ? 'text-red-500' : message.tone === 'warn' ? 'text-amber-600' : 'text-gray-500'}`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
