// Modo Vitrine — sub-aba de Configurações. Dois cartões de natureza diferente:
//  • "Neste aparelho": preferências do navegador (localStorage), gravam NA HORA;
//  • "Imagens da vitrine": do restaurante, entram no botão "Salvar alterações" da página.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProducts } from '../../lib/admin-api';
import {
  IDLE_MINUTES_OPTIONS,
  getDeviceSettings,
  subscribeDeviceSettings,
  updateDeviceSettings,
} from '../../lib/vitrine/deviceSettings';
import { requestVitrinePreview } from '../../lib/vitrine/preview';
import { addItem, hasItem, itemsOf, moveItem, removeAt } from '../../lib/vitrine/selection';
import type { Product } from '../../types';
import { VITRINE_MAX_ITEMS } from '../../types/vitrine';
import type { VitrineItem, VitrineSettings } from '../../types/vitrine';

const SELECT = 'border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900/10';
const PICKER_PAGE = 24;

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
      <div>
        <h3 className="font-display text-lg text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="mt-1 w-4 h-4 accent-gray-900" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-gray-800">
        {label}
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

const coverOf = (p: Product): string | null => p.imageUrl ?? p.images?.[0] ?? null;

export function VitrineSettingsSection({
  value,
  onChange,
}: {
  value: VitrineSettings | null;
  onChange: (next: VitrineSettings | null) => void;
}) {
  const { tenant } = useAuth();
  const device = useSyncExternalStore(subscribeDeviceSettings, getDeviceSettings);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((list) => {
        if (!cancelled) setProducts(list);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = itemsOf(value);
  const full = items.length >= VITRINE_MAX_ITEMS;
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const cover = tenant?.coverImageUrl ?? null;

  const candidates = (products ?? []).filter(
    (p) => p.isAvailable && coverOf(p) !== null && !hasItem(value, { k: 'product', id: p.id }),
  );
  const visibleCandidates = showAll ? candidates : candidates.slice(0, PICKER_PAGE);
  const bannerAvailable = cover !== null && !hasItem(value, { k: 'banner' });

  const describe = (item: VitrineItem): { label: string; image: string | null; missing: boolean } => {
    if (item.k === 'banner') return { label: 'Banner do restaurante', image: cover, missing: cover === null };
    const p = byId.get(item.id);
    if (!p) return { label: products === null ? 'Carregando…' : 'Item removido do cardápio', image: null, missing: products !== null };
    return { label: p.name, image: coverOf(p), missing: !p.isAvailable || coverOf(p) === null };
  };

  return (
    <>
      <Panel
        title="Neste aparelho"
        description="Vale só para este computador/navegador e grava na hora — não precisa clicar em Salvar alterações."
      >
        <Check
          label="Ativar o Modo Vitrine neste aparelho"
          hint="Depois do tempo sem uso, a tela vira uma vitrine com as fotos do restaurante. Mexeu o mouse, tocou ou digitou: volta ao painel exatamente onde estava."
          checked={device.enabled}
          onChange={(v) => updateDeviceSettings({ enabled: v })}
        />
        <label className="flex flex-col gap-1.5 text-sm text-gray-800 max-w-xs">
          Entrar após ficar sem uso por
          <select
            className={SELECT}
            value={device.idleMinutes}
            onChange={(e) => updateDeviceSettings({ idleMinutes: Number(e.target.value) })}
          >
            {IDLE_MINUTES_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-800">Sair da vitrine sozinha quando chegar:</p>
          <Check label="Pedido novo" hint="Mesa, balcão, entrega e pedidos aguardando pagamento." checked={device.wakeOn.orders} onChange={(v) => updateDeviceSettings({ wakeOn: { orders: v } })} />
          <Check label="Chamado de garçom" checked={device.wakeOn.calls} onChange={(v) => updateDeviceSettings({ wakeOn: { calls: v } })} />
          <Check label="Fechamento de conta" hint="Mesa que pediu para fechar a conta." checked={device.wakeOn.closings} onChange={(v) => updateDeviceSettings({ wakeOn: { closings: v } })} />
          <p className="text-xs text-gray-500">
            Se desmarcar uma opção, a vitrine continua na tela quando isso acontecer (o som de aviso segue tocando).
            Enquanto houver pendência numa opção marcada, a vitrine não abre.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={requestVitrinePreview}
            className="rounded-xl bg-gray-900 text-white text-sm font-medium px-4 py-2.5 hover:bg-gray-800 transition-colors"
          >
            Pré-visualizar
          </button>
          <span className="text-xs text-gray-500">
            Dica: para esconder as abas do navegador, aperte F11 antes (o site não consegue ligar a tela cheia sozinho).
          </span>
        </div>
      </Panel>

      <Panel
        title="Imagens da vitrine"
        description={`Vale para todo o restaurante, em todos os aparelhos. Até ${VITRINE_MAX_ITEMS} imagens; salva junto com os demais campos em Salvar alterações.`}
      >
        {items.length === 0 ? (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
            Nenhuma imagem escolhida: a vitrine usa o banner e as primeiras fotos do cardápio. Escolha abaixo para definir a sua ordem.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((item, index) => {
              const d = describe(item);
              return (
                <li key={item.k === 'banner' ? 'banner' : item.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2">
                  <span className="w-6 text-center text-xs text-gray-400">{index + 1}</span>
                  {d.image ? (
                    <img src={d.image} alt="" loading="lazy" className="w-14 h-14 rounded-lg object-cover bg-gray-100" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gray-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">{d.label}</p>
                    {d.missing && <p className="text-xs text-amber-600">Não aparece na vitrine (indisponível, sem foto ou removido).</p>}
                  </div>
                  <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => onChange(moveItem(value, index, -1))} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" aria-label="Descer" disabled={index === items.length - 1} onClick={() => onChange(moveItem(value, index, 1))} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                    <ArrowDown size={16} />
                  </button>
                  <button type="button" aria-label="Remover" onClick={() => onChange(removeAt(value, index))} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">
            Adicionar {full && <span className="text-xs font-normal text-amber-600">— limite de {VITRINE_MAX_ITEMS} imagens atingido</span>}
          </p>
          {loadFailed && <p className="text-xs text-red-600 mb-2">Não consegui carregar o cardápio agora. Tente novamente em instantes.</p>}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {bannerAvailable && (
              <button type="button" disabled={full} onClick={() => onChange(addItem(value, { k: 'banner' }))} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 disabled:opacity-40">
                <img src={cover as string} alt="" loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[11px] px-1.5 py-1 truncate">Banner</span>
                <Plus size={14} className="absolute top-1.5 right-1.5 text-white drop-shadow" />
              </button>
            )}
            {visibleCandidates.map((p) => (
              <button key={p.id} type="button" disabled={full} onClick={() => onChange(addItem(value, { k: 'product', id: p.id }))} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 disabled:opacity-40">
                <img src={coverOf(p) as string} alt="" loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[11px] px-1.5 py-1 truncate">{p.name}</span>
                <Plus size={14} className="absolute top-1.5 right-1.5 text-white drop-shadow" />
              </button>
            ))}
          </div>
          {products !== null && candidates.length > PICKER_PAGE && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm text-gray-700 underline">
              Mostrar todos os {candidates.length} itens
            </button>
          )}
          {products !== null && candidates.length === 0 && !bannerAvailable && (
            <p className="text-xs text-gray-500">Nenhum item com foto disponível para adicionar.</p>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Use fotos nítidas: em monitor grande, foto pequena fica borrada. Só aparecem itens disponíveis e com foto.
        </p>
      </Panel>
    </>
  );
}
