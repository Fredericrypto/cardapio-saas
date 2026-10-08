import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, History, Loader2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  createManualBackup,
  deleteBackup,
  downloadBackupFile,
  fetchBackupAudit,
  fetchBackups,
  saveBackupSettings,
} from '../../lib/admin-api';
import type { BackupAuditItem, BackupItem, BackupOverview } from '../../types/backups';
import { RestoreModal } from './RestoreModal';
import {
  apiMessage,
  AUDIT_LABEL,
  formatBytes,
  formatDateTime,
  FREQUENCY_OPTIONS,
  RETENTION_OPTIONS,
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
} from './backupFormat';

const POLL_MS = 4000;
const busyStatus = (s: string) => s === 'processando' || s === 'restaurando';

export function BackupsSection() {
  const [data, setData] = useState<BackupOverview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [frequency, setFrequency] = useState(0);
  const [runTime, setRunTime] = useState('04:00');
  const [retention, setRetention] = useState(90);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [audit, setAudit] = useState<BackupAuditItem[] | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const formSeeded = useRef(false);

  const load = useCallback(async () => {
    try {
      const overview = await fetchBackups();
      setData(overview);
      setLoadError('');
      if (!formSeeded.current) {
        formSeeded.current = true;
        setFrequency(overview.settings.frequencyDays);
        setRunTime(overview.settings.runTime);
        setRetention(overview.settings.retentionDays);
      }
    } catch (e) {
      setLoadError(apiMessage(e, 'Não foi possível carregar os backups.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Atualiza sozinho enquanto algo está em andamento (e só então).
  const inProgress = Boolean(data && (data.operationInProgress || data.backups.some((b) => busyStatus(b.status))));
  useEffect(() => {
    if (!inProgress) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [inProgress, load]);

  const loadAudit = useCallback(async () => {
    try {
      setAudit(await fetchBackupAudit());
    } catch {
      setAudit([]);
    }
  }, []);
  useEffect(() => {
    if (auditOpen) void loadAudit();
  }, [auditOpen, loadAudit, data?.backups.length]);

  const dirty =
    data !== null &&
    (frequency !== data.settings.frequencyDays || runTime !== data.settings.runTime || retention !== data.settings.retentionDays);
  const ready = Boolean(data?.config.encryptionConfigured && data?.config.storageConfigured);

  async function saveSettings() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveBackupSettings({ frequencyDays: frequency, runTime, retentionDays: retention });
      await load();
      setSaveMsg({ ok: true, text: 'Agenda salva.' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg({ ok: false, text: apiMessage(e, 'Não foi possível salvar.') });
    } finally {
      setSaving(false);
    }
  }

  async function createNow() {
    setCreating(true);
    setActionError('');
    try {
      await createManualBackup();
      await load();
    } catch (e) {
      setActionError(apiMessage(e, 'Não foi possível iniciar o backup.'));
    } finally {
      setCreating(false);
    }
  }

  async function download(b: BackupItem) {
    setDownloadingId(b.id);
    setActionError('');
    try {
      await downloadBackupFile(b.id, b.fileName);
    } catch {
      setActionError('Não foi possível baixar o arquivo. Tente novamente.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError('');
    try {
      await deleteBackup(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setActionError(apiMessage(e, 'Não foi possível excluir.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  if (loadError && !data) {
    return <p role="alert" className="text-sm text-red-600">{loadError}</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-gray-400 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={20} /> Segurança e Backups
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Cópias criptografadas (AES-256) de todos os dados do restaurante — pedidos, clientes, cashback, caixa, cardápio e
          mais. Só administradores têm acesso.
        </p>
      </div>

      {!data.config.encryptionConfigured && (
        <Banner text="A chave de criptografia (BACKUP_ENCRYPTION_KEY) ainda não está configurada no servidor. Sem ela não é possível gerar nem restaurar backups." />
      )}
      {!data.config.storageConfigured && (
        <Banner text="O armazenamento privado dos backups ainda não está configurado no servidor (SUPABASE_URL e SUPABASE_SERVICE_KEY)." />
      )}

      <section className="border border-gray-200 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
        <h3 className="text-sm font-bold text-gray-900">Backup automático</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="bk-freq" className="text-xs font-semibold text-gray-500 block mb-1">Frequência</label>
            <select
              id="bk-freq"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bk-time" className="text-xs font-semibold text-gray-500 block mb-1">Horário (Brasília)</label>
            <input
              id="bk-time"
              type="time"
              value={runTime}
              disabled={frequency === 0}
              onChange={(e) => setRunTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="bk-ret" className="text-xs font-semibold text-gray-500 block mb-1">Guardar por</label>
            <select
              id="bk-ret"
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
            >
              {RETENTION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} dias</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={saveSettings}
            disabled={!dirty || saving || !runTime}
            className="bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Salvando…' : 'Salvar agenda'}
          </button>
          {saveMsg && (
            <span role="status" className={`text-xs ${saveMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{saveMsg.text}</span>
          )}
          <span className="text-xs text-gray-400 sm:ml-auto">
            {data.settings.frequencyDays === 0
              ? 'Backups automáticos desativados.'
              : `Próximo backup: ${formatDateTime(data.settings.nextRunAt)}`}
            {data.settings.lastAutoBackupAt && ` · Último automático: ${formatDateTime(data.settings.lastAutoBackupAt)}`}
          </span>
        </div>
        <p className="text-[11px] text-gray-400">
          Backups mais antigos que o prazo escolhido são apagados sozinhos — o backup mais recente é sempre mantido.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">
            Histórico <span className="text-gray-400 font-normal">· {data.backups.length} backup(s), {formatBytes(data.totalBytes)}</span>
          </h3>
          <button
            onClick={createNow}
            disabled={creating || !ready || data.operationInProgress}
            className="bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
          >
            {creating || data.operationInProgress ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            Gerar Backup Manual Agora
          </button>
        </div>
        {actionError && <p role="alert" className="text-xs text-red-600">{actionError}</p>}

        {data.backups.length === 0 ? (
          <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl p-6 text-center">
            Nenhum backup ainda. Gere o primeiro agora ou ative a agenda acima.
          </p>
        ) : (
          <div className="border border-gray-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2.5 font-semibold">Data e Hora</th>
                  <th className="px-3 py-2.5 font-semibold">Origem</th>
                  <th className="px-3 py-2.5 font-semibold">Tamanho</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.backups.map((b) => {
                  const usable = b.status === 'concluido' || b.status === 'restaurado';
                  const running = busyStatus(b.status);
                  return (
                    <tr key={b.id} data-testid="backup-row" data-status={b.status}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-800">{formatDateTime(b.createdAt)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{TYPE_LABEL[b.backupType]}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap tabular-nums">{usable ? formatBytes(b.fileSize) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-2.5 py-0.5 ${STATUS_STYLE[b.status]}`}>
                          {running && <Loader2 size={11} className="animate-spin" />}
                          {STATUS_LABEL[b.status]}
                        </span>
                        {b.status === 'falhou' && b.errorMessage && (
                          <p className="text-[11px] text-red-500 mt-1 max-w-xs">{b.errorMessage}</p>
                        )}
                        {b.restoreCount > 0 && b.restoredAt && (
                          <p className="text-[11px] text-gray-400 mt-1">Restaurado em {formatDateTime(b.restoredAt)}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <IconButton label="Baixar arquivo criptografado" disabled={!usable || downloadingId === b.id} onClick={() => download(b)}>
                            {downloadingId === b.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                          </IconButton>
                          <IconButton label="Restaurar este estado" disabled={!usable || data.operationInProgress} onClick={() => setRestoreTarget(b)}>
                            <RotateCcw size={16} />
                          </IconButton>
                          <IconButton label="Excluir backup" danger disabled={running} onClick={() => setDeleteTarget(b)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-gray-200 rounded-2xl">
        <button
          onClick={() => setAuditOpen((o) => !o)}
          aria-expanded={auditOpen}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-900"
        >
          <History size={16} /> Registro de auditoria
          <span className="ml-auto text-xs font-normal text-gray-400">{auditOpen ? 'Ocultar' : 'Mostrar'}</span>
        </button>
        {auditOpen && (
          <div className="border-t border-gray-100 max-h-80 overflow-y-auto">
            {audit === null ? (
              <p className="p-4 text-xs text-gray-400">Carregando…</p>
            ) : audit.length === 0 ? (
              <p className="p-4 text-xs text-gray-400">Nenhum evento ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {audit.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className={`font-semibold ${a.success ? 'text-gray-800' : 'text-red-600'}`}>{AUDIT_LABEL[a.action] ?? a.action}</span>
                    <span className="text-gray-500">{formatDateTime(a.createdAt)}</span>
                    <span className="text-gray-400">{a.userEmail ?? 'Sistema'}</span>
                    {a.ip && <span className="text-gray-400">IP {a.ip}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {restoreTarget && (
        <RestoreModal backup={restoreTarget} onClose={() => setRestoreTarget(null)} onRestored={() => void load()} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="del-title">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-4">
            <h2 id="del-title" className="font-display text-lg font-bold text-gray-900">Excluir backup?</h2>
            <p className="text-sm text-gray-600">
              O backup de {formatDateTime(deleteTarget.createdAt)} será apagado definitivamente, inclusive o arquivo guardado.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-semibold text-gray-700">
                Cancelar
              </button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function IconButton({
  label, onClick, disabled, danger, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg border border-transparent hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent ${danger ? 'text-red-500' : 'text-gray-600'}`}
    >
      {children}
    </button>
  );
}
