import { api } from './api';

export interface RoleItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystemDefault: boolean;
  permissions: string[];
  userCount: number;
  editable: boolean;
  deletable: boolean;
}

export interface PermissionItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  grantable: boolean;
}

export interface PermissionGroup {
  module: string;
  permissions: PermissionItem[];
}

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  isSelf: boolean;
  role: { id: string; name: string; slug: string } | null;
  canChangeRole: boolean;
}

export interface RolePayload {
  name: string;
  description?: string;
  permissions: string[];
}

export async function fetchRoles(): Promise<RoleItem[]> {
  const { data } = await api.get<RoleItem[]>('/roles');
  return data;
}

export async function fetchPermissionGroups(): Promise<PermissionGroup[]> {
  const { data } = await api.get<PermissionGroup[]>('/permissions');
  return data;
}

export async function createRole(payload: RolePayload): Promise<RoleItem> {
  const { data } = await api.post<RoleItem>('/roles', payload);
  return data;
}

export async function updateRole(id: string, payload: Partial<RolePayload>): Promise<RoleItem> {
  const { data } = await api.put<RoleItem>(`/roles/${id}`, payload);
  return data;
}

export async function deleteRole(id: string): Promise<void> {
  await api.delete(`/roles/${id}`);
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const { data } = await api.get<TeamMember[]>('/team');
  return data;
}

export async function assignRole(userId: string, roleId: string): Promise<TeamMember> {
  const { data } = await api.patch<TeamMember>(`/team/${userId}/role`, { roleId });
  return data;
}

// Mensagem amigável a partir do erro do backend (nunca expõe detalhes técnicos).
export function apiErrorMessage(error: unknown, fallback = 'Não foi possível concluir a operação.'): string {
  const response = (error as { response?: { data?: { message?: string | string[] }; status?: number } })?.response;
  const message = response?.data?.message;
  if (Array.isArray(message)) return message[0] ?? fallback;
  if (typeof message === 'string' && message) return message;
  if (response?.status === 429) return 'Muitas tentativas. Aguarde um instante e tente de novo.';
  return fallback;
}
