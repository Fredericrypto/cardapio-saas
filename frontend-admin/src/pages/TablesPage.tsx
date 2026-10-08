import { useEffect, useState } from 'react';
import { Plus, Trash2, Printer, Copy, Check, Table2, Store } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchTables, createTable, deleteTable, fetchLocations } from '../lib/admin-api';
import { useAuth } from '../contexts/AuthContext';
import type { RestaurantTable, Location } from '../types';

const MENU_BASE_URL = import.meta.env.VITE_MENU_BASE_URL || 'http://localhost:5173';

// Nível de correção de erro do QR: subimos de 'L' (padrão da lib, o mais
// frágil) pra 'M' nos QRs feitos pra ser escaneados de verdade (impresso
// ou na tela) — 'L' tolera menos sujeira/dobra/reflexo no papel e é o
// tipo de coisa que só aparece como "câmera não lê" sem nenhum erro no
// código, sem relação com o texto/nome da mesa.
const SCAN_QR_LEVEL = 'M';

export function TablesPage() {
  const { tenant } = useAuth();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableKind, setNewTableKind] = useState<'mesa' | 'balcao'>('mesa');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [printingTable, setPrintingTable] = useState<RestaurantTable | null>(null);
  // Sem celular à mão pra escanear o QR, não tinha como testar o link de
  // uma mesa específica — só dava pra ver o QR, não copiar o link em
  // texto. Isso guarda qual mesa teve o link copiado por 2s, só pro "✓
  // Copiado" aparecer e sumir sozinho.
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);

  async function handleCopyLink(table: RestaurantTable) {
    await navigator.clipboard.writeText(tableUrl(table));
    setCopiedTableId(table.id);
    setTimeout(() => setCopiedTableId((current) => (current === table.id ? null : current)), 2000);
  }

  async function loadAll() {
    const [tablesData, locationsData] = await Promise.all([fetchTables(), fetchLocations()]);
    setTables(tablesData);
    setLocations(locationsData);
    setSelectedLocationId((current) => current || locationsData[0]?.id || '');
    setIsLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreate() {
    if (!newTableNumber.trim() || !selectedLocationId) return;
    await createTable(newTableNumber.trim(), selectedLocationId, newTableKind);
    setNewTableNumber('');
    loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta mesa? O QR code impresso deixará de funcionar.')) return;
    await deleteTable(id);
    loadAll();
  }

  function tableUrl(table: RestaurantTable) {
    return `${MENU_BASE_URL}/${tenant?.slug}/mesa/${table.qrCodeToken}`;
  }

  function locationName(locationId: string) {
    return locations.find((l) => l.id === locationId)?.name ?? '';
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400">Carregando...</div>;
  }

  // Só agrupa visualmente por loja quando existe mais de uma — pra quem
  // tem uma loja só, a tela fica exatamente como sempre foi.
  const hasMultipleLocations = locations.length > 1;
  const groupedTables = hasMultipleLocations
    ? locations.map((location) => ({
        location,
        tables: tables.filter((t) => t.locationId === location.id),
      }))
    : [{ location: locations[0], tables }];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-6">
        Mesas
      </h1>

      <div className="flex gap-2 mb-6">
        {hasMultipleLocations && (
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setNewTableKind('mesa')}
            className={`px-3 py-2.5 text-sm font-semibold flex items-center gap-1.5 ${
              newTableKind === 'mesa' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'
            }`}
          >
            <Table2 size={14} />
            Mesa
          </button>
          <button
            type="button"
            onClick={() => setNewTableKind('balcao')}
            className={`px-3 py-2.5 text-sm font-semibold flex items-center gap-1.5 border-l border-gray-200 ${
              newTableKind === 'balcao' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'
            }`}
          >
            <Store size={14} />
            Balcão
          </button>
        </div>
        <input
          value={newTableNumber}
          onChange={(e) => setNewTableNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={newTableKind === 'mesa' ? 'Ex: 5' : 'Ex: 1'}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
        />
        <button
          onClick={handleCreate}
          className="bg-gray-900 text-white rounded-lg px-4 flex items-center gap-1.5 text-sm font-semibold"
        >
          <Plus size={15} />
          Adicionar
        </button>
      </div>

      {tables.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">
          Nenhuma mesa cadastrada ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedTables.map(({ location, tables: locationTables }) => (
            <div key={location?.id ?? 'default'}>
              {hasMultipleLocations && (
                <p className="text-xs font-semibold text-gray-500 mb-2">{location?.name}</p>
              )}
              {(['mesa', 'balcao'] as const).map((kind) => {
                const kindTables = locationTables.filter((t) => (t.kind ?? 'mesa') === kind);
                if (kindTables.length === 0) return null;
                return (
                  <div key={kind} className="mb-5 last:mb-0">
                    {/* Separação minimalista: só um rótulo pequeno com ícone —
                        nada de cor/badge chamativo, mas bate o olho e já dá
                        pra saber se é mesa ou balcão sem ler cada card. */}
                    <div className="flex items-center gap-1.5 mb-2">
                      {kind === 'mesa' ? (
                        <Table2 size={13} className="text-gray-400" />
                      ) : (
                        <Store size={13} className="text-gray-400" />
                      )}
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {kind === 'mesa' ? 'Mesas' : 'Balcão'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {kindTables.map((table) => (
                        <div
                          key={table.id}
                          className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-3"
                        >
                          <QRCodeSVG value={tableUrl(table)} size={100} level={SCAN_QR_LEVEL} />
                          <p className="text-sm font-semibold text-gray-900">{table.number}</p>
                          <div className="flex gap-2 w-full">
                            <button
                              onClick={() => handleCopyLink(table)}
                              className="flex-1 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600 flex items-center justify-center gap-1"
                            >
                              {copiedTableId === table.id ? (
                                <>
                                  <Check size={13} />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  Copiar link
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setPrintingTable(table)}
                              className="flex-1 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600 flex items-center justify-center gap-1"
                            >
                              <Printer size={13} />
                              Imprimir
                            </button>
                            <button
                              onClick={() => handleDelete(table.id)}
                              className="py-1.5 px-2.5 rounded-lg bg-gray-100"
                            >
                              <Trash2 size={13} className="text-gray-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {printingTable && (
        <PrintQrModal
          table={printingTable}
          url={tableUrl(printingTable)}
          tenantName={
            hasMultipleLocations
              ? `${tenant?.name} · ${locationName(printingTable.locationId)}`
              : tenant?.name ?? ''
          }
          onClose={() => setPrintingTable(null)}
        />
      )}
    </div>
  );
}

function PrintQrModal({
  table,
  url,
  tenantName,
  onClose,
}: {
  table: RestaurantTable;
  url: string;
  tenantName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 max-w-xs w-full">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500">{tenantName}</p>
          <QRCodeSVG value={url} size={220} level={SCAN_QR_LEVEL} />
          <p className="font-display text-lg font-bold text-gray-900">
            {table.number}
          </p>
          <p className="text-xs text-gray-400">Escaneie para ver o cardápio</p>
        </div>

        <div className="flex gap-2 w-full mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Fechar
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
