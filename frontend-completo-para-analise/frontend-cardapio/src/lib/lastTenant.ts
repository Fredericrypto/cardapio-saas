// A conta do cliente é global na plataforma (não por tenant), mas a
// navegação "voltar pro cardápio" a partir de uma tela sem :slug (como
// /conta-cliente/perfil) precisa saber PRA QUAL restaurante voltar.
// Guarda só o último visitado, localmente — não é um dado sensível, é
// só uma conveniência de navegação.
const STORAGE_KEY = 'cardapio_last_tenant_context';

export interface LastTenantContext {
  slug: string;
  qrCodeToken?: string;
}

export function saveLastTenantContext(context: LastTenantContext): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch {
    // localStorage indisponível (modo privado, etc.) — não é crítico, ignora.
  }
}

export function getLastTenantContext(): LastTenantContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
