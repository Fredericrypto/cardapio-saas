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

// ───────── peças visuais ─────────

function WildcardBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-900">
      <Zap size={14} strokeWidth={1.5} className="text-gray-900" />
      Acesso Universal Wildcard Ativo
    </span>
  );
}

function Alert({ tone, children }: { tone: 'red' | 'yellow' | 'green' | 'orange'; children: ReactNode }) {
  const styles = {
    red: 'border-red-200 bg-red-50 text-red-700',
    yellow: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
  }[tone];
  const Icon = tone === 'green' ? Check : AlertTriangle;
  return (
    <div role={tone === 'green' ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${styles}`}>
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
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <h2 id="confirm-title" className="font-display text-base font-semibold">
            {title}
          </h2>
        </div>
        <p className="mt-3 text-sm text-gray-900">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
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
          className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
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
                active ? 'border-gray-900 bg-gray-100' : 'border-gray-200 bg-white hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900" style={{ overflowWrap: 'anywhere' }}>
                  {role.name}
                </span>
                {role.permissions.includes(WILDCARD) && (
                  <Zap size={15} strokeWidth={1.5} className="shrink-0 text-gray-900" aria-label="Acesso universal" />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                {role.isSystemDefault && (
                  <span className="rounded border border-blue-200 px-1.5 py-0.5 text-blue-600">Sistema</span>
                )}
                <span className="text-gray-500">
                  {role.userCount} {role.userCount === 1 ? 'usuário' : 'usuários'} · {role.permissions.length}{' '}
                  {role.permissions.length === 1 ? 'permissão' : 'permissões'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor + matriz */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
        {selection === null ? (
          <p className="text-sm text-gray-500">Selecione um cargo ou crie um novo.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                Nome do cargo
                <input
                  value={draft.name}
                  maxLength={60}
                  disabled={readOnly || (!isNew && selectedRole?.isSystemDefault)}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ex.: Supervisor de Salão"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                Descrição (opcional)
                <input
                  value={draft.description}
                  maxLength={200}
                  disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 disabled:opacity-60"
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
                <fieldset key={group.module} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <legend className="px-2 font-display text-sm font-semibold text-gray-900">{group.module}</legend>
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
                            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggle(perm.slug)}
                            className="mt-0.5 h-4 w-4 accent-gray-900"
                          />
                          <span className="min-w-0 flex-1">
                            <span className={`flex items-center gap-1.5 ${checked ? 'text-green-600' : 'text-gray-900'}`}>
                              {perm.name}
                              {blockedByRule && !readOnly && <Lock size={12} strokeWidth={1.5} className="text-amber-600" />}
                            </span>
                            <code className="text-[11px] text-blue-600">{perm.slug}</code>
                            <span className="block text-[11px] text-gray-500">{perm.description}</span>
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
                  className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  <Save size={16} strokeWidth={1.5} />
                  {saving ? 'Salvando...' : isNew ? 'Criar cargo' : 'Salvar alterações'}
                </button>
                {selectedRole?.deletable && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
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
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-900">
              <th className="px-4 py-3 font-semibold">Usuário</th>
              <th className="px-4 py-3 font-semibold">Cargo</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id} className="border-b border-gray-200 last:border-0">
                <td className="px-4 py-3">
                  <div className="text-gray-900" style={{ overflowWrap: 'anywhere' }}>
                    {m.name ?? m.email}
                    {m.isSelf && <span className="ml-2 rounded border border-blue-200 px-1.5 py-0.5 text-[10px] text-blue-600">você</span>}
                  </div>
                  {m.name && <div className="text-xs text-gray-500">{m.email}</div>}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={m.role?.id ?? ''}
                    disabled={!m.canChangeRole || busyId === m.id}
                    onChange={(e) => e.target.value && change(m, e.target.value)}
                    title={m.isSelf ? 'Você não pode alterar o seu próprio cargo.' : undefined}
                    className="w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 disabled:opacity-50"
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
    <div className="mx-auto w-full max-w-6xl p-4 text-gray-900 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck size={28} strokeWidth={1.25} className="text-gray-900" />
          <div>
            <h1 className="font-display text-xl font-semibold text-gray-900">Cargos e acessos</h1>
            <p className="text-xs text-gray-500">
              Defina o que cada cargo pode ver e fazer. Você só concede permissões que o seu próprio cargo possui.
            </p>
          </div>
        </div>
        {!canManage && (
          <span className="rounded-full border border-amber-200 px-3 py-1 text-xs text-amber-600">Somente leitura</span>
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
                ? 'border-gray-900 bg-gray-100 text-gray-900'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
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
      {!roles && !error && <p className="text-sm text-gray-500">Carregando...</p>}

      {roles && tab === 'cargos' && <RolesTab roles={roles} groups={groups} onChanged={load} />}
      {roles && tab === 'equipe' && <TeamTab team={team} roles={roles} onChanged={load} />}
    </div>
  );
}
