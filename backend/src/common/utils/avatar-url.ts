// Avatares de cliente ficam em /avatars/* no app do cliente. O admin roda em outro
// domínio, então o resumo da mesa manda a URL absoluta. Sem CUSTOMER_APP_URL mantém
// o caminho relativo (o cardápio, no mesmo domínio, continua funcionando).
export function absolutizeAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (!avatarUrl.startsWith('/')) return avatarUrl;
  const base = (process.env.CUSTOMER_APP_URL ?? '').replace(/\/$/, '');
  return base ? `${base}${avatarUrl}` : avatarUrl;
}
