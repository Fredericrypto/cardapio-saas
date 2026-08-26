import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldX, ScanLine, AlertTriangle, Stamp } from 'lucide-react';
import {
  verifyReceiptCode,
  redeemReceipt,
  fetchLoyaltyPrograms,
  type VerifyReceiptResult,
} from '../lib/admin-api';
import type { LoyaltyProgram, RedeemResult, RedemptionPurpose } from '../types';

const PURPOSE_LABELS: Record<RedemptionPurpose, string> = {
  reembolso: 'Reembolso',
  reclamacao: 'Reclamação',
  retirada: 'Confirmar retirada',
  fidelidade: 'Carimbo de fidelidade',
  outro: 'Outro',
};

// Confere se um cupom (imagem PNG que o cliente salvou) é autêntico —
// cola/digita o código de autenticidade impresso no rodapé do cupom (ou
// aponta uma leitora/câmera de QR pra esse campo, já que a maioria dos
// leitores de QR simplesmente "digita" o conteúdo lido num campo de
// texto em foco). O backend recalcula a assinatura a partir dos dados
// REAIS do pedido no banco — se o valor ou a data foram alterados na
// imagem, a verificação falha, mesmo que o resto do cupom pareça
// idêntico ao original.
export function VerifyReceiptPage() {
  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<VerifyReceiptResult | null>(null);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [purpose, setPurpose] = useState<RedemptionPurpose | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  useEffect(() => {
    fetchLoyaltyPrograms().then((all) => setPrograms(all.filter((p) => p.isActive)));
  }, []);

  async function handleVerify() {
    if (!code.trim()) return;
    setIsChecking(true);
    setResult(null);
    setPurpose(null);
    setRedeemResult(null);
    setRedeemError(null);
    try {
      const res = await verifyReceiptCode(code.trim());
      setResult(res);
    } finally {
      setIsChecking(false);
    }
  }

  async function handleRedeem() {
    if (!purpose) return;
    if (purpose === 'fidelidade' && !selectedProgramId) return;
    setIsRedeeming(true);
    setRedeemError(null);
    try {
      const res = await redeemReceipt({
        code: code.trim(),
        purpose,
        notes: notes.trim() || undefined,
        loyaltyProgramId: purpose === 'fidelidade' ? selectedProgramId! : undefined,
      });
      setRedeemResult(res);
    } catch (err: any) {
      setRedeemError(err?.response?.data?.message ?? 'Não foi possível registrar. Tenta de novo.');
    } finally {
      setIsRedeeming(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <div className="flex items-center gap-2 mb-1">
        <ScanLine size={22} />
        <h1 className="text-xl font-display font-bold">Verificar cupom</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Cole ou digite o código de autenticidade impresso no rodapé do cupom (ou aponte uma leitora de
        QR code pra esse campo — a maioria digita o conteúdo automaticamente).
      </p>

      <div className="flex flex-col gap-3">
        <input
          type="text"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
          placeholder="Cole o código aqui..."
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
        />
        <button
          onClick={handleVerify}
          disabled={isChecking || !code.trim()}
          className="bg-gray-900 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {isChecking ? 'Verificando...' : 'Verificar'}
        </button>
      </div>

      {result && (
        <div
          className={`mt-6 rounded-xl border p-4 ${
            result.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
          }`}
        >
          {result.valid && result.kind === 'avulso' && result.order ? (
            <>
              <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                <ShieldCheck size={18} />
                Cupom autêntico (pedido avulso)
              </div>
              <div className="text-sm text-gray-700 flex flex-col gap-1">
                <p>
                  <span className="text-gray-400">Pedido:</span> #{result.order.id.slice(0, 8)}
                </p>
                <p>
                  <span className="text-gray-400">Total:</span> R${' '}
                  {Number(result.order.total).toFixed(2).replace('.', ',')}
                </p>
                <p>
                  <span className="text-gray-400">Data:</span>{' '}
                  {new Date(result.order.createdAt).toLocaleString('pt-BR')}
                </p>
                {result.order.customerName && (
                  <p>
                    <span className="text-gray-400">Cliente:</span> {result.order.customerName}
                  </p>
                )}
              </div>
            </>
          ) : result.valid && result.kind === 'mesa' && result.session ? (
            <>
              <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                <ShieldCheck size={18} />
                Cupom autêntico (mesa)
              </div>
              <div className="text-sm text-gray-700 flex flex-col gap-1">
                <p>
                  <span className="text-gray-400">Mesa:</span> {result.session.table?.number ?? '—'}
                </p>
                {result.sessionGrandTotal != null && (
                  <p>
                    <span className="text-gray-400">Total:</span> R${' '}
                    {result.sessionGrandTotal.toFixed(2).replace('.', ',')}
                  </p>
                )}
                {result.session.closedAt && (
                  <p>
                    <span className="text-gray-400">Fechada em:</span>{' '}
                    {new Date(result.session.closedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-red-700 font-semibold">
              <ShieldX size={18} />
              Código inválido — não corresponde a nenhum cupom genuíno, ou os dados foram alterados.
            </div>
          )}
        </div>
      )}

      {result?.valid && (
        <div className="mt-4 border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Registrar uso desse cupom</p>
          <p className="text-xs text-gray-400 mb-3">
            Se esse cupom já foi usado antes pro MESMO motivo (mesmo que por outro funcionário, em
            outro dia), o sistema avisa na hora — não deixa aprovar de novo.
          </p>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {(Object.keys(PURPOSE_LABELS) as RedemptionPurpose[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPurpose(p);
                  setRedeemResult(null);
                  setRedeemError(null);
                }}
                className={`py-2 rounded-lg text-xs font-semibold border ${
                  purpose === p ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500'
                }`}
              >
                {PURPOSE_LABELS[p]}
              </button>
            ))}
          </div>

          {purpose === 'fidelidade' && (
            <div className="mb-3">
              {programs.length === 0 ? (
                <p className="text-xs text-gray-400">
                  Nenhum programa de fidelidade ativo — crie um em "Fidelidade" no menu.
                </p>
              ) : (
                <select
                  value={selectedProgramId ?? ''}
                  onChange={(e) => setSelectedProgramId(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="">Escolha o programa...</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (a cada {p.stampsRequired})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {purpose && purpose !== 'fidelidade' && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observação (opcional)"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none mb-3 resize-none"
            />
          )}

          {purpose && (
            <button
              onClick={handleRedeem}
              disabled={isRedeeming || (purpose === 'fidelidade' && !selectedProgramId)}
              className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {isRedeeming ? 'Registrando...' : `Confirmar ${PURPOSE_LABELS[purpose].toLowerCase()}`}
            </button>
          )}

          {redeemError && <p className="text-xs text-red-500 mt-2">{redeemError}</p>}

          {redeemResult && (
            <div
              className={`mt-3 rounded-lg p-3 text-sm ${
                redeemResult.alreadyRedeemed ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'
              }`}
            >
              {redeemResult.alreadyRedeemed ? (
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800">
                      Esse cupom JÁ foi usado pra {PURPOSE_LABELS[redeemResult.redemption.purpose].toLowerCase()}.
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      Em {new Date(redeemResult.redemption.createdAt).toLocaleString('pt-BR')}, por{' '}
                      {redeemResult.redemption.staffName}.
                      {redeemResult.redemption.notes && ` Obs: "${redeemResult.redemption.notes}"`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <ShieldCheck size={16} className="text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800">Registrado com sucesso.</p>
                    {redeemResult.stampProgress && (
                      <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                        <Stamp size={13} />
                        {redeemResult.stampProgress.rewardJustGranted
                          ? '🎉 Cartão completo! Prêmio liberado — vai aparecer na fila de entrega em Fidelidade.'
                          : `${redeemResult.stampProgress.stampsCount}/${redeemResult.stampProgress.stampsRequired} carimbos.`}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
