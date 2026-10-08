#!/usr/bin/env python3
# Reaplica a "fiação" do módulo de backup sobre os arquivos ATUAIS do repositório
# (sem sobrescrever o resto). Idempotente: pode rodar duas vezes.
import re, sys, os
root = os.getcwd()
problems = []

def edit(path, fn, marker):
    p = os.path.join(root, path)
    s = open(p, encoding='utf-8').read()
    if marker in s:
        print('já ok   ', path); return
    new = fn(s)
    if new is None or new == s:
        problems.append(path); print('FALHOU  ', path); return
    open(p, 'w', encoding='utf-8').write(new); print('editado ', path)

def after(s, anchor, text, count=1):
    i = s.find(anchor)
    if i < 0: return None
    j = i + len(anchor)
    return s[:j] + text + s[j:]

# ---- backend/src/app.module.ts
def app_module(s):
    s = after(s, "import { LoyaltyModule } from './modules/loyalty/loyalty.module';\n",
              "import { BackupsModule } from './modules/backups/backups.module';\n"
              "import { TenantBackup } from './modules/backups/tenant-backup.entity';\n"
              "import { TenantBackupSettings } from './modules/backups/tenant-backup-settings.entity';\n"
              "import { BackupAuditLog } from './modules/backups/backup-audit-log.entity';\n")
    if s is None: return None
    s = after(s, "          PushSubscription,\n", "          TenantBackup,\n          TenantBackupSettings,\n          BackupAuditLog,\n")
    if s is None: return None
    return after(s, "    CashModule,\n", "    BackupsModule,\n")
edit('backend/src/app.module.ts', app_module, 'BackupsModule')

# ---- backend/src/config/data-source.ts
def data_source(s):
    s = after(s, "import { PushSubscription } from '../modules/push/push-subscription.entity';\n",
              "import { TenantBackup } from '../modules/backups/tenant-backup.entity';\n"
              "import { TenantBackupSettings } from '../modules/backups/tenant-backup-settings.entity';\n"
              "import { BackupAuditLog } from '../modules/backups/backup-audit-log.entity';\n")
    if s is None: return None
    return after(s, "    PushSubscription,\n", "    TenantBackup,\n    TenantBackupSettings,\n    BackupAuditLog,\n")
edit('backend/src/config/data-source.ts', data_source, 'TenantBackupSettings')

# ---- backend/package.json
def pkg(s):
    s = s.replace('"test:all": "', '"test:backup": "ts-node --transpile-only test/backup-pure-audit.ts && ts-node --transpile-only test/backup-db-audit.ts",\n    "test:all": "npm run test:backup && ', 1)
    return s if 'test:backup' in s else None
edit('backend/package.json', pkg, 'test:backup')

# ---- backend/.env.example
def env(s):
    return s.rstrip('\n') + '''

# ── Backup & Restauração (módulo "Segurança e Backups") ─────────────────────
# Chave que CRIPTOGRAFA os backups (AES-256-GCM). Mínimo 32 caracteres, sem espaços
# nas pontas. Gere com: openssl rand -base64 48. GUARDE UMA CÓPIA FORA DO RENDER.
# Use uma chave DIFERENTE da CREDENTIALS_ENCRYPTION_KEY.
BACKUP_ENCRYPTION_KEY=
BACKUP_STORAGE_DRIVER=supabase
BACKUP_BUCKET=tenant-backups
# BACKUP_LOCAL_DIR=./.backups-dev        # só com BACKUP_STORAGE_DRIVER=local
# BACKUP_MAX_FILE_BYTES=47185920
# BACKUP_RESTORE_LOCK_TIMEOUT_MS=15000
# BACKUP_RESTORE_STATEMENT_TIMEOUT_MS=300000
'''
edit('backend/.env.example', env, 'BACKUP_ENCRYPTION_KEY')

# ---- frontend-admin/src/lib/admin-api.ts
API_ADD = '''
// ---------- Backups (somente administrador/"owner") ----------
export async function fetchBackups(): Promise<BackupOverview> {
  const { data } = await api.get<BackupOverview>('/backups');
  return data;
}
export async function saveBackupSettings(payload: {
  frequencyDays: number;
  runTime: string;
  retentionDays: number;
}): Promise<BackupSettingsView> {
  const { data } = await api.put<BackupSettingsView>('/backups/settings', payload);
  return data;
}
export async function createManualBackup(): Promise<{ id: string; status: string }> {
  const { data } = await api.post<{ id: string; status: string }>('/backups');
  return data;
}
export async function fetchRestorePreview(id: string): Promise<RestorePreview> {
  const { data } = await api.get<RestorePreview>(`/backups/${id}/restore-preview`);
  return data;
}
export async function restoreBackup(
  id: string,
  payload: { password: string; confirmationWord: string },
): Promise<RestoreSummary> {
  const { data } = await api.post<RestoreSummary>(`/backups/${id}/restore`, payload);
  return data;
}
export async function deleteBackup(id: string): Promise<void> {
  await api.delete(`/backups/${id}`);
}
export async function fetchBackupAudit(): Promise<BackupAuditItem[]> {
  const { data } = await api.get<BackupAuditItem[]>('/backups/audit-log');
  return data;
}
export async function downloadBackupFile(id: string, fileName: string): Promise<void> {
  const res = await api.get<Blob>(`/backups/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
'''
def admin_api(s):
    imp = "import type {\n  BackupAuditItem,\n  BackupOverview,\n  BackupSettingsView,\n  RestorePreview,\n  RestoreSummary,\n} from '../types/backups';\n"
    m = re.search(r"^import .*\n", s, re.M)
    if not m: return None
    # insere o import depois do último import do arquivo
    last = list(re.finditer(r"^(import [\s\S]*?;\n)", s, re.M))[-1]
    s = s[:last.end()] + imp + s[last.end():]
    return s.rstrip('\n') + '\n' + API_ADD
edit('frontend-admin/src/lib/admin-api.ts', admin_api, 'downloadBackupFile')

# ---- frontend-admin/src/pages/SettingsPage.tsx
WRAP = '''
// Configurações: "Geral" para todos; "Segurança e Backups" só para o administrador
// (dono). O servidor confere de novo — esconder a aba é só conforto visual.
export function SettingsPage() {
  const { admin } = useAuth();
  const [params, setParams] = useSearchParams();
  const isOwner = admin?.role === 'owner';
  const tab = isOwner && params.get('aba') === 'seguranca' ? 'seguranca' : 'geral';
  const setTab = (t: 'geral' | 'seguranca') => setParams(t === 'geral' ? {} : { aba: t }, { replace: true });

  return (
    <div>
      {isOwner && (
        <div className={`px-6 pt-6 mx-auto ${tab === 'seguranca' ? 'max-w-4xl' : 'max-w-xl'}`}>
          <div className="flex gap-1 border-b border-gray-200" role="tablist">
            {(
              [
                ['geral', 'Geral'],
                ['seguranca', 'Segurança e Backups'],
              ] as Array<['geral' | 'seguranca', string]>
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 ${tab === id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'seguranca' ? (
        <div className="p-6 max-w-4xl mx-auto">
          <BackupsSection />
        </div>
      ) : (
        <GeneralSettings />
      )}
    </div>
  );
}
'''
def settings(s):
    if 'export function SettingsPage() {' not in s: return None
    s = s.replace('export function SettingsPage() {', 'function GeneralSettings() {', 1)
    imp = "import { useSearchParams } from 'react-router-dom';\nimport { BackupsSection } from '../components/backups/BackupsSection';\n"
    last = list(re.finditer(r"^import [^\n]*;\n", s, re.M))[-1]
    s = s[:last.end()] + imp + s[last.end():]
    if 'useAuth' not in s.split('function GeneralSettings')[0]:
        problems.append('SettingsPage: falta import de useAuth'); return None
    return s.rstrip('\n') + '\n' + WRAP
edit('frontend-admin/src/pages/SettingsPage.tsx', settings, 'BackupsSection')

print('\nPROBLEMAS:' if problems else '\nTudo certo.', problems or '')
sys.exit(1 if problems else 0)
