import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, RotateCcw, Save } from 'lucide-react';
import { fetchSiodSettings, resetSiodSettings, saveSiodSettings } from '../../lib/admin-api';
import { draftFromParams, formatForInput, hasErrors, isDraftSameAs, paramsFromDraft, validateDraft } from '../../lib/siodSettings';
import type { SiodDraft } from '../../lib/siodSettings';
import type { SiodOverview, SiodParamKey, SiodSettingsView, SiodSuggestion } from '../../types/siod';
import { apiErrorMessage } from './format';

interface FieldDef {
  key: SiodParamKey;
  unit: string;
  help: string;
}

const GROUPS: Array<{ title: string; description: string; fields: FieldDef[] }> = [
  {
    title: 'Preparo',
    description: 'Como o app calcula quanto tempo o pedido leva para ficar pronto.',
    fields: [
      { key: 'basePrepMinutes', unit: 'min', help: 'Tempo de preparo com a cozinha vazia.' },
      { key: 'queuePenaltyMinutesPerOrder', unit: 'min', help: 'Minutos somados para cada pedido em andamento (pendente, confirmado ou preparando) na mesma loja.' },
      { key: 'minTotalMinutes', unit: 'min', help: 'O app nunca promete menos que isso (preparo + entrega). Mínimo de 15 min, fixo.' },
    ],
  },
  {
    title: 'Faixa mostrada ao cliente',
    description: 'Intervalo em volta do prazo prometido. Ex.: prazo 40 min, −5 e +10 → “35 a 50 min”.',
    fields: [
      { key: 'windowBelowMinutes', unit: 'min', help: 'Quanto a faixa começa abaixo do prazo.' },
      { key: 'windowAboveMinutes', unit: 'min', help: 'Quanto a faixa termina acima do prazo.' },
    ],
  },
  {
    title: 'Horário de pico',
    description: 'Com muitos pedidos em andamento, o tempo de preparo cresce progressivamente.',
    fields: [
      { key: 'peakThresholdActiveOrders', unit: 'pedidos', help: 'A partir de quantos pedidos em andamento o pico começa a valer.' },
      { key: 'peakStepPerOrder', unit: 'fração', help: 'Acréscimo no preparo por pedido acima do limiar. 0,10 = +10% por pedido.' },
      { key: 'peakMaxMultiplier', unit: '×', help: 'Teto do acréscimo. 1,5 = no máximo +50% no preparo.' },
    ],
  },
];

function SuggestionBox({
  title,
  suggestion,
  canApply,
  onApply,
}: {
  title: string;
  suggestion: SiodSuggestion;
  canApply: boolean;
  onApply: (value: number) => void;
}) {
  const { value } = suggestion;
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 flex flex-col gap-1">
      <p className="font-semibold text-gray-800">{title}</p>
      {value === null ? (
        <p className="text-gray-500">{suggestion.reason}</p>
      ) : (
        <>
          <p>
            Pelos últimos pedidos comparáveis ({suggestion.sampleSize}), o valor típico é <strong>{value} min</strong> (hoje: {suggestion.current} min).
          </p>
          {value !== suggestion.current && canApply && (
            <button type="button" onClick={() => onApply(value)} className="self-start rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
              Usar {value} no campo
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface Props {
  canManage: boolean;
  // Visão geral do período escolhido na página (fonte das sugestões). Pode ser null enquanto carrega.
  overview: SiodOverview | null;
}

export function SiodSettingsPanel({ canManage, overview }: Props) {
  const [view, setView] = useState<SiodSettingsView | null>(null);
  const [draft, setDraft] = useState<SiodDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const apply = useCallback((v: SiodSettingsView) => {
    setView(v);
    setDraft(draftFromParams(v.params));
  }, []);

  useEffect(() => {
    let alive = true;
    fetchSiodSettings()
      .then((v) => {
        if (alive) apply(v);
      })
      .catch((err) => {
        if (alive) setLoadError(apiErrorMessage(err, 'Não foi possível carregar os parâmetros.'));
      });
    return () => {
      alive = false;
    };
  }, [apply]);

  if (loadError) return <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{loadError}</p>;
  if (!view || !draft) return <p className="text-sm text-gray-400">Carregando parâmetros...</p>;

  const errors = validateDraft(draft, view.limits);
  const dirty = !isDraftSameAs(draft, view.params);
  const canSave = canManage && dirty && !hasErrors(errors) && !saving;

  const setField = (key: SiodParamKey, text: string): void => {
    setMessage(null);
    setDraft({ ...draft, [key]: text });
  };

  const onSave = async (): Promise<void> => {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    try {
      apply(await saveSiodSettings(paramsFromDraft(draft)));
      setMessage({ tone: 'ok', text: 'Parâmetros salvos. Valem para os próximos pedidos; os já feitos mantêm a estimativa original.' });
    } catch (err) {
      setMessage({ tone: 'error', text: apiErrorMessage(err, 'Não foi possível salvar os parâmetros.') });
    } finally {
      setSaving(false);
    }
  };

  const onReset = async (): Promise<void> => {
    if (!canManage || saving || view.isDefault) return;
    if (!window.confirm('Restaurar os parâmetros padrão do SIOD? Vale para os próximos pedidos.')) return;
    setSaving(true);
    setMessage(null);
    try {
      apply(await resetSiodSettings());
      setMessage({ tone: 'ok', text: 'Parâmetros padrão restaurados.' });
    } catch (err) {
      setMessage({ tone: 'error', text: apiErrorMessage(err, 'Não foi possível restaurar o padrão.') });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (invalid: boolean): string =>
    `w-28 border rounded-lg px-2.5 py-2 text-sm outline-none ${invalid ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'} disabled:bg-gray-50 disabled:text-gray-500`;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {!canManage && (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600" role="status">
          Você pode ver os parâmetros, mas só quem tem permissão de gerenciar configurações pode alterá-los.
        </p>
      )}
      <p className="text-xs text-gray-500">
        {view.isDefault ? 'Usando os parâmetros padrão.' : 'Usando parâmetros personalizados.'} A mudança vale só para pedidos novos: cada pedido guarda, no momento da compra, o cálculo exato que gerou a estimativa.
      </p>

      {overview && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <Lightbulb size={14} /> Sugestões com base nos pedidos reais
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SuggestionBox title="Tempo base de preparo" suggestion={overview.suggestions.basePrep} canApply={canManage} onApply={(v) => setField('basePrepMinutes', formatForInput(v))} />
            <SuggestionBox title="Minutos por pedido na fila" suggestion={overview.suggestions.queuePenalty} canApply={canManage} onApply={(v) => setField('queuePenaltyMinutesPerOrder', formatForInput(v))} />
          </div>
          <p className="text-[11px] text-gray-400">A sugestão só preenche o campo; nada muda até você clicar em Salvar. Usa o período selecionado acima e só pedidos medidos, sem pico e sem o piso mínimo.</p>
        </section>
      )}

      {GROUPS.map((g) => (
        <section key={g.title} className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">{g.title}</h2>
            <p className="text-xs text-gray-400">{g.description}</p>
          </div>
          {g.fields.map((f) => {
            const err = errors[f.key];
            const id = `siod-${f.key}`;
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <label htmlFor={id} className="text-xs font-semibold text-gray-700">
                  {view.labels[f.key]}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    value={draft[f.key]}
                    disabled={!canManage || saving}
                    onChange={(e) => setField(f.key, e.target.value)}
                    aria-invalid={Boolean(err)}
                    aria-describedby={`${id}-help`}
                    className={inputCls(Boolean(err))}
                  />
                  <span className="text-xs text-gray-400">{f.unit}</span>
                  <span className="text-[11px] text-gray-400">padrão {formatForInput(view.defaults[f.key])}</span>
                </div>
                <p id={`${id}-help`} className={`text-[11px] ${err ? 'text-red-600' : 'text-gray-400'}`}>
                  {err ?? f.help}
                </p>
              </div>
            );
          })}
        </section>
      ))}

      {message && (
        <p role="status" className={`text-sm rounded-xl px-4 py-3 ${message.tone === 'ok' ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
          {message.text}
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!canSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-40"
          >
            <Save size={14} /> {saving ? 'Salvando...' : 'Salvar parâmetros'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(draftFromParams(view.params));
              setMessage(null);
            }}
            disabled={!dirty || saving}
            className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Desfazer alterações
          </button>
          <button
            type="button"
            onClick={() => void onReset()}
            disabled={view.isDefault || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw size={13} /> Restaurar padrão
          </button>
        </div>
      )}
    </div>
  );
}
