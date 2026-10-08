# Unificação 2026-10-08 (RBAC + tema/layout + Segurança e Backups)

Duas sessões trabalharam em paralelo a partir da base Z5 e o zip de backup foi aplicado
por cima do RBAC, sobrescrevendo `auth/admin-user.entity.ts` (sem `roleId`/`roleEntity`)
e quebrando o build do Render (TS2339 roleEntity / TS2561 roleId).

Este zip é a UNIÃO das três frentes:
- Base Z5
- Segurança e Backups (módulo `backups`, migration `TenantBackups`, aba em Configurações)
- RBAC + tema claro/escuro + sidebar fixa/conteúdo centralizado

Merge de 3 vias (base × RBAC × Backups) em: `app.module.ts`, `config/data-source.ts`,
`backend/package.json` (scripts `test:rbac` + `test:backup` + `test:all` com os dois).

## Atenção: duas migrations com o MESMO timestamp (1757200000000)
- `RbacRolesPermissions1757200000000` e `TenantBackups1757200000000` — independentes entre si.
- NÃO renomear: quem já rodou uma delas teria a migration re-executada (e falharia).
- O TypeORM compara por NOME da classe (diferentes) e só rejeita timestamp MENOR que o já
  executado; igual é aceito. Rodar `npm run migration:run` aplica as pendentes.

## Regra para as próximas sessões
Antes de gerar um zip, partir SEMPRE do último zip COMPLETO unificado (este) — nunca da
base antiga —, para que as frentes paralelas não se sobrescrevam.

## z6-05 — patch "ajustes-sidebar-config-mesas" reaplicado + aba própria de backups
- Reaplicado por cima da unificação (a unificação tinha devolvido essas telas ao estado anterior): sidebar sem slug/com logo/mais larga,
  Configurações em sub-abas por categoria, Mesas (copiar link contido, lixeira vermelha, QR sobre bloco branco, impressão do QR),
  cursor pointer global (admin e cardápio). Detalhes: docs/AJUSTES-Z6-03.md.
- "Segurança e Backups" saiu de dentro de Configurações e virou aba própria no menu lateral (rota /seguranca),
  só para o Administrador (role 'owner'): item some do menu para os demais cargos e a URL digitada à mão mostra "Acesso negado".
  Backend inalterado (OwnerOnlyGuard continua conferindo no servidor).
