# Refinamentos Z6-06 (09/10/2026)

Base: `cardapio-saas-ATUAL-2026-10-09-0053` (commit 753a8ba). BUILD_VERSION dos dois frontends: `2026-10-09-sessao-z6-06`.

## O que mudou, por item do pedido

1. **Filtros do Histórico (admin)** — `lib/historyFilters.ts` (lógica pura) + `components/history/HistoryFilterBar.tsx`; integrado em `HistoryPage.tsx`. Status, tipo e período combináveis com a busca. ATENÇÃO: o backend só grava `entregue`/`cancelado`/mesa fechada no histórico; "Pendentes / Em preparo / Prontos" existem como pedido, mas sempre mostrarão 0.
2. **Compartilhar + OpenGraph (cardápio)** — `ShareButton` (Share2, traço 1.5) no card do produto, no card da promoção e nas duas telas de detalhe. Link geral `/{slug}/produto/{id}` e `/{slug}/promocao/{id}` (nunca o da mesa). `api/share.ts` (função Vercel) devolve as meta tags og:/twitter: SÓ para robôs (regra por User-Agent em `vercel.json`); pessoas recebem o app e caem direto no item. Botão "voltar" do detalhe leva ao cardápio quando a pessoa chegou por link.
3. **Validade do cashback** — `lib/cashbackFormat.ts`: "Vence dia DD/MM/AAAA às HH:mm" (>= 24h) e "Vence em Xh Ymin" (< 24h), sempre em `America/Sao_Paulo`.
4. **Abas de cashback** — Disponíveis / Expirados / Utilizados (`CustomerCashbackPage.tsx`). Backend: `CashbackService.getCustomerHistory` agora devolve `orderTotal`, `establishmentName`, `locationName` nos resgates.
5. **Loja fechada** — nada de `pointer-events-none` nem cinza global. Cinza só em banner/logo/cards; selo "Fechado" vermelho; redes sociais, avaliações, setas e carrossel clicáveis; itens/promoções abrem para leitura; "+" do card, "Adicionar" (produto) e "Usar promoção" travados com "Estabelecimento Fechado". Hook novo `useActiveLocation`.
6. **Informações** — redes sociais agora DENTRO de "Informações", entre o horário e o botão de telefone. Telefone, "Chamar garçom" e "Minha conta" usam a mesma classe (`lib/uiClasses.ts`).
7. **Configurações de Notificações (admin)** — engrenagem removida do sino; nova sub-aba em Configurações (`?secao=notificacoes`); `NotificationPreferences` reaproveitado na aba "Preferências" de `/notificacoes`.
8. **Notificações** — badge 1..99/99+ (já existia); expiração em 7 dias (lista + limpeza de hora em hora); exclusão manual individual (`DELETE /internal-notifications/:id`); card com avatar, nome, selo e cargo; correção de duplicidade (ver abaixo).

## Duplicidade de notificações — causas e correções
- Duplo clique em "Salvar" no mural mandava dois POST → trava de re-entrada em `NotesPage`.
- Edições simultâneas passavam juntas pela checagem de agrupamento → transação + `pg_advisory_xact_lock`.
- "Criada"/"Excluída" sem trava no banco → índice único parcial `(note_id, type)` (+ SAVEPOINT para tratar a violação sem abortar a transação).
- Push repetido para o mesmo aparelho → um envio por `endpoint`.
- Tela: dedupe por `id` e descarte de respostas de reload fora de ordem.

## Migration nova (rodar ANTES do deploy do backend)
`1757300000000-InternalNotificationLifecycle`: `admin_users.avatar_url`, `internal_notification_reads.deleted_at`, remove duplicatas antigas, índice único parcial, índice por `created_at`.

## Decisões que podem ser trocadas
- Selo de verificado: só o CEO (administrador do restaurante). Regra única em `isAuthorVerified` (backend).
- Avatar: `admin_users.avatar_url` (ainda sem tela de upload); CEO e "Sistema" caem na logo do restaurante; demais, inicial do nome.
- Edição agrupada atualiza `created_at`, então os 7 dias recontam a partir dela.
- Informações ficou no mesmo ponto onde ficavam as redes sociais (primeiro bloco abaixo do card de entrega).

## Variáveis de ambiente
- Vercel (cardápio): a função usa `API_URL` ou, se não houver, `VITE_API_URL` (já existente).
- Opcional: `VITE_PUBLIC_APP_URL` (domínio público) — necessário só se o link for gerado de dentro do app Android (Capacitor).

## Testes
- Lógica pura: `frontend-admin: npm run test:logic` e `frontend-cardapio: npm run test:logic` (usam `npx tsx`).
- Banco: `backend: npm run test:notifications` (novo, entra no `test:all`).
- Preview OG, após o deploy: `curl -A "WhatsApp/2.23" https://SEU-DOMINIO/SLUG/produto/ID | grep og:` deve listar as meta tags; sem o User-Agent de robô deve vir o app normal.
