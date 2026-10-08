# RBAC por permissões (wildcard) — referência

## Modelo
- `permissions` (catálogo global, slug único) · `roles` (POR estabelecimento, `unique(tenant_id, slug)`) · `role_permissions` (N:N) · `admin_users.role_id`.
- Coluna legada `admin_users.role` (owner/manager/staff) é mantida e **derivada** do cargo (notificações internas dependem dela). Cargo personalizado → `staff`.
- Cargos de sistema por estabelecimento: `admin` (`*`, imutável), `manager`, `staff` (não excluíveis).

## Avaliação (backend/src/common/permissions/permission-matcher.ts)
`*` concede tudo · slug exato · `modulo:*` cobre o módulo (não cobre `moduloX:…`). `@RequirePermission('a','b')` exige **todas**.

## Fonte da verdade
`JwtStrategy.validate` carrega cargo + permissões do **banco** (cache de 30 s, invalidado ao editar cargo/atribuir). O JWT carrega só identidade. Corpo/headers nunca definem permissões. Usuário excluído perde acesso na hora.

## Anti-escalada (RolesService)
Sem `*`: não concede `*`; não concede o que o próprio cargo não cobre; não altera o próprio cargo; não altera/exclui cargo com privilégios maiores; não rebaixa usuário mais poderoso. Ninguém altera o próprio cargo (nem o CEO). Cargo `admin` imutável; cargos de sistema não excluíveis; cargo em uso não é excluído.

## Rotas novas
`GET /roles` · `GET /permissions` · `POST /roles` · `PUT /roles/:id` · `DELETE /roles/:id` · `GET /team` · `PATCH /team/:userId/role` · `GET /auth/me`.
(Sem prefixo `/api/v1`: o app não usa prefixo global.) Pipe estrito (`forbidNonWhitelisted`) e `@Throttle` só nessas rotas.

## Como criar um módulo novo (ex.: Estoque)
1. `modules/roles/permissions.catalog.ts`: `p('stock:view', …)`, `p('stock:manage', …)` (sincroniza sozinho no boot).
2. Rotas: `@RequirePermission('stock:view')`.
3. `frontend-admin/src/config/sidebarConfig.ts`: um item com `permission: 'stock:view'` + a rota em `App.tsx`.
O Admin (`*`) acessa tudo sem mais nada.

## Rotas existentes protegidas
Painel/pedidos, mesas, cardápio (escrita), lojas (escrita), promoções, fidelidade, cashback, avaliações, verificações, análise, histórico, caixa e configurações (escrita). **Leituras abertas a qualquer usuário autenticado** (outras telas dependem delas): `GET categories`, `GET products`, `GET locations/me`, `GET loyalty/programs`, `GET tenants/me`. Anotações, notificações internas e push: qualquer autenticado.
Novas permissões: `receipts:verify` (verificar cupom / resgatar).

## Deploy
1. Migration `1757200000000-RbacRolesPermissions` (`npm run typeorm -- migration:run`).
2. Subir o backend (sincroniza o catálogo).
3. `npm run test:rbac` (lógica pura, sem banco).
4. Sessões antigas do painel se atualizam sozinhas via `GET /auth/me`.
