import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ScanLine, AlertTriangle, Stamp, QrCode, Search } from 'lucide-react';
import {
  verifyReceiptCode,
  redeemReceipt,
  fetchLoyaltyPrograms,
  type VerifyReceiptResult,
} from '../lib/admin-api';
import { CouponQrScanner } from '../components/CouponQrScanner';
import { extractCouponCode } from '../lib/couponQr';
import { feedbackError, feedbackScan, feedbackSuccess } from '../lib/scanFeedback';
import type { LoyaltyProgram, RedeemResult, RedemptionPurpose } from '../types';

const PURPOSE_LABELS: Record<RedemptionPurpose, string> = {
  reembolso: 'Reembolso',
  reclamacao: 'Reclamação',
  retirada: 'Confirmar retirada',
  fidelidade: 'Carimbo de fidelidade',
  outro: 'Outro',
};

// Confere se um cupom (imagem PNG que o cliente salvou) é autêntico — lendo o
// QR code com a câmera (celular ou webcam), ou colando/digitando o código de
// autenticidade impresso no rodapé do cupom. O backend recalcula a assinatura a
// partir dos dados REAIS do pedido no banco — se o valor ou a data foram
// alterados na imagem, a verificação falha, mesmo que o resto do cupom pareça
// idêntico ao original.
const CARD = 'rounded-2xl border border-gray-200 bg-white dark:bg-[#1E1E20] dark:border-white/10';

function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function messageOf(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? fallback;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-800 dark:text-gray-100 font-medium text-right">{value}</span>
    </div>
  );
}

export function VerifyReceiptPage() {
  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<VerifyReceiptResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
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

  async function verify(rawCode: string) {
    const trimmed = rawCode.trim();
    if (!trimmed) return;
    setIsChecking(true);
    setResult(null);
    setVerifyError(null);
    setVerifiedCode(null);
    setPurpose(null);
    setRedeemResult(null);
    setRedeemError(null);
    try {
      const res = await verifyReceiptCode(trimmed);
      setResult(res);
      setVerifiedCode(trimmed);
      if (res.valid) feedbackSuccess();
      else feedbackError();
    } catch (err) {
      setVerifyError(messageOf(err, 'Não foi possível verificar agora. Confira a conexão e tente de novo.'));
      feedbackError();
    } finally {
      setIsChecking(false);
    }
  }

  function handleScanned(raw: string) {
    setIsScanning(false);
    const scanned = extractCouponCode(raw);
    if (!scanned) {
      setResult(null);
      setVerifyError('Esse QR code não parece ser de um cupom. Tente de novo ou digite o código.');
      feedbackError();
      return;
    }
    feedbackScan();
    setCode(scanned);
    void verify(scanned);
  }

  async function handleRedeem() {
    if (!purpose || !verifiedCode) return;
    if (purpose === 'fidelidade' && !selectedProgramId) return;
    setIsRedeeming(true);
    setRedeemError(null);
    try {
      const res = await redeemReceipt({
        code: verifiedCode,
        purpose,
        notes: notes.trim() || undefined,
        loyaltyProgramId: purpose === 'fidelidade' ? selectedProgramId! : undefined,
      });
      setRedeemResult(res);
      if (res.alreadyRedeemed) feedbackError();
      else feedbackSuccess();
    } catch (err) {
      setRedeemError(messageOf(err, 'Não foi possível registrar. Tenta de novo.'));
      feedbackError();
    } finally {
      setIsRedeeming(false);
    }
  }

  const order = result?.valid && result.kind === 'avulso' ? result.order : null;
  const session = result?.valid && result.kind === 'mesa' ? result.session : null;
  const discount = order?.discountAmount ?? 0;
  const promotionTitles = order?.promotionTitlesSnapshot?.length
    ? order.promotionTitlesSnapshot
    : order?.promotionTitleSnapshot
      ? [order.promotionTitleSnapshot]
      : [];

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <div className="flex items-center gap-2 mb-1">
        <ScanLine size={22} strokeWidth={1.5} />
        <h1 className="text-xl font-display font-bold">Verificar cupom</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Leia o QR code do cupom do cliente com a câmera ou digite o código de autenticidade do rodapé.
      </p>

      <div className={`${CARD} p-5 flex flex-col gap-4`}>
        <button
          onClick={() => setIsScanning(true)}
          className="flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl py-3.5 text-sm font-semibold active:opacity-80 transition-opacity"
        >
          <QrCode size={20} strokeWidth={1.5} />
          Ler QR Code do cupom
        </button>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-gray-400">
          <span className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
          ou digite o código
          <span className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void verify(code)}
            placeholder="Cole o código aqui..."
            className="flex-1 min-w-0 border border-gray-200 dark:border-white/10 bg-transparent rounded-xl px-3 py-2.5 text-sm outline-none font-mono"
          />
          <button
            onClick={() => void verify(code)}
            disabled={isChecking || !code.trim()}
            className="flex items-center gap-1.5 border border-gray-900 dark:border-white/30 rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
          >
            <Search size={16} strokeWidth={1.5} />
            {isChecking ? 'Verificando...' : 'Verificar'}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {result?.valid && (order || session) && (
          <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 dark:bg-green-500/10 dark:border-green-500/30 p-5">
            <div className="flex flex-col items-center text-center mb-4">
              <CheckCircle2 size={44} strokeWidth={1.5} className="text-green-600 animate-coupon-pop" />
              <p className="mt-2 font-display font-bold text-green-800 dark:text-green-300">Cupom válido</p>
              <p className="text-xs text-green-700/80 dark:text-green-300/70">
                {order ? 'Pedido avulso (balcão/entrega)' : 'Conta de mesa'}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {order && (
                <>
                  <DetailRow label="Pedido" value={`#${order.id.slice(0, 8)}`} />
                  {order.customerName && <DetailRow label="Cliente" value={order.customerName} />}
                  {discount > 0 && (
                    <DetailRow
                      label={promotionTitles.length ? `Desconto (${promotionTitles.join(', ')})` : 'Desconto'}
                      value={`- ${brl(Number(discount))}`}
                    />
                  )}
                  {Number(order.cashbackUsed ?? 0) > 0 && (
                    <DetailRow label="Cashback usado" value={`- ${brl(Number(order.cashbackUsed))}`} />
                  )}
                  <DetailRow label="Total" value={brl(Number(order.total))} />
                  <DetailRow label="Data" value={new Date(order.createdAt).toLocaleString('pt-BR')} />
                </>
              )}
              {session && (
                <>
                  <DetailRow label="Mesa" value={String(session.table?.number ?? '—')} />
                  {result.sessionGrandTotal != null && <DetailRow label="Total" value={brl(result.sessionGrandTotal)} />}
                  {session.closedAt && (
                    <DetailRow label="Fechada em" value={new Date(session.closedAt).toLocaleString('pt-BR')} />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {result && !result.valid && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-5 text-center">
            <XCircle size={44} strokeWidth={1.5} className="mx-auto text-red-600 animate-coupon-pop" />
            <p className="mt-2 font-display font-bold text-red-800 dark:text-red-300">Cupom inválido</p>
            <p className="text-sm text-red-700 dark:text-red-300/80 mt-1">
              O código não corresponde a nenhum cupom genuíno deste estabelecimento, ou os dados do cupom foram
              alterados.
            </p>
          </div>
        )}

        {verifyError && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-5 text-center">
            <AlertTriangle size={36} strokeWidth={1.5} className="mx-auto text-red-600" />
            <p className="text-sm text-red-700 dark:text-red-300/80 mt-2">{verifyError}</p>
          </div>
        )}
      </div>

      {result?.valid && (
        <div className={`mt-4 ${CARD} p-5`}>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-100 mb-2">Dar baixa no cupom</p>
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
              {isRedeeming ? 'Registrando...' : `Dar baixa no cupom — ${PURPOSE_LABELS[purpose].toLowerCase()}`}
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
                  <AlertTriangle size={18} strokeWidth={1.5} className="text-amber-600 shrink-0 mt-0.5" />
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
                  <CheckCircle2 size={18} strokeWidth={1.5} className="text-green-600 shrink-0 mt-0.5 animate-coupon-pop" />
                  <div>
                    <p className="font-semibold text-green-800">Registrado com sucesso.</p>
                    {redeemResult.stampProgress && (
                      <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                        <Stamp size={13} strokeWidth={1.5} />
                        {redeemResult.stampProgress.rewardJustGranted
                          ? 'Cartão completo! Prêmio liberado — vai aparecer na fila de entrega em Fidelidade.'
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

      {isScanning && <CouponQrScanner onDecoded={handleScanned} onClose={() => setIsScanning(false)} />}
    </div>
  );
}
