import { useEffect, useState } from 'react';
import { BadgeCheck, Clock3, ShieldCheck, ShieldAlert, X, Check, BookOpen, Search } from 'lucide-react';
import { useDashboardData } from '../contexts/DashboardDataContext';
import {
  approveVerification,
  rejectVerification,
  fetchVerificationStats,
  checkVerificationIntegrity,
  revokeVerification,
  suspendCustomer,
  unsuspendCustomer,
  type PendingVerification,
  type VerificationIntegrityCheck,
} from '../lib/admin-api';

// Mesma lista fechada do backend (backend/src/modules/customers/verification-rejection-reasons.ts)
// — mantida em espelho aqui de propósito: são só 6 strings fixas, e
// duplicar evita ter que expor um endpoint só pra buscar essa lista.
// Qualquer mudança na lista do backend precisa ser replicada aqui.
const REJECTION_REASONS: { value: string; label: string }[] = [
  { value: 'foto_sem_rosto_claro', label: 'A foto não mostra o rosto claramente' },
  { value: 'foto_baixa_qualidade', label: 'A foto está com qualidade baixa (borrada, escura ou cortada)' },
  { value: 'suspeita_falsificacao', label: 'A foto parece ser de uma tela, impressão ou imagem da internet' },
  { value: 'nao_condiz_com_perfil', label: 'A foto não parece condizer com o restante do perfil' },
  { value: 'multiplas_pessoas', label: 'A foto mostra mais de uma pessoa' },
  { value: 'outro_motivo', label: 'Outro motivo' },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Contagem regressiva "estilo boleto": conforme o vencimento se
// aproxima, a cor escala de neutro → laranja → vermelho. Atualiza a
// cada minuto — não precisa de mais frequência que isso pra um prazo
// medido em dias.
function ReviewCountdown({ deadline }: { deadline: string }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const msLeft = new Date(deadline).getTime() - Date.now();
  const hoursLeft = msLeft / (1000 * 60 * 60);
  const expired = msLeft <= 0;

  let colorClass = 'text-gray-500 bg-gray-50';
  if (expired || hoursLeft < 24) colorClass = 'text-red-600 bg-red-50 font-bold';
  else if (hoursLeft < 72) colorClass = 'text-amber-600 bg-amber-50 font-semibold';

  const label = expired
    ? 'Prazo esgotado — será recusado automaticamente em breve'
    : hoursLeft < 24
      ? `Vence em ${Math.max(1, Math.round(hoursLeft))}h`
      : `Vence em ${Math.floor(hoursLeft / 24)} dia${Math.floor(hoursLeft / 24) === 1 ? '' : 's'}`;

  return (
    <span className={`text-xs rounded-full px-2 py-1 flex items-center gap-1 w-fit ${colorClass}`}>
      <Clock3 size={12} />
      {label}
    </span>
  );
}

export function VerificationsPage() {
  const { pendingVerifications, refetchPendingVerifications } = useDashboardData();
  const [stats, setStats] = useState<{ verifiedCount: number; pendingCount: number } | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<PendingVerification | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Ferramenta de consulta de integridade — "esse cliente é REALMENTE
  // verificado?" (pedido explícito do Felipe, não só um selinho bonito).
  const [checkQuery, setCheckQuery] = useState('');
  const [checkResult, setCheckResult] = useState<VerificationIntegrityCheck | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [punishStep, setPunishStep] = useState<'revoke' | 'suspend' | null>(null);
  const [punishReason, setPunishReason] = useState('');
  const [isPunishing, setIsPunishing] = useState(false);

  async function handleCheckIntegrity() {
    if (!checkQuery.trim()) return;
    setIsChecking(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const result = await checkVerificationIntegrity(checkQuery.trim());
      setCheckResult(result);
    } catch (err: any) {
      setCheckError(err?.response?.data?.message ?? 'Cliente não encontrado.');
    } finally {
      setIsChecking(false);
    }
  }

  async function handleConfirmPunish() {
    if (!checkResult || !punishStep || !punishReason.trim()) return;
    setIsPunishing(true);
    try {
      if (punishStep === 'revoke') {
        await revokeVerification(checkResult.customerId, punishReason.trim());
      } else {
        await suspendCustomer(checkResult.customerId, punishReason.trim());
      }
      const refreshed = await checkVerificationIntegrity(checkResult.customerId);
      setCheckResult(refreshed);
      setPunishStep(null);
      setPunishReason('');
      refreshStats();
    } catch (err: any) {
      setCheckError(err?.response?.data?.message ?? 'Não foi possível concluir. Tenta de novo.');
    } finally {
      setIsPunishing(false);
    }
  }

  function refreshStats() {
    fetchVerificationStats().then(setStats).catch(() => {});
  }
  useEffect(() => {
    refreshStats();
  }, []);

  // Pisca cada solicitação que ainda não foi "vista" (clicada) pelo
  // admin — mesmo padrão do resto do painel (ver ActiveTableCard em
  // DashboardPage.tsx): fica piscando até o admin clicar no card, e
  // depois disso não pisca mais mesmo que a lista seja recarregada.
  function isNew(id: string) {
    return !dismissedIds.has(id);
  }
  function dismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
  }

  async function handleConfirmApprove() {
    if (!reviewing) return;
    setIsSubmitting(true);
    try {
      const result = await approveVerification(reviewing.id);
      setToast(
        result.photoDeleted
          ? `${reviewing.name} foi verificado(a) — a foto enviada já foi excluída.`
          : `${reviewing.name} foi verificado(a). A foto será excluída em instantes.`,
      );
      refetchPendingVerifications();
      refreshStats();
      setReviewing(null);
      setConfirmAction(null);
    } catch {
      setToast('Não foi possível aprovar agora. Tenta de novo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmReject() {
    if (!reviewing || !rejectReason) return;
    setIsSubmitting(true);
    try {
      const result = await rejectVerification(reviewing.id, rejectReason);
      setToast(
        result.photoDeleted
          ? `Verificação de ${reviewing.name} recusada — a foto enviada já foi excluída.`
          : `Verificação de ${reviewing.name} recusada. A foto será excluída em instantes.`,
      );
      refetchPendingVerifications();
      refreshStats();
      setReviewing(null);
      setConfirmAction(null);
      setRejectReason(null);
    } catch {
      setToast('Não foi possível recusar agora. Tenta de novo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="p-6 max-w-5xl mx-auto flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-2xl font-bold text-gray-900">Verificações Pendentes</h1>
          <button
            onClick={() => setShowDocs((v) => !v)}
            title="Como funciona essa área"
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0"
          >
            <BookOpen size={17} />
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-5">
          Clientes que pediram o selo de verificado, aguardando sua decisão.
        </p>

        <div className="flex gap-3 mb-6">
          <div className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl px-4 py-3">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#EFF6FF' }}
            >
              <BadgeCheck size={17} style={{ color: '#1D9BF0' }} />
            </span>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">{stats?.verifiedCount ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Verificados</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl px-4 py-3">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#FFF7ED' }}
            >
              <Clock3 size={17} style={{ color: '#F59E0B' }} />
            </span>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">{stats?.pendingCount ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Pendentes</p>
            </div>
          </div>
        </div>

        {/* Ferramenta de consulta — pedido explícito do Felipe: uma forma
            do estabelecimento CONFIRMAR de verdade se um selo é
            legítimo, com prova técnica (assinatura criptográfica
            recalculada na hora), não só confiar no que aparece na tela.
            Detecta se alguém tentou forjar `isVerified` por fora do
            fluxo normal de aprovação (ex: acesso direto ao banco). */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-gray-900 mb-1">Verificar integridade de um cliente</p>
          <p className="text-xs text-gray-400 mb-3">
            Confere com prova técnica se o selo desse cliente é legítimo — detecta qualquer
            tentativa de burlar o sistema por fora da aprovação normal.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={checkQuery}
              onChange={(e) => setCheckQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckIntegrity()}
              placeholder="Nome, e-mail ou telefone do cliente"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleCheckIntegrity}
              disabled={isChecking}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Search size={14} />
              {isChecking ? 'Buscando...' : 'Verificar'}
            </button>
          </div>
          {checkError && <p className="text-xs text-red-500 mt-2">{checkError}</p>}

          {checkResult && (
            <div
              className={`mt-4 rounded-xl p-4 border ${
                checkResult.verdict === 'legitimate'
                  ? 'bg-blue-50 border-blue-100'
                  : checkResult.verdict === 'tampered'
                    ? 'bg-red-50 border-red-100'
                    : 'bg-gray-50 border-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                {checkResult.verdict === 'legitimate' && <ShieldCheck size={18} className="text-blue-600 shrink-0" />}
                {checkResult.verdict === 'tampered' && <ShieldAlert size={18} className="text-red-600 shrink-0" />}
                {checkResult.verdict === 'not_verified' && <ShieldCheck size={18} className="text-gray-400 shrink-0" />}
                <p className="text-sm font-bold text-gray-900">{checkResult.name}</p>
                <span className="text-xs text-gray-400">{checkResult.email}</span>
              </div>

              <p
                className={`text-sm font-semibold mt-2 ${
                  checkResult.verdict === 'legitimate'
                    ? 'text-blue-700'
                    : checkResult.verdict === 'tampered'
                      ? 'text-red-700'
                      : 'text-gray-500'
                }`}
              >
                {checkResult.verdict === 'legitimate' &&
                  'Sim — esse cliente é 100% legitimamente verificado.'}
                {checkResult.verdict === 'tampered' &&
                  'NÃO — sinal de adulteração detectado. O selo desse cliente não confere com nenhuma aprovação real do sistema.'}
                {checkResult.verdict === 'not_verified' && 'Esse cliente não está verificado no momento.'}
              </p>

              {checkResult.verdict === 'legitimate' && (
                <p className="text-xs text-gray-500 mt-1">
                  Aprovado em {new Date(checkResult.verificationDecidedAt!).toLocaleString('pt-BR')}.
                  Prova criptográfica conferida agora mesmo e válida.
                </p>
              )}
              {checkResult.verdict === 'tampered' && (
                <p className="text-xs text-gray-600 mt-1">
                  Detectado e sinalizado permanentemente. Recomendação: revogar a verificação e
                  considerar suspender a conta.
                </p>
              )}
              {checkResult.revokedAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Verificação revogada em {new Date(checkResult.revokedAt).toLocaleString('pt-BR')} —
                  motivo: {checkResult.revokedReason}
                </p>
              )}
              {checkResult.isSuspended && (
                <p className="text-xs font-semibold text-red-600 mt-1">
                  Conta suspensa — motivo: {checkResult.suspendedReason}
                </p>
              )}

              <div className="flex gap-2 mt-3">
                {checkResult.isVerified && (
                  <button
                    onClick={() => {
                      setPunishStep('revoke');
                      setPunishReason('');
                    }}
                    className="text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg"
                  >
                    Revogar verificação
                  </button>
                )}
                {!checkResult.isSuspended ? (
                  <button
                    onClick={() => {
                      setPunishStep('suspend');
                      setPunishReason('');
                    }}
                    className="text-xs font-semibold bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
                  >
                    Suspender conta
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await unsuspendCustomer(checkResult.customerId);
                      setCheckResult(await checkVerificationIntegrity(checkResult.customerId));
                    }}
                    className="text-xs font-semibold bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
                  >
                    Reativar conta
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {!pendingVerifications ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : pendingVerifications.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
            <ShieldCheck size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma verificação esperando análise agora.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingVerifications.map((v) => (
              <div
                key={v.id}
                onClick={() => isNew(v.id) && dismiss(v.id)}
                className={`border rounded-xl p-4 flex gap-4 bg-white ${
                  isNew(v.id) ? 'attention-blink cursor-pointer' : 'border-gray-100'
                }`}
              >
                <img
                  src={v.verificationPhotoUrl ?? undefined}
                  alt=""
                  className="w-20 h-20 rounded-lg object-cover shrink-0 bg-gray-100"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900">{v.name}</p>
                      <p className="text-xs text-gray-400">{v.email}</p>
                      {v.phone && <p className="text-xs text-gray-400">{v.phone}</p>}
                    </div>
                    {v.reviewDeadline && <ReviewCountdown deadline={v.reviewDeadline} />}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Pedido em {formatDate(v.verificationRequestedAt)}
                    {v.photoDeleteAt && ` · foto some em ${formatDate(v.photoDeleteAt)} se não decidir`}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReviewing(v);
                        setConfirmAction('approve');
                      }}
                      className="text-xs font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
                    >
                      <Check size={13} />
                      Aprovar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReviewing(v);
                        setRejectReason(null);
                        setConfirmAction(null);
                      }}
                      className="text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg flex items-center gap-1"
                    >
                      <X size={13} />
                      Recusar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDocs && <VerificationDocsPanel onClose={() => setShowDocs(false)} />}

      {reviewing && confirmAction === null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full">
            <p className="font-bold text-gray-900 mb-1">Recusar verificação de {reviewing.name}</p>
            <p className="text-xs text-gray-400 mb-4">
              O motivo escolhido aparece direto pro cliente. Ele pode tentar de novo depois.
            </p>
            <div className="flex flex-col gap-1.5 mb-4">
              {REJECTION_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRejectReason(r.value)}
                  className={`text-left text-sm px-3 py-2 rounded-lg border ${
                    rejectReason === r.value
                      ? 'border-gray-900 bg-gray-50 font-medium text-gray-900'
                      : 'border-gray-100 text-gray-600'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setReviewing(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Cancelar
              </button>
              <button
                disabled={!rejectReason}
                onClick={() => setConfirmAction('reject')}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewing && confirmAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full text-center">
            <p className="font-bold text-gray-900 mb-2">
              {confirmAction === 'approve'
                ? `Verificar ${reviewing.name}?`
                : `Recusar a verificação de ${reviewing.name}?`}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Essa decisão é definitiva e não pode ser desfeita depois. A foto enviada será excluída
              imediatamente.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Voltar
              </button>
              <button
                disabled={isSubmitting}
                onClick={confirmAction === 'approve' ? handleConfirmApprove : handleConfirmReject}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
              >
                {isSubmitting ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {punishStep && checkResult && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full">
            <p className="font-bold text-gray-900 mb-1">
              {punishStep === 'revoke' ? 'Revogar verificação de' : 'Suspender conta de'}{' '}
              {checkResult.name}
            </p>
            <p className="text-xs text-gray-400 mb-3">
              {punishStep === 'revoke'
                ? 'O cliente perde o selo imediatamente e é notificado. Informe o motivo (fica registrado).'
                : 'O cliente não consegue mais entrar na conta enquanto suspenso. Informe o motivo (fica registrado).'}
            </p>
            <textarea
              value={punishReason}
              onChange={(e) => setPunishReason(e.target.value)}
              placeholder="Motivo (obrigatório)"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setPunishStep(null)}
                disabled={isPunishing}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPunish}
                disabled={isPunishing || punishReason.trim().length < 5}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-40"
              >
                {isPunishing ? 'Aplicando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// Painel de documentação — mesma ideia de um artifact lateral: desliza a
// partir da direita, some com o mesmo botão que abriu. Conteúdo em
// linguagem direta, sem jargão técnico, porque é o admin do restaurante
// (não um dev) quem vai ler.
function VerificationDocsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-80 shrink-0 bg-white border border-gray-100 rounded-xl p-5 h-fit sticky top-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-gray-900 text-sm">Como funciona</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-3.5 text-xs text-gray-600 leading-relaxed">
        <p>
          Clientes podem pedir o selo <strong>"Cliente verificado"</strong> no perfil deles, enviando
          uma foto do rosto. Essa foto cai aqui, pra você decidir.
        </p>
        <div>
          <p className="font-semibold text-gray-900 mb-1">O que fazer</p>
          <p>
            Olhe a foto e confira se é uma pessoa real, com o rosto visível e claro. Se estiver tudo
            certo, toque em <strong>Aprovar</strong>. Se algo parecer errado, toque em{' '}
            <strong>Recusar</strong> e escolha o motivo — esse motivo vai direto pro cliente, então
            escolha o que realmente aconteceu.
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-900 mb-1">Prazo de 10 dias</p>
          <p>
            Você tem <strong>10 dias</strong> a partir do pedido pra decidir. O contador ao lado de
            cada foto muda de cor conforme o prazo se aproxima (cinza → laranja → vermelho). Se os 10
            dias passarem sem decisão, a verificação é <strong>recusada automaticamente</strong> — o
            cliente é avisado e pode tentar de novo. Isso evita que um selo de verificação seja
            concedido sem ninguém realmente ter olhado a foto.
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-900 mb-1">A foto some sozinha</p>
          <p>
            Assim que você decidir (aprovar ou recusar), a foto enviada é <strong>excluída na
            hora</strong>. Se por algum motivo a exclusão falhar nesse momento, ela é apagada
            automaticamente em até 10 dias de qualquer forma — nunca fica guardada pra sempre.
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-900 mb-1">Verificar integridade</p>
          <p>
            Use a busca no topo da página pra confirmar, com prova técnica de verdade (não só
            visual), se o selo de um cliente é legítimo. O sistema recalcula uma assinatura
            criptográfica gerada no exato momento da sua aprovação — se alguém conseguisse
            forjar o campo "verificado" por fora do fluxo normal (ex: acesso direto ao banco de
            dados), a prova não bateria, e o sistema avisa isso claramente ("NÃO — sinal de
            adulteração detectado"). Nesse caso, você pode <strong>revogar a verificação</strong>{' '}
            e/ou <strong>suspender a conta</strong> do cliente na mesma tela.
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-900 mb-1">Decisão final</p>
          <p>
            Aprovar ou recusar <strong>não pode ser desfeito</strong> depois — pense antes de
            confirmar. Um cliente aprovado fica com o selo permanentemente (só perde excluindo a
            conta dele por completo).
          </p>
        </div>
      </div>
    </div>
  );
}
