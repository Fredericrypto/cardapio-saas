import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, X } from 'lucide-react';
import { fetchRestorePreview, restoreBackup } from '../../lib/admin-api';
import { RESTORE_CONFIRMATION_WORD } from '../../types/backups';
import type { BackupItem, RestorePreview, RestoreSummary } from '../../types/backups';
import { apiMessage, formatDateTime, TABLE_LABEL } from './backupFormat';

interface Props {
  backup: BackupItem;
  onClose: () => void;
  onRestored: () => void; // atualiza a lista por trás
}

// Restauração de emergência. Só habilita o botão com a senha preenchida E a
// palavra exata — mas a validação de verdade é no servidor (o botão é só ajuda).
export function RestoreModal({ backup, onClose, onRestored }: Props) {
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<RestoreSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRestorePreview(backup.id)
      .then((p) => !cancelled && setPreview(p))
      .catch((e) => !cancelled && setPreviewError(apiMessage(e, 'Não foi possível calcular o que mudaria.')));
    return () => {
      cancelled = true;
    };
  }, [backup.id]);

  const wordOk = word === RESTORE_CONFIRMATION_WORD;
  const canSubmit = password.length > 0 && wordOk && !busy && !done;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const res = await restoreBackup(backup.id, { password, confirmationWord: word });
      setDone(res);
      setPassword('');
      onRestored();
    } catch (e) {
      setError(apiMessage(e, 'Não foi possível restaurar. Nada foi alterado.'));
    } finally {
      setBusy(false);
    }
  }

  const changed = preview?.rows.filter((r) => r.current !== r.inBackup) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-title"
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <h2 id="restore-title" className="font-display text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={20} className="text-red-600 shrink-0" />
            Restaurar este estado
          </h2>
          {!busy && (
            <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-700">
              <X size={20} />
            </button>
          )}
        </div>

        {done ? (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <CheckCircle2 size={22} className="text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-green-800">Restauração concluída</p>
                <p className="text-xs text-green-700 mt-1">
                  O sistema voltou exatamente ao estado de {formatDateTime(backup.createdAt)}. {done.totalRows} registros
                  foram restaurados e conferidos um a um.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Por segurança, o estado de ANTES da restauração foi guardado em um backup automático — se algo não estiver
              como esperado, é possível voltar atrás restaurando esse backup.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-gray-900 text-white rounded-lg py-3 text-sm font-semibold"
            >
              Recarregar painel
            </button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-800 leading-relaxed">
                <p className="font-bold text-sm mb-1">Atenção: ação crítica</p>
                O sistema voltará <strong>exatamente</strong> ao estado de <strong>{formatDateTime(backup.createdAt)}</strong>.
                Tudo o que foi criado ou alterado depois disso (pedidos, clientes, cashback, caixa…) será desfeito. Mesas
                abertas e os QR codes de entrada nelas voltam ao que eram naquele momento.
              </div>
            </div>

            {previewError ? (
              <p className="text-xs text-gray-500">{previewError}</p>
            ) : !preview ? (
              <p className="text-xs text-gray-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Calculando o que vai mudar…
              </p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 flex justify-between">
                  <span>O que muda</span>
                  <span>
                    {preview.currentTotal} → {preview.backupTotal} registros
                  </span>
                </div>
                {changed.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500">
                    Os totais são iguais, mas o conteúdo dos registros será devolvido ao que era.
                  </p>
                ) : (
                  <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                    {changed.map((r) => (
                      <li key={r.table} className="px-3 py-1.5 text-xs flex justify-between gap-3">
                        <span className="text-gray-700">{TABLE_LABEL[r.table] ?? r.table}</span>
                        <span className="text-gray-500 tabular-nums">
                          {r.current} → {r.inBackup}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <label htmlFor="restore-password" className="text-xs font-semibold text-gray-500 block mb-1">
                Sua senha de administrador
              </label>
              <input
                id="restore-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="restore-word" className="text-xs font-semibold text-gray-500 block mb-1">
                Para confirmar, digite <span className="font-mono text-red-600">{RESTORE_CONFIRMATION_WORD}</span>
              </label>
              <input
                id="restore-word"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={word}
                onChange={(e) => setWord(e.target.value)}
                disabled={busy}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 border border-gray-200 rounded-lg py-3 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="flex-1 bg-red-600 text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Restaurando…
                  </>
                ) : (
                  'Restaurar agora'
                )}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 -mt-1">
              A restauração é atômica: se qualquer etapa falhar, nada é alterado. Antes de começar, o estado atual é
              guardado em um backup de segurança.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
