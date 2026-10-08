# Ajustes Z6-03 (08/10/2026) — sidebar, Configurações, Mesas e cursor

Aplicar POR CIMA do repo que já tem o patch `rbac-tema-layout-patch-2026-10-08-0603` (Z6-02).

## Já resolvido pelos patches anteriores (conferido, nada a fazer)
- TS1272: `import type` em `roles.controller.ts` (AccessContext) e `auth.controller.ts` (RequestAdminUser);
  varredura em todo `backend/src`: nenhum outro tipo usado em parâmetro decorado com import comum.
- `backend/tsconfig.json` com `"test"` no `exclude`.
- Tema Dracula removido; padrão claro; toggle no cabeçalho; persistência em `localStorage`; paleta escura pedida.
- Sidebar fixa, só o `<main>` rola, conteúdo centralizado.

## Novo nesta entrega
**Sidebar** (`components/layout/AdminSidebar.tsx`): sem slug; só o nome real; logo em quadrado de cantos
arredondados ao lado do nome (sem logo: inicial sobre a cor principal, igual ao cardápio); largura
`md:w-56 → md:w-64` (gaveta do celular `w-64 → w-72`).

**Configurações** (`pages/SettingsPage.tsx`): sub-abas (URL `?secao=`): Visual · Redes sociais & contatos ·
Pagamentos & pedidos · Análise & financeiro · Funcionamento & notificações (atalhos). Mesmo estado e mesmo
payload de `updateMyTenant` (um "Salvar alterações" grava todas as abas). Correção junto: o formulário só
hidratava alguns campos, uma vez; agora hidrata todos até a primeira edição (antes, abrir a página
recarregando podia gravar os valores padrão dos parâmetros financeiros e do prazo da mesa).

**Mesas** (`pages/TablesPage.tsx`): "Copiar link" em linha própria, contido no card; lixeira vermelha;
QR sempre preto sobre bloco branco com margem (legível no modo escuro). Impressão: o botão "Imprimir" saía
em folha em branco (o CSS de impressão só mostrava o cupom); agora mostra o QR (`#qr-print-area`).

**Cursor** (`index.css` do admin e do cardápio): `cursor: pointer` global (camada base) em botões, links,
abas, selects, checkboxes/rádios, labels clicáveis; `not-allowed` quando desabilitado.
Utilitários (`cursor-grab` etc.) continuam vencendo.

BUILD_VERSION: `2026-10-08-sessao-z6-03`. Nenhuma migration nova.
