# HANDOFF COMPLETO — Cardápio SaaS (consolidado em 03/10/2026, sessão Z)

Este documento **substitui o `HANDOFF-COMPLETO-2026-09-29-W.md`** e todos os handoffs de sessão individuais anteriores. Se você é uma sessão nova do Claude, **leia isso inteiro antes de tocar em qualquer código**.

As sessões que escreveram isto (X, Y e Z, 29/09–03/10) seguiram o padrão que o Felipe valoriza e que vale manter: ler o código de verdade antes de mexer (nunca assumir a partir só do handoff), rodar `tsc` nos três projetos antes de entregar, testar a integridade do zip, fazer varredura ativa por bugs relacionados ao que foi mexido, e ser **honesto sobre o que não dá pra testar daqui**. Novidade das sessões X–Z: **dá pra instalar um Postgres real no sandbox e testar migrations e regras de negócio de verdade** (seção 15) — faça isso sempre que mexer em banco ou em regra de sessão/pagamento, em vez de entregar "compila, deve funcionar".

## 0. O que fazer primeiro (antes de qualquer pedido novo)

O Felipe não confirmou o estado do deploy dos últimos zips. Antes de mexer em qualquer coisa, peça pra ele (ou confira no que ele colar):

1. **Migrations aplicadas?** Ele confirmou 52 migrations aplicadas (até `1756700000000`, em 30/09). Foram entregues **3 migrations novas depois disso** — `1756800000000`, `1756900000000`, `1757000000000` — e **não há confirmação de que rodaram**. Peça a saída de `npm run typeorm -- migration:show` (seção 3). Se estiverem pendentes, o backend novo **quebra os endpoints de mesa e de categorias**.
2. **Qual `BUILD_VERSION` aparece no rodapé do app?** O último zip entregue marca `2026-10-02-sessao-z-01`.
3. **O Pix do Mercado Pago funciona?** Último estado conhecido: a conta REAL dele dava `401 Unauthorized use of live credentials` (seção 8). Era ação dele no painel do Mercado Pago, não código.

## 1. O que é o projeto

Cardápio SaaS: plataforma multi-tenant de cardápio digital e pedidos pra restaurantes/bares. Três subprojetos num monorepo:

- **backend/** — NestJS + TypeScript + TypeORM + PostgreSQL (via Supabase).
- **frontend-admin/** — React + Vite + Tailwind. Painel do dono do restaurante. **Nunca publicado** — roda só local (`npm run dev`), decisão intencional. (`package.json` tem `"type": "module"`.)
- **frontend-cardapio/** — React + Vite + Tailwind. App do cliente final. Publicado na Vercel.

**Em produção** desde início de setembro de 2026.

## 2. Quem é o usuário e como ele trabalha

Felipe é "vibe coder": não escreve nem edita código manualmente. Toda entrega é feita por **zip + bloco de comandos de terminal que ele copia e cola**. Preferência salva: quando dá os comandos de terminal, dar **só o bloco de comandos**, sem texto explicativo misturado no meio e sem widgets de passo-a-passo — a explicação vem antes, os comandos vêm depois, puros.

Ele se frustra (com razão, várias vezes) quando uma correção é entregue como resolvida sem ter sido validada de verdade, ou quando o mesmo tipo de bug volta. Quando frustrado, escreve em caixa alta e xinga — isso não muda o rigor técnico nem deve gerar defensividade; só mais cuidado e honestidade sobre incerteza. Quando ele dá uma regra em caixa alta ("DECISÃO FINAL", "NÃO NEGOCIÁVEL"), **trate como regra permanente do projeto** (as vigentes estão na seção 4).

Ele usa a palavra **"seção"** (não "sessão") nos textos que define pra tela — copie o texto exato quando ele ditar.

Ele pede, e aprecia, varredura ativa por bugs relacionados ao que está sendo mexido. E aceita bem quando você **recusa prometer o impossível** e explica o limite com clareza (ex: o limite do QR code, seção 6) — o que ele não aceita é prometer e não entregar.

## 3. Deploy — topologia e COMANDOS PRONTOS

| Peça | Onde | Como atualizar |
|---|---|---|
| Backend | Render (free tier, cold start) | `git push` (auto-deploy da branch `main`) |
| Banco | Supabase | `cd backend && npm run migration:run` manual, **sempre ANTES do push** quando houver migration nova |
| frontend-cardapio | Vercel `cardapio-saas-beta.vercel.app` (projeto real chamado `cardapio-saas` no painel — "-beta" é só o alias/domínio) | `npx vercel --prod --force` de dentro de `frontend-cardapio/` |
| frontend-admin | Não publicado | `npm run dev` local sempre |

- Repo: `github.com/Fredericrypto/cardapio-saas`. Git sempre da raiz do monorepo; npm sempre da subpasta específica — sempre dizer explicitamente qual. Pasta local dele: `~/Projetos/cardapio-saas`.
- Autenticação do GitHub é por **token pessoal** (classic, escopo `repo`), não senha.
- Render precisa da connection string do Supabase em modo **"Transaction pooler"** (porta 6543) — Render não tem saída IPv6. Dev local usa a connection string direta (**é o mesmo banco** — o `.env` local aponta pro mesmo Supabase que o Render usa).
- Render é plano grátis: "dorme" sem requisição. Cron jobs não rodam com o processo dormindo. **O polling do painel admin mantém o Render acordado enquanto o painel está aberto** — por isso o polling do admin NÃO pode ser reduzido (regra, seção 4).
- **Logs do Render** (aba Logs do serviço) foram o que achou a causa raiz de quase tudo nas sessões X–Y: o backend só imprime quando QUEBRA (500) ou quando o Mercado Pago recusa; respostas 4xx e sucessos **não** aparecem. Log vazio ≠ nada aconteceu.

### Bloco padrão pra aplicar um zip (adapte só o nome do zip e a mensagem do commit)

```bash
cd ~/Downloads
unzip -o NOME-DO-ZIP.zip -d NOME-DO-ZIP
rsync -av --exclude '.git' --exclude 'node_modules' --exclude '.env' --exclude 'android' NOME-DO-ZIP/ ~/Projetos/cardapio-saas/
cd ~/Projetos/cardapio-saas/backend
npm run typeorm -- migration:show
npm run migration:run
cd ~/Projetos/cardapio-saas
git add -A
git commit -m "mensagem do commit"
git push
cd frontend-cardapio
npx vercel --prod --force
```

Depois: esperar o Render ficar **"Live"**, **fechar o app do celular por completo e abrir de novo**, e reiniciar o `npm run dev` do painel admin. Conferir o `BUILD_VERSION` no rodapé.

### Comandos do dia a dia dele

```bash
# backend local (terminal 1)
cd ~/Projetos/cardapio-saas/backend && npm run start:dev
# painel admin local (terminal 2)
cd ~/Projetos/cardapio-saas/frontend-admin && npm run dev
# estado das migrations
cd ~/Projetos/cardapio-saas/backend && npm run typeorm -- migration:show
# último commit / confirmar deploy
cd ~/Projetos/cardapio-saas && git log -1 --stat | head -20
```

Erro clássico dele: rodar comandos da pasta errada (`cd backend` estando dentro de `frontend-admin`). **Sempre use caminho completo com `cd ~/Projetos/cardapio-saas/...`** nos blocos.

## 4. Convenções fixas e REGRAS PERMANENTES

### Convenções técnicas — quebrar qualquer uma já causou bug real
- Nome do arquivo do zip sempre com data+hora, nunca reaproveitado. Sempre testar integridade (`unzip -t`) antes de entregar.
- **`frontend-admin` e `frontend-cardapio` usam TypeScript project references** — a ÚNICA checagem válida é `npx tsc -b --noEmit --force` (depois de `npm install`). `tsc --noEmit` sozinho sempre reporta "limpo" mesmo com erro real. O `backend` tem tsconfig normal: `npx tsc --noEmit` simples está certo lá. Rode também `npx vite build` nos dois frontends quando mexer em muita coisa.
- Migration nova ou alterada: sempre listar claramente que precisa rodar `npm run migration:run`, **e que vem antes do push**.
- **TypeORM**: `@Column()` com `string | null` ou union de string literal precisa de `type: 'varchar'` explícito (ou `'uuid'`), ou quebra em runtime, sem o `tsc` acusar.
- **Toda entidade TypeORM nova precisa ser registrada em DOIS lugares**: `app.module.ts` E `src/config/data-source.ts`. (Nas sessões X–Z não foi criada entidade nova — só colunas.)
- Dados financeiros/de auditoria: soft-delete só, nunca hard delete. Locks pessimistas sempre em ordem determinística.
- **Um zip baixado precisa ser DESCOMPACTADO antes do rsync.**
- **Marcador de build**: `frontend-admin/src/buildInfo.ts` e `frontend-cardapio/src/buildInfo.ts` exportam `BUILD_VERSION` — **bumpar em TODA entrega nova**, nos dois arquivos. Histórico recente: `…-sessao-x-01…05` (30/09), `2026-10-01-sessao-y-01/02`, `2026-10-02-sessao-z-01` (atual).
- Nunca mostrar texto cru de erro do servidor pro cliente final — só 4xx escrito de propósito em português simples; 5xx/falha de rede vira mensagem genérica amigável. (O fechamento de conta agora mostra a mensagem do backend só em 4xx.)
- Endpoints GET que servem dado que muda com frequência levam `Cache-Control: no-store`.
- **CORS** (`main.ts`): `origin: true`, sem `allowedHeaders` (a lib reflete o que o navegador pede — por isso `X-Seat-Token`/`X-Confirm-Join` passam sem configurar nada) e `maxAge: 86400` (sem isso o navegador refaz o OPTIONS antes de cada GET de polling).
- Criptografia de segredos (`encryption.ts`, AES-GCM): a chave é `CREDENTIALS_ENCRYPTION_KEY`. **Chave diferente (ou com espaço/aspas) = `Unsupported state or unable to authenticate data`** — foi a causa de um bug real (seção 8).
- No sandbox, o `frontend-admin` é ESM (`"type":"module"`): pra testar componentes dele com `ts-node`, copie os arquivos pra uma pasta temporária com `package.json {"type":"commonjs"}` e `node_modules` linkado (seção 15).

### Regras permanentes ditadas pelo Felipe (DECISÕES FINAIS — não flexibilizar)
1. **Polling do painel admin fica como o original** (`frontend-admin/src/hooks/usePolling.ts` — NÃO tocar): aba em segundo plano não pode atrasar pedido novo nem deixar o Render dormir. Intervalos atuais: pedidos e mesas ativas 5s, garçom 4s, verificações 10s. (Uma sessão diminuiu o ritmo em segundo plano e ele mandou reverter.)
2. **Sessão encerrada ou saída da mesa é DEFINITIVA**, por qualquer motivo (cliente, admin, "corrigir sessão", pagamento, prazo, "sair da mesa"). Nenhuma forma de reabrir sem escanear o QR de novo — recarregar, voltar, restaurar aba, limpar cache, trocar de conta: nada reabre (seção 6).
3. **Mesa encerrada à força pelo admin ("corrigir sessão") e saída do último cliente de mesa vazia liberam a mesa na hora** pro próximo scan (sem a trava de 2 minutos).
4. **Cashback é exclusivo de quem tem conta.** Convidado não tem nenhum acesso (servidor recusa; telas mostram só o aviso "Faça login ou crie uma conta para usufruir dos benefícios do cashback" + botão que leva ao login e volta EXATAMENTE pra onde ia pagar).
5. **Cada conta tem as SUAS seções de mesa** (como Instagram/YouTube): trocar de conta no mesmo aparelho nunca entra na mesa da anterior; a seção da conta primária continua intacta ao voltar.
6. **Entrar numa mesa que já tem seção aberta exige confirmação** — texto exato: "Já existe uma seção em aberto nesta mesa. Deseja se juntar?" com botões **Sim** / **Cancelar**. Só depois do "Sim" a pessoa entra e aparece pro admin e pros outros.
7. **Qualquer cliente (logado ou visitante, inclusive quem abriu a mesa) pode sair da mesa se não tem pedido seu; pedido cancelado NÃO conta como pedido.**
8. Quem entra numa mesa aparece **na hora** no painel do admin, **antes** de pedir (visitante aparece como "Visitante"). Quem saiu fica **cinza** com "Cliente saiu da mesa" (mantendo o selo de quem abriu).
9. **Nome do visitante** no pedido: obrigatório, 4–16 caracteres, começa com letra, sem caracteres especiais, exatamente 4 caracteres = só letras, 5+ pode ter números, nunca só espaços. (Aceito espaço simples entre palavras.) Validado no app (`lib/guestName.ts`) **e** no servidor (`common/utils/guest-name.ts`) — o servidor manda.
10. **Em "Minha conta" e no cupom final**: todas as pessoas da mesa, com nome e avatar, e cada pedido embaixo de quem fez; cliente verificado leva o tick de verificação em TODOS os lugares.
11. **Modais travam a rolagem da página** (`hooks/useScrollLock.ts`, com contador de referência). Todo modal novo deve usar.
12. **Categorias**: catálogo organizado + criar personalizada + reordenar; presets de tipo de estabelecimento **só marcam a seleção inicial, nunca travam a edição** (seção 10). Ícones de categoria sempre de **traço fino**, nunca emoji.
13. Aviso "Garçom chamado! Alguém vai até a sua mesa em instantes." usa o visual do `FloatingNotice` (o do QR cancelado) e **só some quando o admin dispensa o chamado** no painel.

## 5. Mapa de arquivos novos/chave das sessões X–Z

**Backend** (`backend/src/`)
- `modules/tables/tables.service.ts` / `tables.controller.ts` — assentos, saída da mesa, confirmação de entrada, resumo com pessoas, garçom com nome.
- `modules/tables/table-session-participant.entity.ts` — agora é o **assento** (visitante ou conta).
- `modules/orders/orders.service.ts` — valida assento ativo ao pedir na mesa (trava a sessão), valida nome de visitante, cashback só de logado, cancela cobrança Pix no gateway ao expirar.
- `modules/payments/mercadopago.service.ts` — vencimento mínimo de 31 min, data com `-03:00`.
- `common/utils/guest-name.ts` — regra do nome do visitante.
- `modules/categories/` — `category-catalog.ts` (102 entradas), `categories.service.ts` (lote, personalizada, reordenar, excluir), `dto/category-dtos.ts`.
- `migrations/1756800000000-TableSeatsAndExit.ts`, `1756900000000-WaiterCallCaller.ts`, `1757000000000-CategoryOrderNormalize.ts`.

**frontend-cardapio** (`src/`)
- `lib/identity.ts`, `lib/seat.ts` — identidade por conta, assento, ponteiro de mesa, intenção de scan do QR do app.
- `hooks/useTableSession.ts`, `components/TableSessionGate.tsx` — regra de entrada/retomada/tela final.
- `lib/menu-api.ts` — todas as chamadas de mesa mandam `X-Seat-Token` (+ `Authorization` quando logado).
- `components/PeopleOrders.tsx`, `ReceiptContent.tsx`, `pages/MyAccountPage.tsx` — pessoas e pedidos.
- `components/CashbackLoginNotice.tsx`, `ClosingPaymentSheet.tsx`, `pages/CartPage.tsx` — cashback/convidado, carrinho vazio, botão "Ir para pagamento".
- `components/ReviewsShared.tsx`, `pages/PublicReviewsPage.tsx`, `pages/ItemReviewsPage.tsx` — avaliações (restaurante e item) no mesmo layout; resposta do restaurante com logo quadrado.
- `components/LogoViewer.tsx`, `ConfirmModal.tsx`, `hooks/useScrollLock.ts`, `lib/guestName.ts`.
- `components/categoryLineIcons.tsx` + `CategoryIcon.tsx` — ícones de categoria (arquivo `categoryLineIcons.tsx` é **idêntico** no admin e no cardápio).

**frontend-admin** (`src/`)
- `components/CategoryManager.tsx`, `lib/categoryCatalog.ts`, `lib/establishmentTypes.tsx`, `components/categoryLineIcons.tsx`, `pages/MenuManagementPage.tsx` — categorias.
- `pages/DashboardPage.tsx` — roster de clientes (cinza p/ quem saiu), chamados de garçom (nome de quem chamou, paleta preta), `components/AdminLayout.tsx` (nome do restaurante inteiro).

## 6. Arquitetura de sessão de mesa — REESCRITA (assentos) — LEIA ANTES DE MEXER

### 6.1 Modelo
- Cada pessoa que entra numa mesa (**logada ou visitante**) tem um **assento**: uma linha em `table_session_participants` com `seat_token` (256 bits, único) e `left_at`. Visitante = `customer_id` nulo.
- O servidor é a autoridade. O app só guarda e reenvia o token no header **`X-Seat-Token`**.
- **Assento de conta só vale pra aquela conta**: `findSeat` (`TablesService`) ignora o token se `seat.customerId` existe e é diferente do cliente autenticado da requisição (e se a requisição é anônima). Isso é o **isolamento entre contas** do lado do servidor.
- **Saiu = morreu pra sempre.** `left_at` preenchido: pedido, fechamento de conta, chamado de garçom e leitura retornam `403` ("Você saiu desta mesa. Escaneie o QR Code da mesa novamente para voltar.") ou `seat: 'left'`. Reentrada = **novo assento** (`enterSeat` gera token novo e o antigo nunca mais vale).
- Visitante que faz login no meio da visita: o assento passa a ser da conta (`bindSeatToCustomer`); se era o primeiro assento da sessão, a conta vira "quem abriu a mesa".
- `orders.table_participant_id` liga cada pedido ao assento (regra "só sai quem não tem pedido" e agrupamento por pessoa).
- `table_sessions.closed_reason = 'saida_sem_pedido'` marca sessão vazia fechada porque o último cliente saiu.

### 6.2 Endpoints de mesa do cliente (headers)
| Endpoint | Headers relevantes |
|---|---|
| `POST /table-sessions/public/scan/:qrCodeToken` | `X-Seat-Token`, `Authorization`, **`X-Confirm-Join: 1`** (obrigatório pra entrar numa sessão que já existe e onde você não tem assento vivo — senão `409 {code:'JOIN_CONFIRMATION_REQUIRED'}`). Resposta: sessão + `seatToken`. |
| `GET /table-sessions/public/current/:qrCodeToken` | `X-Seat-Token`, `Authorization`. Resposta: `{session, recentlyEnded, seat: 'active'|'left'|'none', seatToken?}` |
| `POST /table-sessions/public/:qrCodeToken/leave` | `X-Seat-Token`, `Authorization`. Transação com `pessimistic_write` na sessão. |
| `GET …/:tenantId/:sessionId/summary` | `X-Seat-Token`, `Authorization`. Devolve `mySeat {active, canLeave}`, `people[]`, `unassignedOrderIds`. |
| `POST …/request-closing`, `call-waiter`, `cancel-waiter-call`, `POST /orders/public/:tenantId` (mesa) | `X-Seat-Token`, `Authorization` |

### 6.3 Saída da mesa (`TablesService.leaveTable`)
Tudo numa transação com a sessão travada (`pessimistic_write`); `OrdersService.create` trava a **mesma linha** (`pessimistic_read`) antes de aceitar pedido de mesa → pedido e saída nunca se cruzam. Regras: recusa (409) se o assento tem pedido não cancelado (por `table_participant_id` ou `customer_id`); senão mata o assento; se não sobrou ninguém ativo **e** a sessão não tem pedido vivo → fecha a sessão (`closedReason`), cancela chamados de garçom pendentes. Se sobrou gente, a sessão segue (inclusive se quem saiu abriu a mesa).

### 6.4 Regras no app (`useTableSession.ts` — a "matriz" completa)
Primeiro, decide se a carga é uma **"abertura nova" (= escaneamento)**: (a) o documento foi aberto por navegação nova (`navigate`) **numa URL de mesa**, só na primeira checagem; ou (b) o **leitor de QR do próprio app** acabou de ler este QR (`markQrScanIntent`/`consumeQrScanIntent` em `lib/seat.ts` — em memória, uso único, validade 15s; some num refresh). Esse segundo caminho existe porque o leitor navega por dentro do app, sem recarregar a página — sem ele, escanear de novo pelo app depois de sair da mesa mostrava "sessão já fechada" (bug real).

| Situação | Resultado |
|---|---|
| Servidor diz `seat='active'` | **Retoma** a sessão |
| Sessão existe, sem assento vivo, **não** é abertura nova (refresh/voltar/remontar) | Tela final ("Você saiu desta mesa" / "Sessão encerrada"); se a conta **nunca teve** assento nessa mesa → vai pro **cardápio geral** (caso da troca de conta) |
| Sessão existe, sem assento vivo, **é** abertura nova | Pergunta "Já existe uma seção em aberto nesta mesa. Deseja se juntar?" (Sim → `scan` com `X-Confirm-Join`) |
| Sem sessão, `recentlyEnded` | Tela final |
| Sem sessão, não é abertura nova | Tela final (nada é criado) |
| Sem sessão, é abertura nova | Abre sessão direto (se o servidor responder 409 de confirmação — alguém abriu no meio — cai na pergunta) |

`recentlyEnded` (trava de 2 min após fechamento **normal**) **não** conta pra encerramento forçado (`force_closed_reason`) nem pra `closed_reason='saida_sem_pedido'`.

### 6.5 Armazenamento no aparelho (localStorage) — SEMPRE por identidade
`identity` = id da conta (campo `sub` do JWT do cliente, decodificado em `lib/identity.ts`) ou `'guest'`:
- `mesa_assento_{identity}_{qrToken}` → `{s: sessionId, t: seatToken}`; `mesa_assento_sessao_{identity}_{sessionId}` → token
- `mesa_ativa_{identity}_{slug}` → ponteiro "qual mesa estou usando" (substitui o antigo `mesa_ativa_{slug}`; **todos** os usos passam `customerToken` primeiro)
- `mesa_saiu_{identity}_{qrToken}` → só escolhe o texto da tela final
- `historico_recolhido_{identity}_{tenantId}` → datas recolhidas no histórico de pedidos
- `adoptGuestSession` migra o assento de `'guest'` pra conta que acabou de logar (e **nunca** toca no que é de outra conta).

### 6.6 ⚠️ LIMITE FÍSICO — dizer com clareza ao Felipe sempre que ele pedir "sem nenhum bypass"
O QR code é só um link. **Escanear de novo e abrir o mesmo link de novo são a mesma requisição** pro navegador e pro servidor. Quem abre o link deliberadamente entra (com assento novo e confirmação). O desenho garante que **nada que não seja uma nova entrada deliberada devolve a sessão de quem saiu** (refresh, voltar, restaurar aba, limpar dados do site, troca de conta, token antigo, chamada direta na API). Não prometa mais que isso.

### 6.7 Outras regras de mesa que continuam valendo
- Bloqueio entre mesas: sessão ativa em outro lugar COM pedido de verdade bloqueia; uma sessão vazia que ele mesmo abriu em outro lugar é fechada sozinha. (Por isso, ao testar com a mesma conta em duas mesas, uma tem que ser deixada antes.)
- Balcão/Entrega com mesa aberta é bloqueio de verdade (`ConflictException`).
- Sync entre dispositivos: polling de 20s na sessão (pausado com aba escondida). WebSocket/push descartado (Render grátis + Vercel). A tela "Fechar minha conta" (`MyAccountPage`) consulta a cada 4s, **só com a aba visível**, sem empilhar requisições.
- Cron a cada 1 min fecha sessão vazia expirada — só enquanto o processo está acordado.
- **Ao publicar assentos**: convidados que já estavam sentados naquele momento ficam sem assento no banco e veem "sessão encerrada" → **publicar com o restaurante sem mesas abertas**. Sessões antigas (pré-assentos) retornam `people: []` e as telas caem na lista plana.

## 7. Cashback — regras e a correção de uma falha silenciosa
- **Bug real corrigido (30/09)**: `requestSessionClosing` não mandava o `Authorization` → o servidor via "convidado" e ignorava o cashback em silêncio (e `pagar só com cashback` dava "Ative usar meu cashback" mesmo com ele ativado). Também mandava o Pix com e-mail de convidado. Hoje todas as chamadas de mesa mandam o token do cliente.
- `ClosingPaymentSheet`: **um botão só** — se o saldo cobre a conta inteira, o botão vira "Pagar com cashback" (um toque escolhe, outro desfaz); senão "Usar meu cashback" (parcial). Continua explícito: nunca assume.
- Convidado: servidor recusa (`requestClosing` e `OrdersService.create`) com a mensagem da regra 4; as telas (fechamento e carrinho) mostram `CashbackLoginNotice`. O login vai por `/{slug}/conta-cliente/entrar?redirect=<caminho>` e volta com `?fechar=1` (a `MyAccountPage` reabre a folha de pagamento e consome o parâmetro).
- Ícone de cashback: `CircleDollarSign` (lucide) nas notificações, no "Saldo disponível" e no perfil (fundo `#3d3846`, ícone `#c0bfbc`).

## 8. Fechamento de conta, Pix e Mercado Pago (estado + o que se aprendeu em produção)

### Fluxo (sessões V/W, ainda válido)
1. Cliente toca "Solicitar fechamento" → `ClosingPaymentSheet.tsx`: forma de pagamento (Pix/Cartão/Dinheiro), cashback (com prévia ao vivo), se dinheiro: balcão ou atendente.
2. Mesa compartilhada: pergunta como dividir o cashback GANHO (`'por_pedido'` padrão ou `'pagador'`). Quem não pediu nada nunca recebe.
3. Pix real via Mercado Pago reaproveita `MercadoPagoService`/`OrdersService`. Só funciona com o **access token do Mercado Pago do tenant** configurado em Configurações. QR + copia-e-cola (`TableSessionPixWaitingPanel.tsx`), polling próprio, contagem de 15 min na mesa (6 min em pedido avulso). Confirmação por webhook OU polling; webhook `/orders/public/:tenantId/webhook/mercadopago` distingue mesa pelo prefixo `mesa:` na `externalReference`.
4. Admin só digita valor (troco) quando é dinheiro. Cashback ganho só é creditado após pagamento confirmado; cashback usado é debitado com lock pessimista.
5. Colunas de `table_sessions` (migrations `1756600000000`/`1756700000000`): `requested_payment_method`, `cash_delivery_preference`, `cashback_requested_by_customer_id`, `cashback_used`, `closing_requested_by_customer_id`, `cashback_split_mode`, `mp_payment_id`, `pix_payload`, `pix_expires_at`, `payment_status`. `cashback_consumptions` é polimórfico (`order_id` OU `table_session_id`, CHECK de exatamente um).

### O que a investigação de 30/09 achou (útil se o erro voltar)
1. Mensagem "Não foi possível solicitar o fechamento…" é genérica e escondia tudo. **Causa 1**: o token do Mercado Pago salvo no banco tinha sido criptografado com **outra** `CREDENTIALS_ENCRYPTION_KEY` (provavelmente salvo pelo admin com backend local) → `decryptSecret` falhava no Render (500) → quebrava fechamento de mesa e pedidos Pix. Resolveu **re-salvando o token em Configurações** com a chave certa. Script de diagnóstico (rode da pasta `backend`, não imprime segredo):

```bash
cd ~/Projetos/cardapio-saas/backend
cat > check-key.ts <<'EOF'
import { AppDataSource } from './src/config/data-source';
import { decryptSecret } from './src/common/utils/encryption';
(async () => {
  await AppDataSource.initialize();
  const rows = await AppDataSource.query(
    `SELECT slug, mercado_pago_access_token_encrypted AS t, mercado_pago_webhook_secret_encrypted AS w FROM tenants`,
  );
  for (const r of rows) {
    for (const [nome, v] of [['access token', r.t], ['webhook secret', r.w]] as [string, string | null][]) {
      if (!v) { console.log(r.slug, '-', nome, ': vazio'); continue; }
      try { decryptSecret(v); console.log(r.slug, '-', nome, ': OK'); }
      catch { console.log(r.slug, '-', nome, ': FALHA'); }
    }
  }
  await AppDataSource.destroy();
})();
EOF
npx ts-node -T check-key.ts
rm -f check-key.ts
```

2. **Causa 2 (atual, NÃO resolvida por código)**: o Mercado Pago responde `401 {"message":"Unauthorized use of live credentials","code":7}` ao criar o Pix com o token de **produção (`APP_USR-`) da conta REAL** do Felipe. Significa que as **credenciais de produção da aplicação não estão ativadas** (ou há outro bloqueio da conta). Uma conta de **teste** (vendedor de teste) que ele criou antes funcionava porque o token de um usuário fictício não precisa de ativação. Caminhos: (a) ativar as credenciais de produção no painel do Mercado Pago (Suas integrações → aplicação → credenciais de produção); (b) usar o access token de um **vendedor de teste** (as Contas de teste ficam na aplicação, no painel de desenvolvedor; até 15, não se apagam; o painel mostra usuário e senha) e colar em Configurações; (c) suporte do MP com o código do erro. Em produção real, **cada restaurante usa a própria conta/credenciais** (token por tenant, criptografado). Ideia futura (não implementada): OAuth do Mercado Pago em vez de colar token.
3. Correções de código feitas no caminho (valem independente de 1 e 2): o MP exige **vencimento do Pix entre 30 min e 30 dias** → `createPixPayment` envia sempre `max(prazo do app, agora+31min)`, em formato `…000-03:00`; quando o **prazo do app** (6/15 min) estoura, o backend **cancela a cobrança no gateway** (melhor esforço) pra não entrar dinheiro que o sistema já esqueceu — em `OrdersService.findAll`/`checkPixStatus` e na expiração da mesa; `checkPixStatus` agora usa `markCancelled` (devolve promoção/cashback — antes só o polling do admin devolvia). O fechamento no app mostra a mensagem do backend em 4xx.

### ⚠️ LIMITAÇÃO CONHECIDA E NÃO RESOLVIDA — PRIORIDADE ANTES DE QUALQUER COISA NOVA EM PAGAMENTO/MESA
**Se alguém pedir mais um item enquanto um Pix real (Mercado Pago) está pendente pra aquela mesa, a sessão volta sozinha pra `'aberta'`** (reversão legítima de outro fluxo — `OrdersService.create`, comentário "Se o cliente já tinha solicitado fechamento e pediu mais alguma coisa antes do garçom vir"). **Se o cliente pagar o QR antigo mesmo assim**, o dinheiro cai na conta do restaurante no Mercado Pago, mas `applyMercadoPagoStatusToSession` ignora o webhook/poll (`session.status !== 'fechamento_solicitado'`) → pagamento **órfão**. Resolver exige **bloquear novos pedidos enquanto `paymentStatus === 'pendente'`** (mensagem clara) ou oferecer **cancelar a cobrança pendente** antes (`MercadoPagoService.cancelPayment` já existe). Sem isso, o admin precisa conferir o extrato do MP contra o histórico do app. (Nada disso foi tocado nas sessões X–Z.)

## 9. Pessoas na mesa, cupom, painel e garçom
- Resumo da sessão (`getSessionSummary`) devolve `people[]` (`id, name, avatarUrl, isOpener, isGuest, isMe, isVerified, orderIds`) e `unassignedOrderIds`. Visitante sem pedido = "Visitante" (numerado: "Visitante 2"…); depois de pedir vira o nome digitado.
- `PeopleOrders.tsx`: usado em **Minha conta** (`dark`: card preto, gradiente `#27272A → #0A0A0B`, a mesma paleta dos cards de mesa do admin) e no **cupom** (`ReceiptContent.tsx`, compacto). Quem saiu sem pedido não aparece no cupom.
- Admin (`findAllForAdmin`): roster inclui assentos de visitante e quem **já saiu** (`hasLeft`). Atualiza pelo polling (≤ ~5s, não é tempo real de verdade).
- **Garçom**: `waiter_calls.table_participant_id` + `called_by_name` (nome no momento do chamado; visitante = "Visitante" ou o nome do último pedido). Painel mostra "Mesa X — nome". No celular: `FloatingNotice` com `persistent` enquanto `isWaiterCallPending` (o polling zera quando o admin atende).
- Valores do cupom (desconto/cashback) ficam em **uma linha** (`whitespace-nowrap`) no app e no painel.

## 10. Sistema de categorias — REESTRUTURADO (sessão Z, 02/10; substitui a seção 7 antiga)

- **Catálogo**: 102 entradas em `category-catalog.ts` (backend) espelhadas em `frontend-admin/src/lib/categoryCatalog.ts`: **60 universais** (`core`: 27 pratos/refeições, 13 bebidas, 14 doces/sobremesas, 6 saudáveis) + **42 especialidades** (Japonês, Chinês, Coreano, Orientais [Molhos/Extras compartilhada], Pizzaria, Cafeteria/Padaria/Bar). As chaves das 22 categorias antigas foram mantidas (mudou só o nome "Pratos Executivos" → "Pratos do Dia / Executivos" e "Smoothies" → "Smoothies / Detox" pra novas ativações; nomes já gravados por loja não mudam).
- **Tipos de estabelecimento** (`establishmentTypes.tsx`, só no admin): Lanchonete, Pizzaria, Japonês, **Chinês**, **Coreano**, Churrascaria, Cafeteria, Bar/Pub, Restaurante, Saudável/Fitness, Confeitaria, Sorveteria, Padaria, Alta Gastronomia. Cada um é uma lista de chaves. **Escolher o tipo só MARCA** (união com marcações manuais, que prevalecem); o dono marca mais, desmarca, adiciona e remove depois. Cafeteria e Padaria usam a mesma lista (a que o Felipe passou). Chinês e Coreano = exatamente as 13 categorias pedidas.
- **Tela** (`CategoryManager.tsx`, botão "Gerenciar categorias" em `MenuManagementPage`): 3 abas — **Minhas categorias** (ordem do cardápio, arrastar/setas, renomear personalizadas, remover; desativadas numa seção à parte), **Catálogo e tipos** (tipos no topo, busca, grupos recolhíveis; especialidades recolhidas e que abrem sozinhas com o tipo), **Criar personalizada**. A coluna esquerda de `MenuManagementPage` ficou só pra escolher a categoria ao editar itens.
- **API** (`/categories`, JWT do admin): `PUT catalog/:key` (liga/desliga uma), `POST catalog-bulk {keys[]}` (ativa várias, tudo-ou-nada, só adiciona, entram no fim), `POST custom {name}`, `PUT order {ids[]}` (rota estática antes das de `:id`), `PATCH :id {name}` (só personalizada), `PUT :id/active`, `DELETE :id` (**só personalizada vazia**; com itens → 409 explicando; do catálogo → 400, só desativa).
- Personalizada: `key = null`, nome 2–40 chars (letras/números e `/ & ( ) . , ' -`), sem duplicar nome da loja nem nome do catálogo ("já existe na lista pronta").
- **Ordem**: agora é só `display_order` (o dono reordena). A regra antiga "Lanches → Bebidas → Sobremesas fixos" **saiu do código**; a migration `1757000000000` "assou" a ordem antiga nas lojas existentes pra nada mudar.
- **Ícones**: `components/categoryLineIcons.tsx` (idêntico no admin e no cardápio): lucide + SVGs **desenhados no mesmo traço** (1.6, pontas arredondadas, 24x24) — sushi, rolinho, hossomaki, temaki, hot dog, taco, dumpling, tigelas (macarrão/arroz/bowl), cupcake, porção, caixinha oriental. Mapeamento chave→ícone em `LINE_CATEGORY_ICONS`; `getCategoryIcon(key, name)` devolve ícone genérico de etiqueta pra personalizada (sem chave). "Combinados" mudou pra `Boxes` (o de pizza agora é de "Pizzas"). **Ao adicionar categoria ao catálogo: backend + `categoryCatalog.ts` do admin + `LINE_CATEGORY_ICONS` nos dois apps** (existe um teste de paridade no histórico da sessão Z; refaça se mexer — seção 15).

## 11. UI/UX entregue nas sessões Y–Z (resumo)
- **Promoções**: cabeçalho igual ao das categorias (ícone `BadgePercent` + "Promoções" + seta); mais respiro antes da busca; "Nenhuma promoção no momento" mantendo a seta; sombra dos cards igual à dos itens (container com `pb-4 -mb-3` pra não cortar).
- **Avaliações**: nota no header do item abre a página completa (`/{slug}/produto/:productId/avaliacoes`); mesmo layout da do restaurante (`ReviewsPageLayout`); a lista solta no item saiu. Resposta do restaurante = nome + logo **quadrado arredondado** (nunca redondo) + texto.
- **Botão do carrinho** ("Ir para pagamento"): texto sumia até o toque — tirei o `translateZ(0)` da barra fixa, rótulo neutro "Carregando..." enquanto a loja não carregou, e `key` nos nós de texto. **Não confirmado em aparelho** — se voltar, pedir modelo/navegador.
- Logo do restaurante clicável em tela cheia com blur (`LogoViewer`, fecha tocando fora ou no voltar do aparelho via `popstate`); botão "Sair da mesa" e "Alterar foto" com o visual dos botões do header; "Sair da conta"/"Sair da mesa" usam `ConfirmModal`; carrinho vazio redesenhado; histórico de pedidos com seta por data (persistida, por conta e loja); nome do restaurante inteiro no admin (quebra de linha, `overflowWrap: anywhere`); bloco de chamados de garçom do admin na paleta preta.
- A nota (`ReviewBadge`) **já está** em `TableMenuHeader` (modo mesa/balcão) no código; o Felipe pediu pra mostrá-la nesse modo — se continuar sumindo no aparelho, investigar `useReviewSummary(tenant.id, location?.id)` no fluxo de mesa (loja/`locationId`).
- Trava de rolagem cobre: avatar/crop, verificação (explicação/câmera/parabéns), avaliação, fechamento, scanner de QR, remover item do carrinho, overlay de envio da verificação, logo, `ConfirmModal`. Pode haver outro modal não coberto — procurar `fixed inset-0`.

## 12. Ícones de marca
`BrandIcons.tsx` (Gmail, TikTok, Facebook, Instagram, YouTube) e `MenuIcons.tsx` (Todos/Lanches/Bebidas, Info, carrinho): todos os `d=` de SVG vieram colados pelo Felipe — **nunca desenhar à mão** (ele proibiu depois de 3 tentativas ruins). Degradê do YouTube: vermelho `#FF1A47` sólido até 60%, depois magenta `#FF1DCF`. **Exceção explícita (02/10)**: os ícones de **categorias novas** ele pediu pra **eu desenhar** no traço fino do app (`categoryLineIcons.tsx`) — isso não reabre a regra pros ícones de marca.

## 13. Sistemas entregues (resumo)
Cardápio, carrinho, pedido, cashback, cupom fiscal com código verificável (considera cashback usado); painel admin em tempo real (polling), status com um toque, borda azul piscante em pedido novo; Mesa vs Balcão, QR com correção de erro reforçada; múltiplas lojas por tenant (WhatsApp/Telegram/telefone por LOJA; redes sociais por MARCA); horário de funcionamento por dia; avaliações, cashback/loyalty, histórico com expiração de 7 dias, verificação de conta (selo azul `#1D9BF0`); push consolidadas por cliente; Mercado Pago real pra Pix (avulso e mesa) com idempotência, cancelamento de cobrança órfã e HMAC do webhook; **assentos de mesa, saída definitiva, isolamento entre contas, confirmação de entrada, pessoas por pedido, nome de visitante, categorias reestruturadas** (X–Z).

## 14. Migrations (ordem e status)
Até `1756700000000`: aplicadas (confirmado pelo Felipe, 52 no total). **Pendentes de confirmação** (entregues, não verificadas):

| Migration | O que faz | Se não rodar |
|---|---|---|
| `1756800000000-TableSeatsAndExit` | `table_session_participants.customer_id` opcional + `seat_token` único (backfill 256 bits); `orders.table_participant_id` (FK `ON DELETE SET NULL`); `table_sessions.closed_reason` | endpoints de mesa quebram |
| `1756900000000-WaiterCallCaller` | `waiter_calls.table_participant_id`, `called_by_name` | chamar garçom quebra |
| `1757000000000-CategoryOrderNormalize` | normaliza `display_order` por loja (Lanches/Bebidas/Sobremesas primeiro, resto como estava) | a ordem das categorias muda sozinha de lojas existentes |

Todas foram testadas em Postgres 16 real (up, down quando há, e com dados antigos). A `1757000000000` não tem `down` (irreversível por desenho).

## 15. Como TESTAR de verdade no sandbox (faça sempre que mexer em banco/regra)

```bash
apt-get update
apt-get install -y postgresql
service postgresql start
su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
su postgres -c "psql -c 'CREATE DATABASE cardapio_test;'"
cd backend && npm install
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/cardapio_test'
npx typeorm-ts-node-commonjs -d src/config/data-source.ts migration:run
```
(o `apt-get update` reclama do repositório nodesource — ignore; o Postgres instala mesmo assim.) Se o Postgres parar entre comandos: `service postgresql start`.

- **Teste de regra de negócio**: escreva um `test-xxx.ts` temporário em `backend/` que faz `AppDataSource.initialize()`, semeia (`INSERT INTO tenants/locations/restaurant_tables/customers …` — veja os NOT NULL com `information_schema.columns`), instancia o service com repositórios reais (`new TablesService(repo…, {} as any, …)`) e roda com `npx ts-node -T test-xxx.ts`; **apague o arquivo no fim** (`rm -f`) e não o inclua no zip. Foi assim que se validaram assentos, saída, corrida pedido×saída (transações concorrentes), confirmação de entrada, categorias (27 verificações) e a regra do nome do visitante.
- **Teste de migration**: `migration:run`, `migration:revert`, reaplicar, com linhas antigas inseridas antes (backfill).
- **Teste de componentes do admin (ESM)**: copiar os `.ts/.tsx` necessários pra `/tmp/smoke/src/...`, `package.json {"type":"commonjs"}`, `ln -s …/frontend-admin/node_modules /tmp/smoke/node_modules`, `tsconfig` com `jsx: react-jsx, module: commonjs, moduleResolution: bundler, ignoreDeprecations: "6.0"`, e `renderToStaticMarkup` de cada ícone (garante que renderiza SVG sem erro de execução — `tsc` não pega componente chamado como função, por exemplo).
- Validações padrão antes de entregar:

```bash
cd ~/Projetos/cardapio-saas/backend && npx tsc --noEmit
cd ~/Projetos/cardapio-saas/frontend-admin && npx tsc -b --noEmit --force && npx vite build
cd ~/Projetos/cardapio-saas/frontend-cardapio && npx tsc -b --noEmit --force && npx vite build
```
(apague `dist/` depois do `vite build`; não vai no zip.)

## 16. Pendências e limitações conhecidas (em ordem de prioridade)

1. **Pix órfão** com item novo durante cobrança pendente (seção 8) — maior risco financeiro aberto.
2. **Mercado Pago em produção**: ativar credenciais de produção da conta real (ação do Felipe) — sem isso o Pix real não funciona.
3. **Migrations `1756800000000`/`1756900000000`/`1757000000000`**: confirmar que rodaram em produção (seção 0).
4. **Nada da interface foi conferido em celular de verdade nas sessões X–Z** (só `tsc`, build e simulações de lógica). Em especial: botão do carrinho (seção 11), trava de rolagem em todos os modais, aviso fixo do garçom, logo em tela cheia com o botão voltar, "Minha conta" preta, ícones de categoria desenhados (tamanho/legibilidade), arrastar categorias no admin.
5. **Painel admin "instantâneo"**: é polling (≤ ~5s). Tempo real de verdade exigiria WebSocket/SSE, inviável no Render grátis.
6. **Convidado que limpa os dados do site perde o assento** (o servidor aguenta, mas ele precisa escanear de novo). Aceito.
7. `ReviewDisplay` mantém a prop legada `restaurantName` (não usada). Limpeza opcional.
8. Pendências antigas (nenhuma tocada; reproduzir antes de mexer): i18n entre tenants, login com Google no backend, área de Reclamações, exportação de recibo em PNG no mobile, clique de push não navegando em alguns testes mobile, auditoria geral de CSS mobile, lightbox de foto do restaurante, separação visual "pedido em casa vs no estabelecimento", "Agendar retirada", dois bugs antigos de promoção (localização afetando todas as promoções; promoção sumindo depois de salvar com validade futura).

## 17. Se algo parecer "consertado mas continua quebrado"
Nessa ordem:
1. O deploy realmente rodou? (`git log -1`, hash no GitHub; "Live" no Render; deployment mais recente na Vercel.)
2. O `BUILD_VERSION` no rodapé bate com o que foi mandado?
3. O app foi fechado por completo e reaberto do zero?
4. **A migration nova rodou?** (`migration:show`) — quase todo "tudo quebrou depois do deploy" nas sessões X–Z era migration pendente.
5. **Olhe o log do Render logo depois de reproduzir** (e o Network do navegador no desktop: F12 → Rede → Resposta). 4xx não aparece no log do Render; 500 sim.
6. Falta `Cache-Control` num GET que serve dado que muda?
7. Entidade nova registrada nos dois lugares (seção 4)?
8. Pagamento/Pix/cashback: confirme o `status`/`payment_status` da sessão AGORA em `table_sessions`, e se a `CREDENTIALS_ENCRYPTION_KEY` é a mesma em todos os lugares (Render, `.env` local) — `check-key.ts` (seção 8).
9. Mesa/QR: o que o **servidor** diz (`seat: 'active'|'left'|'none'`, `recentlyEnded`) e se a carga foi "abertura nova" ou refresh/voltar (seção 6.4). Lembrar que o leitor de QR do app navega sem recarregar a página.
10. "Entrou na mesa de outra conta": olhar as chaves `mesa_*_{identity}_*` do localStorage e se o servidor devolveu o assento de outra conta (não deveria — `findSeat`).

## 18. Zips entregues nas sessões X–Z (histórico)
`CORRECAO-PIX-2026-09-30-0800` → `CORRECAO-PIX-QR-2026-09-30-0821` → `SESSAO-FECHADA-2026-09-30-0829` → `CASHBACK-2026-09-30-0854` → `SAIDA-MESA-ASSENTOS-2026-10-01-0025` → `UI-AVALIACOES-2026-10-01-0526` → `ISOLAMENTO-CONTAS-2026-10-02-0408` → `CATEGORIAS-UI-2026-10-03-0014` (todos acumulativos; o último contém tudo). O zip **completo** que acompanha este documento é a base mais segura pra recomeçar.
