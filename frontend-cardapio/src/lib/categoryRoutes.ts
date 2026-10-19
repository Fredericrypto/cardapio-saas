// Rotas da subpágina de categoria ("Ver todos"). Sempre pelo ID estável da
// categoria (nunca pelo nome traduzido) e preservando o fluxo de mesa: o token
// do QR continua na URL, então a sessão da mesa não se perde.
export function buildMenuPath(slug: string, qrCodeToken?: string): string {
  return qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;
}

export function buildCategoryPath(slug: string, categoryId: string, qrCodeToken?: string): string {
  return `${buildMenuPath(slug, qrCodeToken)}/categoria/${encodeURIComponent(categoryId)}`;
}
