import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, KeyRound, Lock, Plus, Save, ShieldCheck, Trash2, Users, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { canGrant } from '../lib/permissions';
import {
  apiErrorMessage,
  assignRole,
  createRole,
  deleteRole,
  fetchPermissionGroups,
  fetchRoles,
  fetchTeam,
  updateRole,
  type PermissionGroup,
  type RoleItem,
  type TeamMember,
} from '../lib/roles-api';

type Tab = 'cargos' | 'equipe';
type Selection = string | 'new' | null;

interface Draft {
  name: string;
  description: string;
  permissions: string[];
}

const EMPTY_DRAFT: Draft = { name: '', description: '', permissions: [] };
const WILDCARD = '*';

function draftFromRole(role: RoleItem): Draft {
  return { name: role.name, description: role.description ?? '', permissions: [...role.permissions] };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.description.trim() === b.description.trim() &&
    [...a.permissions].sort().join('|') === [...b.permissions].sort().join('|')
  );
}

// ───────── peças visuais (tema Dracula) ─────────

function WildcardBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dracula-purple bg-dracula-pink/15 px-3 py-1 text-xs font-semibold text-dracula-pink">
      <Zap size={14} strokeWidth={1.5} className="text-dracula-purple" />
      Acesso Universal Wildcard Ativo
    </span>
  );
}

function Alert({ tone, children }: { tone: 'red' | 'yellow' | 'green' | 'orange'; children: ReactNode }) {
  const styles = {
    red: 'border-dracula-red/60 text-dracula-red',
    yellow: 'border-dracula-yellow/60 text-dracula-yellow',
    green: 'border-dracula-green/60 text-dracula-green',
    orange: 'border-dracula-orange/60 text-dracula-orange',
  }[tone];
  const Icon = tone === 'green' ? Check : AlertTriangle;
  return (
    <div role={tone === 'green' ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-lg border bg-dracula-bg px-3 py-2.5 text-sm ${styles}`}>
      <Icon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { title, message, confirmLabel, busy, onConfirm, onCancel } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-2xl border border-dracula-comment bg-dracula-bg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-dracula-red">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <h2 id="confirm-title" className="font-display text-base font-semibold">
            {title}
          </h2>
        </div>
        <p className="mt-3 text-sm text-dracula-fg">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-dracula-comment px-4 py-2 text-sm text-dracula-fg hover:bg-dracula-current disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-dracula-red px-4 py-2 text-sm font-semibold text-dracula-bg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Excluindo...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────── aba Cargos ─────────

function RolesTab(props: {
  roles: RoleItem[];
  groups: PermissionGroup[];
  onChanged: () => Promise<void>;
}) {
  const { roles, groups, onChanged } = props;
  const [selection, setSelection] = useState<Selection>(roles[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft>(() => (roles[0] ? draftFromRole(roles[0]) : EMPTY_DRAFT));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedRole = useMemo(() => roles.find((r) => r.id === selection) ?? null, [roles, selection]);
  const isNew = selection === 'new';
  const readOnly = !isNew && !(selectedRole?.editable ?? false);
  const wildcardOn = draft.permissions.includes(WILDCARD);
  const baseline = isNew ? EMPTY_DRAFT : selectedRole ? draftFromRole(selectedRole) : EMPTY_DRAFT;
  const dirty = !sameDraft(draft, baseline);
  const valid = draft.name.trim().length >= 2;

  function select(next: Selection) {
    setSelection(next);
    setError(null);
    setNotice(null);
    if (next === 'new') setDraft(EMPTY_DRAFT);
    else {
      const role = roles.find((r) => r.id === next);
      setDraft(role ? draftFromRole(role) : EMPTY_DRAFT);
    }
  }

  function toggle(slug: string) {
    setNotice(null);
    setDraft((d) => {
      if (slug === WILDCARD) {
        return { ...d, permissions: d.permissions.includes(WILDCARD) ? [] : [WILDCARD] };
      }
      if (d.permissions.includes(WILDCARD)) return d; // wildcard já cobre tudo
      const has = d.permissions.includes(slug);
      return { ...d, permissions: has ? d.permissions.filter((p) => p !== slug) : [...d.permissions, slug] };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        // Wildcard já cobre tudo: envia só "*".
        permissions: wildcardOn ? [WILDCARD] : draft.permissions,
      };
      const saved = isNew ? await createRole(payload) : await updateRole(selection as string, payload);
      await onChanged();
      setSelection(saved.id);
      setDraft(draftFromRole(saved));
      setNotice(isNew ? 'Cargo criado.' : 'Cargo atualizado. Vale para os usuários em até 30 segundos.');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedRole) return;
    setDeleting(true);
    try {
      await deleteRole(selectedRole.id);
      setConfirmDelete(false);
      await onChanged();
      const next = roles.find((r) => r.id !== selectedRole.id) ?? null;
      select(next ? next.id : null);
      setNotice('Cargo excluído.');
    } catch (e) {
      setConfirmDelete(false);
      setError(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      {/* Lista de cargos */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => select('new')}
          className="flex items-center justify-center gap-2 rounded-xl bg-dracula-pink px-4 py-2.5 text-sm font-semibold text-dracula-bg hover:opacity-90"
        >
          <Plus size={16} strokeWidth={1.5} />
          Novo cargo
        </button>
        {roles.map((role) => {
          const active = selection === role.id;
          return (
            <button
              key={role.id}
              onClick={() => select(role.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active ? 'border-dracula-pink bg-dracula-current' : 'border-dracula-comment/50 bg-dracula-current/40 hover:bg-dracula-current/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-dracula-fg" style={{ overflowWrap: 'anywhere' }}>
                  {role.name}
                </span>
                {role.permissions.includes(WILDCARD) && (
                  <Zap size={15} strokeWidth={1.5} className="shrink-0 text-dracula-purple" aria-label="Acesso universal" />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                {role.isSystemDefault && (
                  <span className="rounded border border-dracula-cyan/40 px-1.5 py-0.5 text-dracula-cyan">Sistema</span>
                )}
                <span className="text-dracula-comment">
                  {role.userCount} {role.userCount === 1 ? 'usuário' : 'usuários'} · {role.permissions.length}{' '}
                  {role.permissions.length === 1 ? 'permissão' : 'permissões'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor + matriz */}
      <div className="rounded-2xl border border-dracula-comment/50 bg-dracula-current/40 p-4 md:p-6">
        {selection === null ? (
          <p className="text-sm text-dracula-comment">Selecione um cargo ou crie um novo.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-dracula-comment">
                Nome do cargo
                <input
                  value={draft.name}
                  maxLength={60}
                  disabled={readOnly || (!isNew && selectedRole?.isSystemDefault)}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ex.: Supervisor de Salão"
                  className="rounded-lg border border-dracula-comment bg-dracula-bg px-3 py-2 text-sm text-dracula-fg outline-none focus:border-dracula-purple disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-dracula-comment">
                Descrição (opcional)
                <input
                  value={draft.description}
                  maxLength={200}
                  disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="rounded-lg border border-dracula-comment bg-dracula-bg px-3 py-2 text-sm text-dracula-fg outline-none focus:border-dracula-purple disabled:opacity-60"
                />
              </label>
            </div>

            {wildcardOn && (
              <div className="flex flex-col gap-2">
                <WildcardBadge />
                <Alert tone="yellow">
                  Este cargo acessa <strong>todos</strong> os módulos, inclusive os que forem criados no futuro. Conceda apenas a quem é de total confiança.
                </Alert>
              </div>
            )}

            {readOnly && selectedRole && (
              <Alert tone="orange">
                {selectedRole.slug === 'admin' && selectedRole.isSystemDefault
                  ? 'O cargo Administrador é protegido e não pode ser alterado.'
                  : 'Você não pode alterar este cargo: ele é o seu próprio cargo ou possui privilégios que o seu não tem.'}
              </Alert>
            )}

            {/* Matriz por módulo */}
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <fieldset key={group.module} className="rounded-xl border border-dracula-comment/50 bg-dracula-bg/60 p-3">
                  <legend className="px-2 font-display text-sm font-semibold text-dracula-purple">{group.module}</legend>
                  <div className="grid gap-1 md:grid-cols-2">
                    {group.permissions.map((perm) => {
                      const checked = wildcardOn || draft.permissions.includes(perm.slug);
                      const blockedByRule = !perm.grantable;
                      const disabled = readOnly || blockedByRule || (wildcardOn && perm.slug !== WILDCARD);
                      return (
                        <label
                          key={perm.slug}
                          title={blockedByRule ? 'O seu cargo não possui esta permissão, então você não pode concedê-la.' : perm.description}
                          className={`flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm ${
                            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-dracula-current/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggle(perm.slug)}
                            className="mt-0.5 h-4 w-4 accent-dracula-pink"
                          />
                          <span className="min-w-0 flex-1">
                            <span className={`flex items-center gap-1.5 ${checked ? 'text-dracula-green' : 'text-dracula-fg'}`}>
                              {perm.name}
                              {blockedByRule && !readOnly && <Lock size={12} strokeWidth={1.5} className="text-dracula-orange" />}
                            </span>
                            <code className="text-[11px] text-dracula-cyan">{perm.slug}</code>
                            <span className="block text-[11px] text-dracula-comment">{perm.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            {error && <Alert tone="red">{error}</Alert>}
            {notice && <Alert tone="green">{notice}</Alert>}

            {!readOnly && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={save}
                  disabled={saving || !dirty || !valid}
                  className="flex items-center gap-2 rounded-xl bg-dracula-pink px-5 py-2.5 text-sm font-semibold text-dracula-bg hover:opacity-90 disabled:opacity-40"
                >
                  <Save size={16} strokeWidth={1.5} />
                  {saving ? 'Salvando...' : isNew ? 'Criar cargo' : 'Salvar alterações'}
                </button>
                {selectedRole?.deletable && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 rounded-xl border border-dracula-red/70 px-4 py-2.5 text-sm font-medium text-dracula-red hover:bg-dracula-red/10"
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                    Excluir cargo
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDelete && selectedRole && (
        <ConfirmDialog
          title="Excluir cargo?"
          message={`O cargo "${selectedRole.name}" será removido. Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          busy={deleting}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ───────── aba Equipe ─────────

function TeamTab(props: { team: TeamMember[]; roles: RoleItem[]; onChanged: () => Promise<void> }) {
  const { team, roles, onChanged } = props;
  const { permissions } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Só oferece cargos cujas permissões o próprio usuário pode conceder (o servidor revalida).
  const assignable = roles.filter((r) => r.permissions.every((p) => canGrant(permissions, p)));

  async function change(member: TeamMember, roleId: string) {
    setBusyId(member.id);
    setError(null);
    setNotice(null);
    try {
      await assignRole(member.id, roleId);
      await onChanged();
      setNotice(`Cargo de ${member.name ?? member.email} atualizado.`);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="red">{error}</Alert>}
      {notice && <Alert tone="green">{notice}</Alert>}
      <div className="overflow-x-auto rounded-2xl border border-dracula-comment/50 bg-dracula-current/40">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-dracula-comment/50 text-xs text-dracula-purple">
              <th className="px-4 py-3 font-semibold">Usuário</th>
              <th className="px-4 py-3 font-semibold">Cargo</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id} className="border-b border-dracula-comment/30 last:border-0">
                <td className="px-4 py-3">
                  <div className="text-dracula-fg" style={{ overflowWrap: 'anywhere' }}>
                    {m.name ?? m.email}
                    {m.isSelf && <span className="ml-2 rounded border border-dracula-cyan/40 px-1.5 py-0.5 text-[10px] text-dracula-cyan">você</span>}
                  </div>
                  {m.name && <div className="text-xs text-dracula-comment">{m.email}</div>}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={m.role?.id ?? ''}
                    disabled={!m.canChangeRole || busyId === m.id}
                    onChange={(e) => e.target.value && change(m, e.target.value)}
                    title={m.isSelf ? 'Você não pode alterar o seu próprio cargo.' : undefined}
                    className="w-full max-w-xs rounded-lg border border-dracula-comment bg-dracula-bg px-3 py-2 text-sm text-dracula-fg outline-none focus:border-dracula-purple disabled:opacity-50"
                  >
                    {!m.role && <option value="">Sem cargo</option>}
                    {m.role && !assignable.some((r) => r.id === m.role!.id) && <option value={m.role.id}>{m.role.name}</option>}
                    {assignable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── página ─────────

export function RoleManagementPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('cargos');
  const [roles, setRoles] = useState<RoleItem[] | null>(null);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, g, t] = await Promise.all([fetchRoles(), fetchPermissionGroups(), fetchTeam()]);
      setRoles(r);
      setGroups(g);
      setTeam(t);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, 'Não foi possível carregar cargos e permissões.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = hasPermission('roles:manage');

  return (
    <div className="min-h-full bg-dracula-bg p-4 text-dracula-fg md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck size={28} strokeWidth={1.25} className="text-dracula-purple" />
          <div>
            <h1 className="font-display text-xl font-semibold text-dracula-purple">Cargos e acessos</h1>
            <p className="text-xs text-dracula-comment">
              Defina o que cada cargo pode ver e fazer. Você só concede permissões que o seu próprio cargo possui.
            </p>
          </div>
        </div>
        {!canManage && (
          <span className="rounded-full border border-dracula-orange/60 px-3 py-1 text-xs text-dracula-orange">Somente leitura</span>
        )}
      </header>

      <div className="mb-5 flex gap-2" role="tablist">
        {(
          [
            ['cargos', 'Cargos', KeyRound],
            ['equipe', 'Equipe', Users],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-dracula-pink bg-dracula-current text-dracula-pink'
                : 'border-dracula-comment/50 text-dracula-fg/80 hover:bg-dracula-current/50'
            }`}
          >
            <Icon size={16} strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
      {!roles && !error && <p className="text-sm text-dracula-comment">Carregando...</p>}

      {roles && tab === 'cargos' && <RolesTab roles={roles} groups={groups} onChanged={load} />}
      {roles && tab === 'equipe' && <TeamTab team={team} roles={roles} onChanged={load} />}
    </div>
  );
}
