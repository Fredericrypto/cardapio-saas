# HANDOFF COMPLETO — Cardápio SaaS (consolidado em 07/10/2026, sessão Z5)

Este documento **substitui o `HANDOFF-COMPLETO-2026-10-03-Z.md`** (que por sua vez substituía o `…-09-29-W.md`) e os handoffs de sessão individuais Z2–Z5 (`docs/HANDOFF-2026-10-03-Z2.md`, `…-10-04-Z3.md`, `…-10-04-Z4.md`, `…-10-05-Z5.md`). Se você é uma sessão nova do Claude, **leia isso inteiro antes de tocar em qualquer código**. As seções 0–18 mantêm a numeração do handoff anterior (as referências cruzadas continuam valendo): o que é novo desde 03/10 está **atualizado dentro delas** e, em detalhe, nas **seções 19–24** (Análise, Anotações + notificações internas + Web Push da equipe, horário de funcionamento, dados sensíveis, cronologia dos pedidos e apêndice de arquivos).

## ⭐ Feedback do Felipe e PADRÃO EXIGIDO — leia antes de qualquer coisa

Ao final das sessões Z2–Z5 (03–06/10/2026) o Felipe escreveu **"Ótimo trabalho"** e pediu, textualmente, que este handoff registre que ele **gostou do trabalho feito nesta seção** e que **toda sessão futura siga sempre, minuciosamente, rigorosamente, matematicamente, de ponta a ponta, todas as implementações que ele pedir, em nível sênior.**

Isso não é elogio decorativo: é o padrão que produziu o resultado que ele aprovou e o que ele espera daqui pra frente. Na prática:

1. **Cada item pedido é implementado literalmente.** Quando ele manda uma lista numerada (17 itens na Z2; 10 correções + um módulo inteiro na Z3; etc.), cada número é uma entrega verificável. No fim, diga item a item o que foi feito e o que NÃO foi.
2. **Reproduza antes de corrigir e audite além do que foi apontado.** Na Z5 a auditoria achou 3 defeitos que ele nem tinha citado (custo estimado com fração de centavo, duas fontes de verdade para o ranking, rótulo negativo cortado no eixo do gráfico).
3. **Valide de verdade, nunca "compila, deve funcionar"**: Postgres real, navegador real (Chromium via Playwright), cálculo independente (SQL direto, frações exatas, invariantes em centavos) e testes que **ficam no repositório** (`backend/test/`, `docs/testes-e2e/`).
4. **Matemática financeira exata**: valores em **centavos inteiros**, arredondamento por pedido/linha e **uma única fonte de dados** alimentando cards, gráficos, matriz e exportação (a soma do gráfico tem que fechar com o card, em centavos).
5. **Honestidade total sobre o que não foi possível testar ou reproduzir** (ex.: na Z5 não consegui reproduzir o "Sorvete plotado em R$ 4,00" e o texto de "Burros de carga" já estava certo — isso foi dito, não fingido). Quando um teste falha, descubra se o erro é do código ou do teste e conserte o que de fato está errado.
6. **Regra ou trecho de código explícito do Felipe se segue à risca**, apontando os trade-offs em vez de decidi-los em silêncio (ex.: o piso do lucro projetado em 0, seção 19.9).
7. **Nível sênior**: modelagem correta (idempotência, transações, locks, isolamento entre restaurantes e entre usuários, nada sensível vazando pro cliente), código limpo e consistente com o padrão visual existente, **sem emoji** (sempre ícones de traço fino) e **sem remover lógica quando ele pede só para ocultar**.

As sessões que escreveram isto (X a Z5, 29/09–06/10) seguiram o padrão que o Felipe valoriza: ler o código de verdade antes de mexer (nunca assumir a partir só do handoff), rodar `tsc` nos três projetos antes de entregar, testar a integridade do zip, fazer varredura ativa por bugs relacionados ao que foi mexido e ser **honesto sobre o que não dá pra testar daqui**. Novidade das sessões X–Z5: **dá pra instalar um Postgres real no sandbox e também usar um Chromium headless (Playwright) para dirigir a interface de verdade** (seção 15) — faça isso sempre que mexer em banco, regra de negócio ou tela, em vez de entregar "compila, deve funcionar".

## 0. O que fazer primeiro (antes de qualquer pedido novo)

O Felipe não confirmou o estado do deploy dos zips recentes. Antes de mexer em qualquer coisa, peça pra ele (ou confira no que ele colar):

1. **Migrations aplicadas?** Confirmado por ele: 52 migrations (até `1756700000000`, em 30/09). **10 migrations foram entregues depois e não há confirmação de que rodaram**: `1756800000000`, `1756900000000`, `1757000000000` (mesas/categorias) e as **7 novas de 03–05/10**, `1757100000000` a `1757100000006` (seção 14). Peça a saída de `npm run typeorm -- migration:show` (seção 3). Se estiverem pendentes, o backend novo **quebra** mesas, categorias, cashback, horário de funcionamento, a aba Análise e as Anotações.
2. **Qual `BUILD_VERSION` aparece no rodapé do app e do painel?** O último zip marca `2026-10-06-sessao-z5-02`.
3. **O Pix do Mercado Pago funciona?** Último estado conhecido: a conta REAL dele dava `401 Unauthorized use of live credentials` (seção 8). Era ação dele no painel do Mercado Pago, não código.
4. **Push interno da equipe (Anotações):** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` estão no Render e no `.env` local? (são as **mesmas** do push de clientes). O painel admin **só roda local**: o push chega no **PC dele** (`localhost`), mas para chegar no **celular da equipe** o admin precisa ser publicado em HTTPS — decisão dele (seção 20.7).
5. **Nada do que foi entregue de 03 a 06/10 foi conferido num aparelho ou navegador real do Felipe** — só em Chromium headless e Postgres no sandbox (seção 15). Peça que ele teste e relate.

## 1. O que é o projeto

Cardápio SaaS: plataforma multi-tenant de cardápio digital e pedidos pra restaurantes/bares. Três subprojetos num monorepo:

- **backend/** — NestJS + TypeScript + TypeORM + PostgreSQL (via Supabase).
- **frontend-admin/** — React + Vite + Tailwind. Painel do dono do restaurante. **Nunca publicado** — roda só local (`npm run dev`), decisão intencional. (`package.json` tem `"type": "module"`.)
- **frontend-cardapio/** — React + Vite + Tailwind. App do cliente final. Publicado na Vercel.

**Em produção** desde início de setembro de 2026.

**Testes que ficam no repositório (desde a Z5):** `backend/test/*-audit.ts` (`cd backend && DATABASE_URL=…/cardapio_test npm run test:all` — 141 verificações, **apagam o banco** e recusam rodar se o nome dele não tiver "test") e `docs/testes-e2e/` (Playwright + Chromium; seção 15). O schema REAL e atual do banco (38 tabelas) está em `docs/schema-atual-2026-10-06.sql`; o `docs/schema.sql` antigo é só um esboço conceitual — **a fonte da verdade são as migrations**.

## 2. Quem é o usuário e como ele trabalha

Felipe é "vibe coder": não escreve nem edita código manualmente. Toda entrega é feita por **zip + bloco de comandos de terminal que ele copia e cola**. Preferência salva: quando dá os comandos de terminal, dar **só o bloco de comandos**, sem texto explicativo misturado no meio e sem widgets de passo-a-passo — a explicação vem antes, os comandos vêm depois, puros.

Ele se frustra (com razão, várias vezes) quando uma correção é entregue como resolvida sem ter sido validada de verdade, ou quando o mesmo tipo de bug volta. Quando frustrado, escreve em caixa alta e xinga — isso não muda o rigor técnico nem deve gerar defensividade; só mais cuidado e honestidade sobre incerteza. Quando ele dá uma regra em caixa alta ("DECISÃO FINAL", "NÃO NEGOCIÁVEL"), **trate como regra permanente do projeto** (as vigentes estão na seção 4).

Ele usa a palavra **"seção"** (não "sessão") nos textos que define pra tela — copie o texto exato quando ele ditar.

Ele pede, e aprecia, varredura ativa por bugs relacionados ao que está sendo mexido. E aceita bem quando você **recusa prometer o impossível** e explica o limite com clareza (ex: o limite do QR code, seção 6) — o que ele não aceita é prometer e não entregar.

**Como ele pede (padrão observado nas sessões Z2–Z5):** cola listas numeradas e longas ("Implemente tudo de forma consistente e limpa"), cada item com seu critério; ele mesmo audita a tela e devolve inconsistências lógicas/matemáticas com exemplos concretos ("Sorvete R$ 5,99 plotado em R$ 4,00") e a regra correta escrita; às vezes cola um trecho de código ou um schema gerado por outra IA (Gemini) e **autoriza** analisar e melhorar — o projeto é **TypeORM**, então traduza (nunca introduza Prisma). **"Continue/Continuar"** = retome exatamente de onde parou, sem recomeçar. Ele quer **zip completo + bloco de comandos puro** em toda entrega. Ele escreve em português; entradas de memória do Claude também em português. **Nunca emoji** (ele proibiu explicitamente, inclusive nas notificações push — ícones de traço fino sempre).

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
- **Agendadores (cron) que existem hoje — só rodam com o processo acordado**: sessões de mesa vazias expiradas (1 min); **sincronização do toggle "loja aberta" com o horário** (1 min, seção 21); **avisos de vencimento do cashback** (a cada 30 min, seção 7); **limpeza de alertas internos** com mais de 90 dias (3h da manhã, seção 20). A leitura do horário continua correta sem o cron (a transição pendente vale na hora), mas os avisos de cashback podem atrasar se o Render dormir.

### Bloco padrão pra aplicar um zip (adapte só o nome do zip e a mensagem do commit)

```bash
cd ~/Downloads
unzip -o NOME-DO-ZIP.zip -d NOME-DO-ZIP
rsync -av --exclude '.git' --exclude 'node_modules' --exclude '.env' --exclude 'android' NOME-DO-ZIP/ ~/Projetos/cardapio-saas/
cd ~/Projetos/cardapio-saas/backend
npm install
npm run typeorm -- migration:show
npm run migration:run
cd ~/Projetos/cardapio-saas
git add -A
git commit -m "mensagem do commit"
git push
cd frontend-cardapio
npx vercel --prod --force
cd ~/Projetos/cardapio-saas/frontend-admin
npm install
```
(`npm install` só é necessário quando um `package.json` mudou — na Z3 entrou `xlsx` no `frontend-admin`. Pro painel local depois: `npm run dev`.)

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
- **Toda entidade TypeORM nova precisa ser registrada em DOIS lugares**: `app.module.ts` E `src/config/data-source.ts`. (Nas sessões Z2–Z5 foram criadas 5 entidades — `CashTransaction`, `Note`, `InternalNotification`, `InternalNotificationRead`, `UserPushSubscription` — todas já registradas nos dois lugares.)
- Dados financeiros/de auditoria: soft-delete só, nunca hard delete. Locks pessimistas sempre em ordem determinística.
- **Um zip baixado precisa ser DESCOMPACTADO antes do rsync.**
- **Marcador de build**: `frontend-admin/src/buildInfo.ts` e `frontend-cardapio/src/buildInfo.ts` exportam `BUILD_VERSION` — **bumpar em TODA entrega nova**, nos dois arquivos. Histórico recente: `…-sessao-x-01…05` (30/09), `2026-10-01-sessao-y-01/02`, `2026-10-02-sessao-z-01`, `2026-10-03-sessao-z2-01`, `2026-10-04-sessao-z3-01`, `2026-10-04-sessao-z4-01`, `2026-10-05-sessao-z5-01`, `2026-10-06-sessao-z5-02` (atual).
- Nunca mostrar texto cru de erro do servidor pro cliente final — só 4xx escrito de propósito em português simples; 5xx/falha de rede vira mensagem genérica amigável. (O fechamento de conta agora mostra a mensagem do backend só em 4xx.)
- Endpoints GET que servem dado que muda com frequência levam `Cache-Control: no-store`.
- **CORS** (`main.ts`): `origin: true`, sem `allowedHeaders` (a lib reflete o que o navegador pede — por isso `X-Seat-Token`/`X-Confirm-Join` passam sem configurar nada) e `maxAge: 86400` (sem isso o navegador refaz o OPTIONS antes de cada GET de polling).
- Criptografia de segredos (`encryption.ts`, AES-GCM): a chave é `CREDENTIALS_ENCRYPTION_KEY`. **Chave diferente (ou com espaço/aspas) = `Unsupported state or unable to authenticate data`** — foi a causa de um bug real (seção 8).
- No sandbox, o `frontend-admin` é ESM (`"type":"module"`): pra testar componentes dele com `ts-node`, copie os arquivos pra uma pasta temporária com `package.json {"type":"commonjs"}` e `node_modules` linkado (seção 15).

- **Tipos usados em assinatura de método decorado** (parâmetro de controller, `@Req()`, DTO) precisam de `import type { … }` quando o projeto tem `isolatedModules` + `emitDecoratorMetadata` — senão o `tsc` acusa `TS1272`. (Aconteceu em `cash.controller.ts`.)
- **Dinheiro em centavos inteiros.** Colunas `numeric` do Postgres chegam ao Node como **string** (use o `numericTransformer` nas entidades ou `Number()`); em somas/KPIs converta para centavos (`Math.round(v*100)`), some inteiros e só divida por 100 na saída. Arredonde **por pedido/linha** (no SQL, `ROUND(…, 2)`), nunca só no total — é isso que faz gráfico e card fecharem (seção 19).
- **`select: false`** em coluna que nunca pode vazar (`order_items.unit_cost`): `find()`/`relations` não a trazem; só SQL cru (Análise) a lê. Respostas **públicas** passam por `toPublicTenant` / zeram `costPrice` (seção 22).
- **Scripts de teste vão em `backend/test/`**, que o `tsconfig.build.json` exclui. Se um `.ts` ficar fora de `src/` **e** fora de `test/`, o `nest build` passa a incluí-lo, a pasta raiz da saída muda (`dist/src/main.js` em vez de `dist/main.js`) e o deploy quebra.
- **Colisão de nomes em componentes React**: vários componentes já têm uma variável `location` (a loja); ao usar `useLocation()` do router, nomeie `routerLocation`.
- **Testes destrutivos** (`backend/test/*-audit.ts`) usam `TRUNCATE tenants CASCADE`: sempre com a trava de nome de banco (`helpers.ts`). Nunca aponte para o Supabase de produção.

### Regras permanentes ditadas pelo Felipe (DECISÕES FINAIS — não flexibilizar)
1. **Polling do painel admin fica como o original** (`frontend-admin/src/hooks/usePolling.ts` — NÃO tocar): aba em segundo plano não pode atrasar pedido novo nem deixar o Render dormir. Intervalos atuais: pedidos e mesas ativas 5s, garçom 4s, verificações 10s. (Uma sessão diminuiu o ritmo em segundo plano e ele mandou reverter.)
2. **Sessão encerrada ou saída da mesa é DEFINITIVA**, por qualquer motivo (cliente, admin, "corrigir sessão", pagamento, prazo, "sair da mesa"). Nenhuma forma de reabrir sem escanear o QR de novo — recarregar, voltar, restaurar aba, limpar cache, trocar de conta: nada reabre (seção 6).
3. **Mesa encerrada à força pelo admin ("corrigir sessão") e saída do último cliente de mesa vazia liberam a mesa na hora** pro próximo scan (sem trava). A trava após um fechamento **normal** caiu de 2 minutos para **5 segundos** (pedido do Felipe, 04/10 — com 2 min, quem tinha a sessão expirada por tempo e reescaneava a mesma mesa caía sempre em "sessão encerrada").
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
14. **Item indisponível continua VISÍVEL** no cardápio: só efeito visual (foto cinza, selo "Indisponível", botão desativado "Indisponível" com ícone); o cliente ainda abre o item e lê a descrição; carrinho e servidor recusam o pedido (`OrdersService` só aceita `isAvailable: true`).
15. **"Criar categoria personalizada" está OCULTA, não removida**: flag `SHOW_CUSTOM_CATEGORY_TAB = false` em `CategoryManager.tsx`; toda a lógica (aba, `CustomCreator`, endpoint, service) permanece para reativar no futuro. (Pedido literal: "não remova a lógica do código, apenas oculte".)
16. **Pronomes pessoais** (ela/dela/elas/delas · ele/dele/eles/deles; até 2) aparecem **só em 3 lugares**: abaixo do avatar e acima de "Alterar foto" (Meus dados), na frente do nome na página Conta e na frente do nome do cliente na mesa do admin. **Em nenhum outro lugar.**
17. **Cores padrão** do restaurante novo: principal `#3d3846`, secundária `#c0bfbc` (restaurantes existentes mantêm as suas).
18. **Cashback**: o admin só **edita** a configuração (nunca "nova configuração", nunca exclui; nasce 1 padrão pausada) e ela **não some** depois que expira; mudar a validade vale na hora para todo o app, inclusive o saldo já na carteira do cliente, **sem alterar nenhum saldo** (crédito já vencido continua vencido). Clientes são avisados 1 semana e 2 dias antes do vencimento (clique → área de cashback). (Seção 7.)
19. **Campos de dinheiro** (todo o painel): `CurrencyField` — ao clicar fora, corrige para 2 casas e mostra "R$ 1.000,00".
20. **Horário de funcionamento** no fuso de Brasília; `00:00–00:00` = aberto 24h (sem "fecha em X min"); preset "Aberto 24h"; opção "Aberto nos fins de semana"; o toggle Aberto/Fechado **acompanha o horário** e o admin pode manipulá-lo à mão até a próxima abertura/fechamento (seção 21).
21. **O app do cliente bloqueia** botão direito/toque longo, salvar foto/banner, abrir em nova guia, arrastar e copiar/selecionar texto — **menos dentro de campos de digitação** (senão ninguém digita login/endereço). É dissuasão, não impede captura de tela. Não vale no painel admin.
22. **Banner do restaurante** abre em tela cheia com blur (igual ao logo): `BannerViewer` em `LogoViewer.tsx`; dispensa tocando fora ou no voltar do aparelho.
23. **Sem emoji em lugar nenhum** (telas, textos, notificações push): sempre ícones de traço fino (lucide ou SVG no mesmo traço).
24. **Análise (DRE) — regras finais**: Faturamento Bruto = soma só dos pedidos **válidos**; **cancelado NUNCA entra no bruto** (vive só em "Perdas e desperdício"); Líquido = Bruto − cupons − taxas de pagamento − impostos (**sem** subtrair cancelamentos); Ticket por pedido = Bruto ÷ pedidos válidos; Ticket por cliente = Bruto ÷ clientes únicos atendidos; cards, gráficos, matriz, rankings e exportação saem da **mesma fonte**, em centavos exatos (seção 19).
25. **Notificações internas são 100% isoladas das de cliente** (tabelas, serviço e inscrições push próprios — nada delas vai pro app do cliente) e **as Anotações só somem por exclusão manual** (seção 20).
26. **Custo do produto e parâmetros financeiros NUNCA saem para o cliente** (seção 22).
27. **Rodapé "Como os números são calculados"** (Análise) tem o texto exato: *"Faturamento bruto = soma dos valores dos pedidos concluídos/válidos. Líquido = bruto – cupons – taxas de pagamento – impostos (gorjeta e taxa de entrega não entram)."*


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

### Acréscimos das sessões Z2–Z5 (03–06/10) — mapa por área (lista completa de arquivos no apêndice, seção 24)

**Backend** (`backend/src/`)
- `modules/analytics/` — `analytics.service.ts` (SQL agregado), `analytics.math.ts` (catálogo único, ranking, matriz, projeção — funções puras), `analytics.range.ts` (períodos em BRT), `analytics.types.ts` (contrato; **cópia idêntica** em `frontend-admin/src/types/analytics.ts` — ao mudar um, `cp` pro outro), controller/module.
- `modules/notes/` (entidade `Note`, CRUD + `PATCH /notes/layout`) e `modules/internal-notifications/` (`InternalNotification`, `InternalNotificationRead`, `UserPushSubscription`, serviço com `web-push`); `modules/cash/` (`CashTransaction`, `POST/GET /cash-transactions`, sem tela).
- `modules/cashback/cashback.service.ts` (validade aplicada aos créditos abertos, `getWallet`, cron de avisos); `modules/locations/locations.service.ts` (cron do toggle) + `common/utils/schedule.ts` (horário em BRT); `modules/tables/tables.service.ts` (trava de 5 s; `pronouns`/`orderIds` no roster); `modules/tenants/tenants.controller.ts` (`toPublicTenant`); `modules/products/products.service.ts` (devolve indisponíveis; `costPrice` nunca no público); `modules/orders/` (`cancelReason`, `unitCost` gravado no item).
- `migrations/1757100000000…1757100000006` (seção 14). `test/*-audit.ts` + `test/helpers.ts`.

**frontend-cardapio** (`src/`)
- `lib/protectContent.ts` (+ trecho no `index.css`), `components/LogoViewer.tsx` (`BannerViewer`), `components/ProductCard.tsx` e `pages/ProductDetailPage.tsx` (indisponível), `pages/CustomerCashbackPage.tsx` (tempo restante), `pages/EditProfilePage.tsx` / `CustomerProfilePage.tsx` (pronomes; modal de sair corrigido), `lib/openingHours.ts` (fuso BRT), `hooks/useTableSession.ts` (reescaneio na mesma tela), `pages/PublicReviewsPage.tsx` (voltar), `components/ReceiptContent.tsx` (um avatar), `components/RestaurantInfoPanel.tsx` (telefone), `components/categoryLineIcons.tsx` (kimchi, molheira).

**frontend-admin** (`src/`)
- `pages/AnalyticsPage.tsx` + `components/analytics/*` + `lib/analyticsExport.ts`; `pages/NotesPage.tsx` + `components/notes/*` + `lib/noteFormat.ts`; `pages/NotificationsPage.tsx` + `components/notifications/*` + `contexts/InternalNotificationsContext.tsx` + `lib/internalPush.ts`; `public/sw.js` + `public/icons/`; `components/AdminLayout.tsx` (barra superior com sino, menu em gaveta no celular); `components/MaskedNumberField.tsx` (`CurrencyField`); `components/FlagIcons.tsx`; `components/CategoryManager.tsx`; `pages/LocationsSettingsPage.tsx` (horário), `CashbackSettingsPage.tsx`, `DashboardPage.tsx`, `HistoryPage.tsx`, `SettingsPage.tsx` (parâmetros financeiros), `MenuManagementPage.tsx` (custo do item, aviso de foto); `vercel.json` (pronto, não aplicado).

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

`recentlyEnded` (trava de **5 segundos** após fechamento **normal** — era 2 minutos até 04/10; constante `TablesService.RECENTLY_ENDED_WINDOW_SECONDS`) **não** conta pra encerramento forçado (`force_closed_reason`) nem pra `closed_reason='saida_sem_pedido'`.

**Reescaneio na MESMA tela (corrigido em 04/10):** se a pessoa está na tela "sessão encerrada" de uma mesa e escaneia o QR **dessa mesma mesa** pelo leitor do app, o leitor navega para a mesma URL e o componente não remonta — `checkCurrent` não rodava de novo e a tela final ficava para sempre. Agora `useTableSession` observa `location.key` e, havendo uma intenção de scan nova (`peekQrScanIntent` em `lib/seat.ts`, que só espia sem consumir), refaz a checagem; o servidor decide (trava de 5 s).

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

- **Validade (Z3, 04/10).** Antes a validade era gravada só no momento do crédito, então editar os dias na configuração não alcançava o saldo que o cliente já tinha (e o cashback "não expirava na data do admin"). Hoje `CashbackService.updateSettings` chama `applyExpirationPolicy`, que reaplica a validade nos créditos de pedido **ainda abertos** (restante > 0 e não vencidos) gerados por aquela configuração (`cashback_ledger_entries.settings_id`; a migration `1757100000002` faz o backfill). Garantias: **o saldo (`remaining_amount`) nunca é alterado**; crédito **já vencido continua vencido** (editar não ressuscita saldo — um teste pegou esse bug e foi corrigido); validade = data do crédito + dias, e se isso já caiu no passado a contagem recomeça de hoje (editar nunca "queima" saldo); "nunca expira" (`null`) limpa a validade; ao estender, os avisos de vencimento voltam a poder sair.
- **Carteira do cliente**: `GET /cashback/public/:tenantId/balance` devolve `{balance, nextExpiresAt, expiringAmount, credits[]}` (compatível: `balance` continua). A tela mostra "R$ X vence em 3 dias e 4h" (atualiza a cada 30 s) e, no extrato, o que resta de cada crédito, quando vence e "Expirou — R$ X não usados".
- **Avisos de vencimento** (cron a cada 30 min, `notifyExpiringCredits`): push 1 semana e 2 dias antes, **uma vez por crédito**, agrupado por cliente; crédito que já entra na janela de 2 dias só gera o aviso de 2 dias; clique → `/{slug}/conta-cliente/cashback`. Colunas de controle: `notified_week_at`, `notified_two_days_at`. (Usa o `PushService` dos CLIENTES — correto, é aviso pro cliente.)
- **Configuração só edita**: `findAllSettings` cria 1 padrão **pausada** se não houver nenhuma; `createSettings` recusa se já existe; `deleteSettings` sempre recusa. No admin (`CashbackSettingsPage`) não há "Nova configuração" nem lixeira.
- Testado em Postgres real: `npm run test:cashback` (14 verificações).

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
- **Pronomes (Z2)**: `customers.pronouns` (migration `1757100000000`), lista fechada validada no backend (`PRONOUN_OPTIONS`, até 2, guardados em ordem canônica, ex.: "ela/dela"); só aparecem nos 3 lugares da regra 16; o roster do admin (`active-overview`) devolve `pronouns`.
- **Admin › Mesas (Z2)**: cada pedido aparece **logo abaixo do cliente que o fez** (o backend devolve `orderIds` por cliente em `customers[]`); pedidos sem dono identificado ficam em "Outros pedidos". O bloco "Chamados de garçom pendentes" usa a mesma grade de 2 colunas das mesas (mesma largura).
- **Cupom fiscal (Z3)**: **um único avatar por cliente** em "Mesa compartilhada por" (dedupe por id e por nome) e, na listagem dos pedidos, **só itens + hora e data** (sem foto nem nome do cliente) — no app (`ReceiptContent.tsx`) e no painel.
- **Minha conta (Z2)**: os pedidos dentro do card escuro agora são escuros (fundo `bg-white/[0.06]`, texto claro), consistentes com a mesa.

## 10. Sistema de categorias — REESTRUTURADO (sessão Z, 02/10; substitui a seção 7 antiga)

- **Catálogo**: 102 entradas em `category-catalog.ts` (backend) espelhadas em `frontend-admin/src/lib/categoryCatalog.ts`: **60 universais** (`core`: 27 pratos/refeições, 13 bebidas, 14 doces/sobremesas, 6 saudáveis) + **42 especialidades** (Japonês, Chinês, Coreano, Orientais [Molhos/Extras compartilhada], Pizzaria, Cafeteria/Padaria/Bar). As chaves das 22 categorias antigas foram mantidas (mudou só o nome "Pratos Executivos" → "Pratos do Dia / Executivos" e "Smoothies" → "Smoothies / Detox" pra novas ativações; nomes já gravados por loja não mudam).
- **Tipos de estabelecimento** (`establishmentTypes.tsx`, só no admin): Lanchonete, Pizzaria, Japonês, **Chinês**, **Coreano**, Churrascaria, Cafeteria, Bar/Pub, Restaurante, Saudável/Fitness, Confeitaria, Sorveteria, Padaria, Alta Gastronomia. Cada um é uma lista de chaves. **Escolher o tipo só MARCA** (união com marcações manuais, que prevalecem); o dono marca mais, desmarca, adiciona e remove depois. Cafeteria e Padaria usam a mesma lista (a que o Felipe passou). Chinês e Coreano = exatamente as 13 categorias pedidas.
- **Tela** (`CategoryManager.tsx`, botão "Gerenciar categorias" em `MenuManagementPage`): 3 abas (a de **Criar personalizada está OCULTA** desde 03/10 — regra 15) — **Minhas categorias** (ordem do cardápio, arrastar/setas, renomear personalizadas, remover; desativadas numa seção à parte), **Catálogo e tipos** (tipos no topo, busca, grupos recolhíveis; especialidades recolhidas e que abrem sozinhas com o tipo), **Criar personalizada**. A coluna esquerda de `MenuManagementPage` ficou só pra escolher a categoria ao editar itens.
- **API** (`/categories`, JWT do admin): `PUT catalog/:key` (liga/desliga uma), `POST catalog-bulk {keys[]}` (ativa várias, tudo-ou-nada, só adiciona, entram no fim), `POST custom {name}`, `PUT order {ids[]}` (rota estática antes das de `:id`), `PATCH :id {name}` (só personalizada), `PUT :id/active`, `DELETE :id` (**só personalizada vazia**; com itens → 409 explicando; do catálogo → 400, só desativa).
- Personalizada: `key = null`, nome 2–40 chars (letras/números e `/ & ( ) . , ' -`), sem duplicar nome da loja nem nome do catálogo ("já existe na lista pronta").
- **Ordem**: agora é só `display_order` (o dono reordena). A regra antiga "Lanches → Bebidas → Sobremesas fixos" **saiu do código**; a migration `1757000000000` "assou" a ordem antiga nas lojas existentes pra nada mudar.
- **Ícones**: `components/categoryLineIcons.tsx` (idêntico no admin e no cardápio): lucide + SVGs **desenhados no mesmo traço** (1.6, pontas arredondadas, 24x24) — sushi, rolinho, hossomaki, temaki, hot dog, taco, dumpling, tigelas (macarrão/arroz/bowl), cupcake, porção, caixinha oriental. Mapeamento chave→ícone em `LINE_CATEGORY_ICONS`; `getCategoryIcon(key, name)` devolve ícone genérico de etiqueta pra personalizada (sem chave). "Combinados" mudou pra `Boxes` (o de pizza agora é de "Pizzas"). **Ao adicionar categoria ao catálogo: backend + `categoryCatalog.ts` do admin + `LINE_CATEGORY_ICONS` nos dois apps** (existe um teste de paridade no histórico da sessão Z; refaça se mexer — seção 15).

### Atualizações da Z2 (03/10) — sobrepõem o que está acima onde divergir
- **Catálogo e tipos refletem o cardápio REAL** (`CatalogPicker`): marcada = está (ou vai estar) no cardápio. Escolher um tipo **marca** as categorias dele (e destaca o tipo); **desmarcar uma categoria (ou o tipo) a REMOVE do cardápio** — mas só ao tocar em **"Aplicar ao cardápio"**, com confirmação, e a barra de baixo mostra "+N a adicionar / −N a remover". Os itens das categorias removidas ficam guardados.
- **Minhas categorias**: sem lixeira individual; cada linha tem **checkmark** e há **uma única lixeira no topo** (excluir várias de uma vez). Exclusão em lote: do catálogo → some do cardápio; personalizada com itens → desativada (itens guardados); personalizada vazia → excluída de vez.
- **Bandeiras**: Coreano, Chinês e Japonês usam as **bandeiras oficiais** (pacote `flag-icons`, MIT, `components/FlagIcons.tsx`) nos tipos de estabelecimento e nos cabeçalhos dos grupos; `Kimchi / Banchan` ganhou um **pote de kimchi** e `Molhos / Extras` uma **molheira** (SVGs desenhados no traço do app, idênticos no admin e no cardápio).
- Coluna de categorias do `MenuManagementPage` mais larga e mais à esquerda (nomes longos não cortam) e **aviso do tamanho ideal da foto** de cada item: quadrada 1:1, 1080×1080 px (mínimo 800×800), JPG/PNG/WebP até 5 MB.

## 11. UI/UX entregue nas sessões Y–Z (resumo)
- **Promoções**: cabeçalho igual ao das categorias (ícone `BadgePercent` + "Promoções" + seta); mais respiro antes da busca; "Nenhuma promoção no momento" mantendo a seta; sombra dos cards igual à dos itens (container com `pb-4 -mb-3` pra não cortar).
- **Avaliações**: nota no header do item abre a página completa (`/{slug}/produto/:productId/avaliacoes`); mesmo layout da do restaurante (`ReviewsPageLayout`); a lista solta no item saiu. Resposta do restaurante = nome + logo **quadrado arredondado** (nunca redondo) + texto.
- **Botão do carrinho** ("Ir para pagamento"): texto sumia até o toque — tirei o `translateZ(0)` da barra fixa, rótulo neutro "Carregando..." enquanto a loja não carregou, e `key` nos nós de texto. **Não confirmado em aparelho** — se voltar, pedir modelo/navegador.
- Logo do restaurante clicável em tela cheia com blur (`LogoViewer`, fecha tocando fora ou no voltar do aparelho via `popstate`); botão "Sair da mesa" e "Alterar foto" com o visual dos botões do header; "Sair da conta"/"Sair da mesa" usam `ConfirmModal`; carrinho vazio redesenhado; histórico de pedidos com seta por data (persistida, por conta e loja); nome do restaurante inteiro no admin (quebra de linha, `overflowWrap: anywhere`); bloco de chamados de garçom do admin na paleta preta.
- A nota (`ReviewBadge`) **já está** em `TableMenuHeader` (modo mesa/balcão) no código; o Felipe pediu pra mostrá-la nesse modo — se continuar sumindo no aparelho, investigar `useReviewSummary(tenant.id, location?.id)` no fluxo de mesa (loja/`locationId`).
- Trava de rolagem cobre: avatar/crop, verificação (explicação/câmera/parabéns), avaliação, fechamento, scanner de QR, remover item do carrinho, overlay de envio da verificação, logo, `ConfirmModal`. Pode haver outro modal não coberto — procurar `fixed inset-0`.

### Z2–Z5 (03–06/10)
- **Item indisponível** (regra 14): `ProductCard` (foto cinza, selo, ícone `Ban` no lugar do "+") e `ProductDetailPage` (botão desativado "Indisponível"); `CartContext` recusa; backend `findAllForPublic` devolve todos os itens.
- **"Sair da conta" parou de funcionar — causa**: o `ConfirmModal` estava dentro do ramo "não logado" de `CustomerProfilePage`, então o botão mudava o estado mas o modal nunca renderizava; movido para o retorno principal.
- **Banner em tela cheia** (regra 22): `FullscreenOverlay` compartilhado por logo e banner, com `onClose` guardado em ref (um re-render do pai não pode refazer o efeito, senão recria a entrada de histórico e fecha sozinho).
- Botão de telefone em "Informações" com o estilo de "Chamar garçom" (cor primária); "Sair" do admin idem, centralizado. Histórico do admin com **seta por dia** (persistida no navegador, chave `admin_historico_recolhido`).
- **Voltar das Avaliações**: antes o botão ia fixo pro cardápio geral e o voltar do aparelho pra mesa ("às vezes uma seção, às vezes outra"); agora usa o histórico (`routerLocation.key`) e, sem histórico, vai pra mesa ativa ou cardápio geral.
- Promoções: "NaN descontados" — o PATCH não devolve `totalDiscountGiven`; o painel preserva o total e `money()` nunca mostra "R$ NaN".
- **Painel admin**: barra superior com o **sino** de notificações; **menu lateral vira gaveta no celular** (<768px; botão de menu no topo; fecha ao navegar/Esc/tocar fora). No desktop nada mudou.
- Cores padrão (regra 17); campos de dinheiro `CurrencyField` (regra 19); bloqueios do app (regra 21).

## 12. Ícones de marca
`BrandIcons.tsx` (Gmail, TikTok, Facebook, Instagram, YouTube) e `MenuIcons.tsx` (Todos/Lanches/Bebidas, Info, carrinho): todos os `d=` de SVG vieram colados pelo Felipe — **nunca desenhar à mão** (ele proibiu depois de 3 tentativas ruins). Degradê do YouTube: vermelho `#FF1A47` sólido até 60%, depois magenta `#FF1DCF`. **Exceção explícita (02/10)**: os ícones de **categorias novas** ele pediu pra **eu desenhar** no traço fino do app (`categoryLineIcons.tsx`) — isso não reabre a regra pros ícones de marca.
- **Z2–Z5**: as **bandeiras** (JP/CN/KR) vêm do pacote `flag-icons` — não foram desenhadas à mão; o pote de kimchi e a molheira foram desenhados por mim dentro da exceção das categorias (traço 1.6, 24x24); os ícones PNG das notificações (`frontend-admin/public/icons/icon-192.png` e `badge-72.png`) foram gerados a partir do glifo `sticky-note` do lucide (traço fino). **Nunca emoji** (regra 23).

## 13. Sistemas entregues (resumo)
Cardápio, carrinho, pedido, cashback, cupom fiscal com código verificável (considera cashback usado); painel admin em tempo real (polling), status com um toque, borda azul piscante em pedido novo; Mesa vs Balcão, QR com correção de erro reforçada; múltiplas lojas por tenant (WhatsApp/Telegram/telefone por LOJA; redes sociais por MARCA); horário de funcionamento por dia; avaliações, cashback/loyalty, histórico com expiração de 7 dias, verificação de conta (selo azul `#1D9BF0`); push consolidadas por cliente; Mercado Pago real pra Pix (avulso e mesa) com idempotência, cancelamento de cobrança órfã e HMAC do webhook; **assentos de mesa, saída definitiva, isolamento entre contas, confirmação de entrada, pessoas por pedido, nome de visitante, categorias reestruturadas** (X–Z).

**Z2–Z5 (03–06/10)**: item indisponível visível; pronomes pessoais; validade e avisos de cashback; horário de funcionamento em BRT com toggle automático; bloqueios de ação indesejada no app do cliente; **aba Análise** (DRE, CMV, matriz do cardápio, projeção, exportação CSV/XLSX/DRE); **aba Anotações** (mural persistido) + **notificações internas da equipe** + **Web Push da equipe**; parâmetros financeiros e custo por produto; campos de dinheiro; menu em gaveta no celular; testes de auditoria permanentes.

## 14. Migrations (ordem e status)
Até `1756700000000`: aplicadas (confirmado pelo Felipe, 52 no total). **Pendentes de confirmação** (entregues, não verificadas):

| Migration | O que faz | Se não rodar |
|---|---|---|
| `1756800000000-TableSeatsAndExit` | `table_session_participants.customer_id` opcional + `seat_token` único (backfill 256 bits); `orders.table_participant_id` (FK `ON DELETE SET NULL`); `table_sessions.closed_reason` | endpoints de mesa quebram |
| `1756900000000-WaiterCallCaller` | `waiter_calls.table_participant_id`, `called_by_name` | chamar garçom quebra |
| `1757000000000-CategoryOrderNormalize` | normaliza `display_order` por loja (Lanches/Bebidas/Sobremesas primeiro, resto como estava) | a ordem das categorias muda sozinha de lojas existentes |

Todas foram testadas em Postgres 16 real (up, down quando há, e com dados antigos). A `1757000000000` não tem `down` (irreversível por desenho).

### Migrations de 03–05/10 (sessões Z2–Z5) — 7 novas, todas **pendentes de confirmação**

| Migration | O que faz | Se não rodar |
|---|---|---|
| `1757100000000-CustomerPronouns` | `customers.pronouns varchar(20)` | perfil/Meus dados quebram |
| `1757100000001-DefaultBrandColors` | muda só o DEFAULT de `tenants.primary_color/secondary_color` (`#3d3846`/`#c0bfbc`) | restaurante novo nasce com a cor antiga |
| `1757100000002-CashbackExpiryControl` | `cashback_ledger_entries.settings_id`, `notified_week_at`, `notified_two_days_at`, índice parcial por validade; backfill de `settings_id` | cashback (validade/avisos/carteira) quebra |
| `1757100000003-LocationScheduleState` | `locations.schedule_open_state boolean` | cron do horário e o cardápio do cliente quebram |
| `1757100000004-AnalyticsSchema` | `products.cost_price`, `order_items.unit_cost`, `tenants.default_cmv_percent` (30), `orders.cancel_reason/canceled_at/canceled_by_user_id` (backfill de `canceled_at`), tabela `cash_transactions`, índice `(tenant_id, created_at)` em `orders` | Análise, custo do produto e cancelamento quebram |
| `1757100000005-AnalyticsFinancialParams` | `tenants.card_fee_percent`, `pix_fee_percent`, `tax_percent` (padrão 0) | Análise/Configurações quebram |
| `1757100000006-NotesAndInternalNotifications` | tabelas `notes`, `internal_notifications`, `internal_notification_reads`, `user_push_subscriptions` + `tenants.internal_notification_target` (padrão `'all'`) | Anotações e notificações internas quebram |

Todas têm `down`. As **62 migrations** (55 anteriores + 7) rodam do zero num Postgres 16 sem erro (conferido na Z5).

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

### Z2–Z5: o que mudou na forma de testar (use sempre)
- **Há um Chromium headless de verdade (Playwright em Python) no sandbox**: `from playwright.sync_api import sync_playwright`. Sobe-se o backend (`npx ts-node --transpile-only src/main.ts`) e o painel (`npx vite --port 5174`), loga, clica, arrasta e mede pixels. Scripts prontos + README em `docs/testes-e2e/` (`bash docs/testes-e2e/run.sh docs/testes-e2e/test_notes.py`). Foi o que achou bugs que `tsc` e testes unitários não achavam: checklist apagando o próprio `- [ ]` (seleção após inserir o prefixo), botão "Salvar" cortado, menu lateral ocupando o celular, rótulo negativo cortado no eixo Y.
- **Suíte de backend com Postgres real**: `cd backend && DATABASE_URL=postgres://postgres:pg@localhost:5432/cardapio_test npm run test:all` = `test:schedule` (10) + `test:cashback` (14) + `test:notes` (32) + `test:push` (6) + `test:analytics` (79) = **141 verificações**. Apagam o banco e exigem "test" no nome. Teste novo de regra de negócio deve seguir o molde (`backend/test/helpers.ts`: `assertTestDatabase`, `createChecker`). *(As instruções antigas acima usam senha `postgres`; os scripts novos usam `pg` — qualquer senha serve, é só o `DATABASE_URL`.)*
- **Teste de invariantes (o jeito certo de provar números)**: semear dados à mão **e** 400 pedidos aleatórios e comparar cada visão contra um cálculo **independente** (SQL direto, `Fraction` do Python, classificação por força bruta) em **centavos inteiros** — ver `backend/test/analytics-audit.ts`.
- **Push real sem FCM**: `test:push` sobe um servidor HTTPS local com certificado descartável (openssl), assina um "aparelho" com par de chaves P-256, envia pelo código de produção (sem mock) e **descriptografa** o payload. Prova VAPID, criptografia, TTL e prioridade. O que o sandbox **não** prova: o Chromium headless nunca concede permissão de notificação nem alcança o FCM — o aceite real num navegador do Felipe continua sendo teste dele.
- **Teste HTTP de vazamento** (`docs/testes-e2e/test_api_leaks.py`, 19 verificações): cria produto com custo pelo admin, faz um pedido real pela rota pública, confere `order_items.unit_cost` no banco e que custo/parâmetros financeiros não saem em nenhuma resposta pública; rotas internas exigem login.
- **Armadilhas do sandbox (já custaram tempo)**: processos em segundo plano **morrem entre chamadas** de ferramenta — suba backend + painel + teste na MESMA chamada (o `run.sh` faz isso); o Postgres também cai (`service postgresql start`); no `psql` via `su postgres -c "..."`, um hash bcrypt (`$2b$10$…`) é mutilado pelo shell — passe SQL por stdin; `import * as webpush from 'web-push'` é somente-leitura (para mockar, `const webpush = require('web-push')`); semeie por **meio-dia de cada dia**, nunca "N horas atrás" (o resultado dependeria da hora em que o teste roda); fontes do Google dão 403 no sandbox (ruído, não é erro do app).

## 16. Pendências e limitações conhecidas (em ordem de prioridade)

1. **Pix órfão** com item novo durante cobrança pendente (seção 8) — maior risco financeiro aberto.
2. **Mercado Pago em produção**: ativar credenciais de produção da conta real (ação do Felipe) — sem isso o Pix real não funciona.
3. **Confirmar as 10 migrations pendentes** (`1756800000000`, `1756900000000`, `1757000000000` e `1757100000000…06` — seções 0 e 14).
4. **Nada da interface foi conferido em celular de verdade** nas sessões X–Z5 (só `tsc`, build, Chromium headless e simulações). Em especial: botão do carrinho, trava de rolagem em modais, aviso fixo do garçom, logo/banner em tela cheia com botão voltar, "Minha conta" preta, ícones de categoria desenhados, arrastar categorias, **mural de Anotações no celular, gaveta do menu, bloqueios de cópia/botão direito, modal "Sair da conta"**.
5. **Web Push da equipe nunca foi assinado por um navegador real** (o Chromium headless não concede a permissão nem alcança o FCM). O servidor está provado (envio real criptografado, `npm run test:push`); falta o aceite da permissão + o toque na notificação num navegador de verdade. **E o painel admin não é publicado** → no **celular** da equipe só funciona se o Felipe decidir hospedar o admin em HTTPS (`frontend-admin/vercel.json` pronto; é decisão de segurança dele — expõe a tela de login). No iPhone/iPad exige o painel instalado na Tela de Início.
6. **Não existe tela de cadastro de funcionários/gerentes** (só o dono, criado no registro). O filtro por perfil (`owner|manager|staff`) está pronto e testado, mas não há como criar `manager`/`staff` pela interface.
7. **Sangria de caixa**: tabela e `POST/GET /cash-transactions` existem, **sem tela de lançamento** — a Análise mostra "Sem dados" até haver lançamentos. **Estorno por prato**: sem registro algum no schema ("Sem dados").
8. **Decisões da Análise para o Felipe confirmar** (seção 19.9): "pedido válido" inclui os em preparo; M̄ ponderada pelo volume; piso do lucro projetado em 0 mesmo com receita > 0.
9. **Crons só rodam com o Render acordado** (seção 3): avisos de vencimento do cashback (30 min), sincronização do toggle de horário (1 min), limpeza de alertas (3h). Mitigação futura: pinger externo (UptimeRobot) — não implementado.
10. **Painel admin "instantâneo"** é polling (≤ ~5 s; sino a cada 30 s; mural a cada 20 s). Tempo real de verdade exigiria WebSocket/SSE, inviável no Render grátis.
11. **Anotações**: edição concorrente é "última escrita vence" (sem controle de versão); a lista/contador de alertas olham só os últimos 30 dias.
12. **Bloqueios do app do cliente** (botão direito, copiar, salvar imagem) são **dissuasão** — não impedem captura de tela nem DevTools; só valem no app do cliente.
13. **Convidado que limpa os dados do site perde o assento** (o servidor aguenta, mas ele precisa escanear de novo). Aceito.
14. `ReviewDisplay` mantém a prop legada `restaurantName` (não usada). Limpeza opcional.
15. Pendências antigas (nenhuma tocada; reproduzir antes de mexer): i18n entre tenants, login com Google no backend, área de Reclamações, exportação de recibo em PNG no mobile, clique de push não navegando em alguns testes mobile, auditoria geral de CSS mobile, lightbox de foto do restaurante, separação visual "pedido em casa vs no estabelecimento", "Agendar retirada", dois bugs antigos de promoção (localização afetando todas as promoções; promoção sumindo depois de salvar com validade futura).

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
11. **Números da Análise "não fecham"**: rode `npm run test:analytics` (banco de teste). Lembre: cancelado **nunca** entra no bruto; `analytics.types.ts` do backend e `frontend-admin/src/types/analytics.ts` têm que ser idênticos; custo estimado = `ROUND(preço × % / 100, 2)` por unidade (centavos exatos).
12. **Push interno não chega**, nesta ordem: VAPID configurada no backend (`VAPID_PUBLIC_KEY/PRIVATE_KEY`); admin aberto em `localhost`/HTTPS (celular exige HTTPS); permissão do navegador; `/sw.js` registrado (DevTools → Application); aparelho assinado (linha em `user_push_subscriptions`); preferência de quem recebe (`tenants.internal_notification_target`) e o perfil do usuário; **quem fez a ação não recebe o próprio alerta**; iPhone exige o painel instalado.
13. **Toggle "loja aberta" voltou sozinho**: é o horário (seção 21) — a transição pendente vence; o admin manda até a próxima abertura/fechamento. Sem a migration `1757100000003` o cron/cardápio quebram.
14. **Mural não atualiza**: polling de 20 s só com a aba visível e sem edição/arraste; recarregue para forçar.
15. **Cashback "não expirou"**: a migration `1757100000002` rodou? Créditos antigos sem `settings_id` são alcançados pelo backfill; salvar a configuração de novo reaplica a validade nos créditos abertos.
16. **Item indisponível sumiu do cardápio**: agora o backend os devolve (acinzentados); se sumiu, o deploy do backend não foi.
17. **Dado de custo/financeiro apareceu para o cliente**: é vazamento — rode `docs/testes-e2e/test_api_leaks.py` (seção 22).

## 18. Zips entregues nas sessões X–Z (histórico)
`CORRECAO-PIX-2026-09-30-0800` → `CORRECAO-PIX-QR-2026-09-30-0821` → `SESSAO-FECHADA-2026-09-30-0829` → `CASHBACK-2026-09-30-0854` → `SAIDA-MESA-ASSENTOS-2026-10-01-0025` → `UI-AVALIACOES-2026-10-01-0526` → `ISOLAMENTO-CONTAS-2026-10-02-0408` → `CATEGORIAS-UI-2026-10-03-0014` (todos acumulativos; o último contém tudo).

**Sessões Z2–Z5 (03–06/10):** `cardapio-saas-COMPLETO-2026-10-03-1735` (Z2: 17 ajustes) → `…-2026-10-04-0948` (Z3: 10 correções + Análise v1) → `…-2026-10-05-0153` (Z4: Anotações + notificações internas + push) → `…-2026-10-06-0426` (Z5: auditoria matemática da Análise) → `cardapio-saas-COMPLETO-2026-10-07-0542` (**este**: handoff consolidado, suíte de testes permanente, schema real, correção de vazamento). O zip **completo** que acompanha este documento é a base mais segura pra recomeçar.


---

# SEÇÕES NOVAS (sessões Z2–Z5, 03–06/10/2026)

## 19. Aba Análise (`/analise`) — arquitetura, regras e fórmulas FINAIS

Pedido do Felipe (03–05/10): inteligência financeira e operacional do restaurante com **precisão absoluta**. Em 05/10 ele auditou a tela e exigiu 100% de coerência entre cards, gráficos e matrizes (regra 24). Tudo abaixo é o estado final (Z5).

### 19.1 Endpoint e períodos
`GET /analytics?period=hora|dia|semana|mes|ano|5anos|custom&from=AAAA-MM-DD&to=AAAA-MM-DD&locationId=` — `JwtAuthGuard`, **sempre** no tenant do token (nunca aceita `tenantId` pela query).
- `hora` = hoje hora a hora (00:00 BRT → agora) · `dia` = últimas 24 h · `semana` = últimos 7 dias (hoje incluído) · `mes` = 30 dias · `ano` = 12 meses (mês atual incluído) · `5anos` = 60 meses · `custom` = AAAA-MM-DD (fim inclusivo, nunca no futuro, máx. 10 anos).
- Granularidade do gráfico: hora (hora/dia; custom ≤ 2 dias), dia (semana/mês; custom ≤ 93 dias), mês (ano/5 anos; custom maior). Agrupamento em `America/Sao_Paulo` direto no SQL (`AT TIME ZONE`).
- Frontend (`AnalyticsPage`): reativo (trocar período/loja refaz; a tela anterior fica esmaecida em vez de piscar vazia), atualiza a cada 60 s (menos no custom), botão de atualizar, filtro de loja quando há mais de uma.

### 19.2 Pedido válido e fonte única
- **Pedido válido** = `status NOT IN ('cancelado','aguardando_pagamento')` (inclui pedidos ainda em preparo — ver 19.9). **Abandonado** = cancelado com `payment_status='falhou'` (Pix expirado/recusado): nunca virou venda, **não é bruto nem perda**.
- Pedidos *soft-deleted* pelo histórico (`deleted_at`) **continuam contando** (o dado financeiro fica no banco; senão mês/ano/5 anos ficariam errados).
- Uma CTE (`BASE_CTE`) calcula **por pedido**: `items_total` (Σ `order_items.subtotal`), `cogs`, `real_sales`, `fee`, `tax`, `is_valid`, `is_abandoned`. Todos os KPIs, a série, o heatmap, os canais e o CRM saem dela.

### 19.3 Fórmulas (tudo em centavos inteiros; arredondamento POR PEDIDO/LINHA)
- **Faturamento bruto** = Σ `items_total` dos pedidos **válidos**. **Cancelado NUNCA entra.** (Gorjeta e taxa de entrega não entram.)
- **Cupons** = Σ `discount_amount` dos válidos.
- **Taxa de pagamento** por pedido = `ROUND(MAX(items_total − cupom − cashback_usado, 0) × taxa% / 100, 2)`, com taxa de cartão ou Pix conforme o método (`COALESCE(NULLIF(o.payment_method,'indefinido'), table_session.payment_method)`); dinheiro/sem método = 0.
- **Imposto** por pedido = `ROUND(MAX(items_total − cupom, 0) × imposto% / 100, 2)`.
- **Faturamento líquido** = Bruto − Cupons − Taxas − Impostos. **Sem subtrair cancelamentos.** (Cashback usado é forma de pagamento: não é deduzido.)
- **CMV** = Σ por linha de `quantidade × COALESCE(order_items.unit_cost, products.cost_price, ROUND(unit_price × cmv%/100, 2))` — custo **real** (snapshot gravado no pedido; senão o custo atual do produto) ou **estimado** (% padrão do restaurante, 30). O custo estimado é arredondado **por unidade em centavos**.
- **Lucro bruto** = Líquido − CMV. **Margem bruta %** = Lucro ÷ Líquido. **CMV %** = CMV ÷ Líquido (margem % + CMV % = 100). **Cobertura de custo real** = vendas com custo real ÷ bruto.
- **Ticket médio por pedido** = **Bruto ÷ pedidos válidos**. **Ticket médio por cliente** = **Bruto ÷ clientes únicos atendidos** (mesma base do card de CRM).

### 19.4 Perdas e desperdício
Pedidos cancelados (exceto abandonados): quantidade e **valor** (Σ itens), com **motivos** (`orders.cancel_reason`; "Sem motivo registrado" quando vazio; a soma dos motivos = valor das perdas). Cancelamentos **só vivem aqui**. Pratos estornados: sem registro no schema → "Sem dados". O admin é perguntado do motivo ao cancelar (opcional); os automáticos (Pix expirado, cliente cancelou, Mercado Pago recusou) já gravam o motivo (`markCancelled(order, reason, userId)`).

### 19.5 Conciliação e caixa
- **Troco fornecido** = avulso em dinheiro (`amount_received − (total + gorjeta)`, ≥ 0) + `table_sessions.change_given`. **Sangrias/suprimentos**: `cash_transactions` (tipos `sangria|suprimento|abertura|fechamento`); sem nenhum lançamento → "Sem dados" (não 0).
- **Cashback**: emitido (Σ `original_amount` do período), resgatado (consumos não revertidos), vencido sem uso, taxa de resgate.

### 19.6 CRM
Clientes atendidos = identificados (com conta) + visitantes (distintos por `table_participant_id`, senão por pedido); novos = primeiro pedido válido da vida dentro do período; recorrentes = identificados − novos; retenção; LTV médio; **% verificados** conferindo a **assinatura de integridade** (`verifyIntegritySync`), não só a coluna `is_verified`.

### 19.7 Série temporal e projeção
Por bucket: receita = líquido, lucro = líquido − CMV. **Σ dos pontos reais = card líquido e = card lucro, em centavos** (testado). Projeção: regressão linear (mínimos quadrados) sobre o histórico (descarta o último bucket, ainda incompleto, quando há ≥ 4 pontos); horizonte 6 h / 7 dias / 3 meses; sem nenhuma venda não há projeção. **Trava de cada ponto projetado** (`lockProjectedPoint`): receita ≥ 0; **receita 0 ⇒ lucro 0**; lucro ≥ 0 e ≤ receita — só na projeção, o histórico real nunca é alterado. Texto "Projeção: R$ X" = soma exata dos pontos desenhados. **Tooltip**: lucro (real ou projetado) **< 0 em `text-red-500`**, ≥ 0 em verde (`text-emerald-600`).

### 19.8 Engenharia de cardápio (UMA lista alimenta tudo)
`buildCatalog` monta **uma linha por produto** (vendas do período + todo produto ativo do catálogo, mesmo sem vendas + produto excluído que vendeu no período, para a soma dos itens fechar com o bruto). Dela saem Top 10, Menos vendidos, matriz, pontos do gráfico e cards dos quadrantes.
- **Margem unitária** = (receita − custo) ÷ unidades, arredondada **uma vez só**; preço unitário = receita ÷ unidades; custo unitário derivado (preço − margem). Item sem venda mostra preço de tabela e custo real (ou estimado).
- **Top 10**: unidades desc (desempate: receita, nome). **Menos vendidos**: unidades **crescente** (zero venda primeiro), só itens do catálogo **fora do Top 10** (um campeão nunca aparece; catálogo ≤ 10 itens ⇒ lista vazia, com mensagem). **Barras**: cada lista usa a escala do **seu próprio maior valor**.
- **Matriz 2×2** sobre itens com venda: **V̄ = unidades vendidas ÷ itens com venda**; **M̄ = Σ(margem unitária × unidades) ÷ Σ unidades** (margem média da loja). **Estrela** = vol ≥ V̄ **e** margem ≥ M̄ · **Burro de carga** = vol ≥ V̄ **e** margem < M̄ ("Alto volume e baixa margem — reajuste o preço ou reduza o custo.") · **Puzzle** = vol < V̄ e margem ≥ M̄ · **Cão** = vol < V̄ e margem < M̄. Comparações em **aritmética inteira** (unidades e centavos, multiplicação cruzada): sem erro de ponto flutuante.
- **Gráfico**: cada bolinha é um `<circle>` com `data-name/units/margin/class` (auditável no DOM), domínios dos eixos explícitos com escala fina, eixo Y com largura que não corta "−R$ 25,00". x = unidades, y = margem unitária do próprio item (testado pixel a pixel).

### 19.9 DECISÕES para o Felipe confirmar (tomadas por mim, sinalizadas a ele)
1. "Pedido válido" inclui os ainda **em preparo/pendentes**. Se ele quiser só "entregue", é uma linha no SQL (`is_valid`).
2. **M̄ é ponderada pelo volume** (margem média da loja). Alternativa: média simples das margens dos itens.
3. "Menos vendidos" **exclui o Top 10** (catálogo pequeno ⇒ lista vazia).
4. **Piso do lucro projetado em 0 também com receita > 0** (o trecho de código dele): isso **esconde na projeção** uma tendência real de prejuízo; o histórico real continua mostrando prejuízo (e o tooltip vermelho). Se preferir só a trava de receita zero, é um ajuste pequeno em `lockProjectedPoint`.

### 19.10 Frontend, exportação e parâmetros
- Arquivos: `pages/AnalyticsPage.tsx`, `components/analytics/{PeriodSelector,KpiCards,RevenueChart,MenuEngineering,SalesHeatmap,ChannelDonut,ExportMenu}.tsx`, `format.ts`, `lib/analyticsExport.ts`, `types/analytics.ts` (**cópia** do backend). Gráficos com `recharts`. Card "Faturamento líquido" mostra `– cupons · – taxas · – impostos` (nunca "cancel."). Rodapé "Como os números são calculados" com o texto exato da regra 27.
- **Exportação**: XLSX (várias abas, **células numéricas reais** com formato R$/%, via `xlsx`), CSV (UTF-8 com BOM, `;`, vírgula decimal — padrão pt-BR) e **DRE simplificado** (XLSX/CSV; sem linha de cancelamento). "Sem dados" vai como texto, nunca 0; texto que começa com `= + - @` é neutralizado contra injeção de fórmula.
- **Parâmetros** (Configurações → "Parâmetros financeiros (Análise)"): CMV estimado %, imposto %, taxa de cartão %, taxa de Pix %. **Custo do item** (opcional) no cadastro/edição de produto (`CurrencyField`).

### 19.11 Testes
`backend/test/analytics-audit.ts` (79 verificações: números à mão + 400 pedidos aleatórios, Σ gráfico = card em centavos, SQL independente, classificação por frações exatas, rankings, trava da projeção) e `docs/testes-e2e/test_analytics.py` (44 no Chromium: cards, posição das bolinhas, quadrantes, rankings, tooltip, rodapé, DRE).

### 19.12 O que estava errado antes da Z5 (para não repetir)
Bruto incluía cancelados e o líquido os subtraía; ticket por pedido usava (bruto − cupons)÷pedidos e por cliente usava o líquido; COGS estimado tinha fração de centavo (somas divergiam); "Menos vendidos" vinha de uma consulta separada da matriz (duas fontes de verdade) e repetia campeões; limiar de volume usava 0,7×média; lucro projetado sem limite; rótulo negativo do eixo Y cortado.

## 20. Anotações + notificações internas + Web Push da equipe

Pedido do Felipe (04/10): mural digital estilo post-it/Trello para a equipe (recados, avisos, checklists que **nunca se apagam** ao fechar o painel — só por exclusão manual) + módulo de **notificações internas exclusivo da equipe/admin** (**nunca** vai pro app do cliente) + **Web Push** nos celulares/navegadores da equipe. Regras 23 (sem emoji) e 25.

### 20.1 Backend — anotações (`modules/notes/`)
- `Note` (`notes`): `content` (markdown simples ≤ 5000), `color`/`textColor` (`#RRGGBB`), `width`/`height` (160–1200 / 48–1200), `posX`/`posY` (0–20000), `isPinned`, `isMinimized`, `authorUserId`, `authorName`, `lastEditedByName`, `tag`, `contentUpdatedAt` (muda **só** em edição de conteúdo; o `updatedAt` muda até ao arrastar), `createdAt`, `updatedAt`. **Tags** em `NOTE_TAGS` (`note.entity.ts`): `Geral`, `Cozinha`, `Caixa`, `Urgente` — para criar outra, basta incluí-la ali (o backend valida por essa lista; o painel lê de `GET /notes/meta`).
- Rotas (`JwtAuthGuard`, sempre no tenant do token): `GET /notes` (fixadas primeiro), `GET /notes/meta`, `POST /notes`, `PATCH /notes/layout` (em lote; declarada **antes** de `:id`; ignora ids de outro restaurante), `PATCH /notes/:id`, `DELETE /notes/:id` (204).
- **Quando notifica**: criar; **editar CONTEÚDO** (texto, cores ou tag); excluir. **Arrastar, redimensionar, fixar e minimizar NÃO notificam** e não contam como "editada por". A autoria da última edição (`lastEditedByName`) só muda em edição de conteúdo.

### 20.2 Backend — notificações internas (`modules/internal-notifications/`)
- Entidades: `InternalNotification` (`tenantId`, `noteId` sem FK — o alerta de "excluída" sobrevive à nota —, `type` `note_created|note_updated|note_deleted`, `title`, `message`, `tag`, `authorUserId/Name/Role`, `targetRole`), `InternalNotificationRead` (**"lido" é POR USUÁRIO**; o `isRead` que a API devolve é calculado para quem pediu) e `UserPushSubscription` (`endpoint` único, `p256dh`, `auth`, `userId`, `role`).
- **Perfis**: `owner` (rótulo "Admin"), `manager` ("Gerente"), `staff` ("Funcionário"). Mensagem: `Por: Carlos (Gerente)`. **Quem recebe** = preferência do restaurante `tenants.internal_notification_target`: `owner` (só o dono) · `owner_manager` · `all` (padrão); só o **dono** altera (`PATCH /internal-notifications/preferences`, demais recebem 403). Visibilidade: dono vê tudo; gerente vê `owner_manager`+`all`; funcionário só `all`.
- Regras: **quem fez a ação não recebe o próprio alerta** (nem push nem contador; ele aparece no histórico já lido); **edições seguidas da mesma pessoa na mesma nota em ≤ 5 min viram um alerta só** (atualiza o horário, não manda novo push); lista e contador olham os **últimos 30 dias**; cron diário (3h) apaga alertas > 90 dias; marcar como lido um alerta que o perfil não enxerga → 404.
- **Rotas**: `GET /internal-notifications?limit&unread`, `GET …/unread-count`, `PATCH …/read-all`, `PATCH …/:id/read`, `GET/PATCH …/preferences`, `POST/DELETE …/push/subscribe`, `POST …/push/status` (este aparelho está inscrito?), `POST …/push/test` (manda um push só pros aparelhos de quem pediu). Estáticas antes de `:id`.

### 20.3 Web Push (servidor)
Biblioteca `web-push` com VAPID passada **em cada chamada** (`vapidDetails`), sem estado global; envio **assíncrono** (nunca atrasa nem derruba a requisição da anotação; erro só vira log). Payload JSON: `title` ("Nova Anotação (#Cozinha)", "Anotação Editada (#Urgente)", "Anotação Excluída (#Caixa)" — **sem emoji**), `body` ("Carlos (Gerente) adicionou um novo recado"), `icon` (logo do restaurante, senão `/icons/icon-192.png`), `badge`, `url` (`/anotacoes?nota=<id>`), `tag` (`anotacao-<id>` — substitui a anterior da mesma nota), `urgent`, `kind`. Tag **#Urgente** ⇒ `urgency: high` e o SW usa `requireInteraction`. TTL 24 h. Inscrição que devolve 404/410 é apagada. Sem VAPID configurada o push é desativado e o sino/histórico seguem funcionando (aviso no log).

### 20.4 Frontend — mural (`pages/NotesPage.tsx`, `components/notes/*`)
- **Duas visualizações**: **Mural** (quadro livre com `NotesBoard`) e **Cards** (`NotesGrid`); **abaixo de 768 px vira Cards automaticamente** (e o seletor some). Escolha salva em `localStorage` (`notes_view`). Botão destacado **"Nova Anotação"** (cor primária do restaurante), **Organizar** (alinha tudo numa grade, estilo ícones da área de trabalho; fixadas primeiro) e filtro por tag.
- **Arrastar/redimensionar**: eventos de ponteiro com listeners na `window`; o movimento é local (fluido) e só vai ao servidor ao **soltar** (`PATCH /notes/layout`); mínimo 180×140; nota minimizada = só o cabeçalho (44 px). Z-index: arrastando 40 > editando 35 > fixada 20 > demais.
- **Post-it** (`NoteCard`): cabeçalho com alça, progresso de tarefas (`1/2`), paleta (painel **flutuante** com 12 cores de fundo — pastel/claros/escuros — e 8 de fonte; cada fundo traz o texto que combina), fixar, editar, minimizar, excluir (confirmação); rodapé com autor + data/hora, "Editada por … · data" e a **#tag**. Nova anotação nasce como **rascunho** local e só vai ao banco (e só notifica) ao **Salvar**. Atalhos: Ctrl+Enter salva, Esc cancela, Ctrl+B/I/U; Enter continua listas/checklists.
- **Texto** (`lib/noteFormat.ts`): markdown simples — `**negrito**`, `_itálico_`, `__sublinhado__`, `- item`, `- [ ] tarefa`, `- [x] feita` — **renderizado sem HTML** (blocos → elementos React; nada digitado vira código). Marcar tarefa direto no card é uma edição de conteúdo (notifica; o servidor agrupa).
- **Sincronização**: polling a cada 20 s (só com a aba visível e sem edição/arraste), sem atropelar a nota que o usuário está mexendo. **Deep link** `?nota=ID` (vindo da notificação): rola até a nota e a destaca 4 s; se já foi excluída, avisa.

### 20.5 Frontend — notificações (`contexts/InternalNotificationsContext.tsx`, `components/notifications/*`, `pages/NotificationsPage.tsx`)
Contexto compartilhado: contador a cada 30 s (+ ao focar a aba + quando o service worker avisa `internal-push`). **Sino** com badge numérico (99+) no topo do painel; painel com os 8 mais recentes, "marcar todas" e atalho pras preferências; item abre a nota (`/anotacoes?nota=…`). Página `/notificacoes` com abas **Histórico** (Todas/Não lidas, pill **Lido/Não lido**, marcar individual/todas) e **Preferências** (`?aba=preferencias`): toggle "Notificações neste aparelho", botão de teste, rádios "Apenas o Admin (CEO) / Admin e Gerentes / Todos os funcionários" (desabilitados para quem não é dono), aviso de iPhone e de permissão bloqueada.

### 20.6 Push no navegador (`lib/internalPush.ts`, `public/sw.js`)
`enableDevicePush()` pede a permissão (`Notification.requestPermission()`), busca a chave em `GET /push/vapid-public-key`, registra `/sw.js`, assina (`pushManager.subscribe`) e envia a inscrição ao servidor. `disableDevicePush({keepPreference})` remove. **Logout** para o push do aparelho no servidor mas guarda a preferência (`localStorage.internal_push_enabled`): ao entrar de novo, religa **em silêncio** (sem nova permissão). O **`sw.js` do admin é separado do SW do cardápio** (outro app/origem): trata `push` (avisa as abas abertas e mostra a notificação) e `notificationclick` (foca a aba e pede `navigate` por `postMessage` — o painel é SPA — ou abre uma janela); **sem cache** de assets.

### 20.7 Deploy — leia
O painel admin **só roda local** (decisão antiga do Felipe). Web Push exige contexto seguro: no PC funciona em `http://localhost`; para o **celular da equipe** o admin precisaria estar em **HTTPS publicado**. `frontend-admin/vercel.json` está pronto (fallback de SPA + `sw.js` sem cache, rewrite que não captura `/sw.js` nem `/icons/`), **não aplicado**. Publicar é decisão de segurança dele (expõe a tela de login do painel).

### 20.8 Limites conhecidos
Não há tela para cadastrar funcionários/gerentes (só o dono existe); edição concorrente é "última escrita vence"; o aceite real do push em navegador de verdade nunca foi testado (headless não concede); iPhone exige o painel instalado.

### 20.9 Testes
`backend/test/notes-internal-audit.ts` (32), `push-real-audit.ts` (6) e `docs/testes-e2e/test_notes.py` (32 no Chromium).

## 21. Horário de funcionamento e o toggle "loja aberta" (Z3, item 9)

- **Causa do bug "Fecha em 54 min" com `00:00–00:00`**: `schedule.ts` usava `new Date().getHours()/getDay()` (fuso do servidor, UTC no Render) e tratava `00:00–00:00` como janela que cruza a meia-noite. **Agora** (`backend/src/common/utils/schedule.ts`): tudo em `America/Sao_Paulo` via `Intl` (sem somar offset à mão); `00:00–00:00` (abre == fecha) = **24 h**; `fecha < abre` cruza a meia-noite e a madrugada seguinte pertence à janela do **dia anterior**. Formato inalterado: `{ segunda: "18:00-23:00", domingo: "fechado", … }`.
- **Toggle × horário**: `locations.is_open` + `locations.schedule_open_state` (último estado do horário já refletido; migration `…03`). Função pura `computeIsOpenNow(manual, hours, scheduleOpenState, now)`: sem horário → vale o toggle; estado desconhecido (loja antiga) → comportamento anterior (toggle **e** dentro do horário); **transição pendente** (estado ≠ dentro/fora agora) → **o horário vence**; sem transição → **o toggle manda** (o admin abre fora do horário ou fecha dentro dele até a próxima abertura/fechamento).
- **Cron de 1 min** (`LocationsService.syncScheduleToggles`): primeira passada preserva o que o cliente via (`isOpen && dentro`) e grava o estado; depois, a cada transição, `isOpen = dentro`. Ao **editar o horário** (`update`), `isOpen` passa a refletir o horário na hora (a menos que o admin mande o toggle junto). Quem decide se dá pra pedir (`orders.service`, `tables.service`, resposta pública de `locations.service`) passa `location.scheduleOpenState` — a leitura fica correta mesmo se o cron atrasar.
- **Resposta pública**: `isOpenNow`, `closingInMinutes` (null em 24 h) e `isOpen24h`; o cardápio nunca mostra "fecha em X min" quando 24 h.
- **Admin (`LocationsSettingsPage`)**: preset **"Aberto 24h"**, checkbox **"Aberto nos fins de semana"** (ligar copia o horário de sexta ou 18–23 h; desligar fecha sáb/dom), "24 horas" por dia com "definir horário", e polling de 60 s para a tela refletir o toggle automático. **Cardápio** (`lib/openingHours.ts`): "Hoje: …"/"Aberto 24h" no fuso de Brasília.
- Teste: `npm run test:schedule` (10 verificações com instantes fixos).

## 22. Dados sensíveis — o que NUNCA pode vazar para o cliente

- `products.cost_price`: `findAllForPublic` zera `costPrice`; só rotas de admin devolvem.
- `order_items.unit_cost`: `select: false` — não vai em pedido/cupom/histórico; só o SQL cru da Análise lê.
- Parâmetros financeiros do restaurante (`default_cmv_percent`, `card_fee_percent`, `pix_fee_percent`, `tax_percent`) e `internal_notification_target`: **`toPublicTenant`** os remove de `GET /tenants/public/:slug`; `GET /tenants/me` (admin) os devolve.
- Segredos do Mercado Pago: nunca saem (`toSafeTenant`, já existente).
- Notas, notificações internas, análise, caixa: só `JwtAuthGuard` — sem rota de cliente.
- **Verificação por HTTP real**: `docs/testes-e2e/test_api_leaks.py` (19 verificações). A Z5 achou que `internalNotificationTarget` ainda vazava na rota pública e fechou.

## 23. Cronologia dos pedidos do Felipe (rastreabilidade)

**Z2 — 03/10 — 17 ajustes** (zip `…-10-03-1735`, depois da Z): 1 item indisponível visível; 2 ocultar "Criar categoria personalizada" (sem remover lógica); 3 nomes de categorias cortados; 4 aviso do tamanho ideal da imagem; 5 pedidos escuros em "Minha conta"; 6 pedidos logo abaixo do cliente na aba Mesas; 7 "Sair da conta" parou de funcionar; 8 banner em tela cheia; 9 ícones kimchi e molheira; 10 telefone no estilo "Chamar garçom"; 11 largura de "Chamados de garçom pendentes"; 12 cores padrão `#3d3846`/`#c0bfbc`; 13 botão "Sair" do admin; 14 pronomes pessoais (3 lugares); 15 presets/"Minhas categorias" (checkmarks + lixeira única); 16 seta no histórico do admin; 17 bandeiras JP/CN/KR.

**Z3 — 04/10 — 10 correções + Análise v1** (zip `…-10-04-0948`): voltar das Avaliações; trava de reabrir mesa 2 min → 5 s; "NaN descontados"; campos de dinheiro; validade do cashback + tempo restante; avisos 1 semana/2 dias; configuração de cashback só editável; cupom com 1 avatar e pedidos só itens/hora/data; horário de funcionamento (fuso BRT, 24h, fins de semana, toggle automático); bloqueios de ação indesejada. + **aba Análise v1** (KPIs, gráficos, matriz, heatmap, canais, exportação) e evolução do schema (custo, CMV, cancelamento, caixa).

**Z4 — 04–05/10 — Anotações** (zip `…-10-05-0153`): mural + notificações internas + Web Push da equipe (seção 20); sino e menu em gaveta no painel.

**Z5 — 05–06/10 — Auditoria matemática da Análise** (zip `…-10-06-0426`) e **consolidação** (este zip): regras DRE finais (seção 19), `lockProjectedPoint`, catálogo único; correção do vazamento de `internalNotificationTarget`; **testes permanentes** (`npm run test:all`, `docs/testes-e2e/`); `unit_cost` verificado por um pedido real pela API HTTP; schema real em `docs/schema-atual-2026-10-06.sql`; **este handoff**.

## 24. Apêndice — arquivos novos e modificados desde o zip de 03/10 (`…-10-03-0514`)

Comparado com o zip original: **nenhum arquivo foi perdido** (435 → 511 arquivos de código-fonte/config/docs; todos os ocultos — `.env.example`, `.prettierrc`, `.oxlintrc.json`, `.gitignore` — continuam). `package.json` mudou só em: backend (scripts `test:*`) e frontend-admin (dependência `xlsx`). Não vão no zip (e são reconstruídos): `node_modules/`, `dist/`, `.env` (segredos).

### Arquivos NOVOS (76)
```
backend/src/migrations/1757100000000-CustomerPronouns.ts
backend/src/migrations/1757100000001-DefaultBrandColors.ts
backend/src/migrations/1757100000002-CashbackExpiryControl.ts
backend/src/migrations/1757100000003-LocationScheduleState.ts
backend/src/migrations/1757100000004-AnalyticsSchema.ts
backend/src/migrations/1757100000005-AnalyticsFinancialParams.ts
backend/src/migrations/1757100000006-NotesAndInternalNotifications.ts
backend/src/modules/analytics/analytics.controller.ts
backend/src/modules/analytics/analytics.math.ts
backend/src/modules/analytics/analytics.module.ts
backend/src/modules/analytics/analytics.range.ts
backend/src/modules/analytics/analytics.service.ts
backend/src/modules/analytics/analytics.types.ts
backend/src/modules/cash/cash-transaction.entity.ts
backend/src/modules/cash/cash.controller.ts
backend/src/modules/cash/cash.module.ts
backend/src/modules/internal-notifications/dto/internal-notification.dto.ts
backend/src/modules/internal-notifications/internal-notification-read.entity.ts
backend/src/modules/internal-notifications/internal-notification.entity.ts
backend/src/modules/internal-notifications/internal-notifications.controller.ts
backend/src/modules/internal-notifications/internal-notifications.module.ts
backend/src/modules/internal-notifications/internal-notifications.service.ts
backend/src/modules/internal-notifications/user-push-subscription.entity.ts
backend/src/modules/notes/dto/note.dto.ts
backend/src/modules/notes/note.entity.ts
backend/src/modules/notes/notes.controller.ts
backend/src/modules/notes/notes.module.ts
backend/src/modules/notes/notes.service.ts
backend/test/analytics-audit.ts
backend/test/cashback-expiry-audit.ts
backend/test/helpers.ts
backend/test/notes-internal-audit.ts
backend/test/push-real-audit.ts
backend/test/schedule-audit.ts
docs/HANDOFF-2026-10-03-Z2.md
docs/HANDOFF-2026-10-04-Z3.md
docs/HANDOFF-2026-10-04-Z4.md
docs/HANDOFF-2026-10-05-Z5.md
docs/HANDOFF-COMPLETO-2026-10-07-Z5.md
docs/schema-atual-2026-10-06.sql
docs/testes-e2e/README.md
docs/testes-e2e/run.sh
docs/testes-e2e/smoke_todas_as_rotas.py
docs/testes-e2e/test_analytics.py
docs/testes-e2e/test_api_leaks.py
docs/testes-e2e/test_notes.py
frontend-admin/public/icons/badge-72.png
frontend-admin/public/icons/icon-192.png
frontend-admin/public/sw.js
frontend-admin/src/components/FlagIcons.tsx
frontend-admin/src/components/analytics/ChannelDonut.tsx
frontend-admin/src/components/analytics/ExportMenu.tsx
frontend-admin/src/components/analytics/KpiCards.tsx
frontend-admin/src/components/analytics/MenuEngineering.tsx
frontend-admin/src/components/analytics/PeriodSelector.tsx
frontend-admin/src/components/analytics/RevenueChart.tsx
frontend-admin/src/components/analytics/SalesHeatmap.tsx
frontend-admin/src/components/analytics/format.ts
frontend-admin/src/components/notes/NoteBody.tsx
frontend-admin/src/components/notes/NoteCard.tsx
frontend-admin/src/components/notes/NotesBoard.tsx
frontend-admin/src/components/notes/NotesGrid.tsx
frontend-admin/src/components/notes/notePalette.ts
frontend-admin/src/components/notifications/NotificationBell.tsx
frontend-admin/src/components/notifications/notificationMeta.tsx
frontend-admin/src/contexts/InternalNotificationsContext.tsx
frontend-admin/src/lib/analyticsExport.ts
frontend-admin/src/lib/internalPush.ts
frontend-admin/src/lib/noteFormat.ts
frontend-admin/src/pages/AnalyticsPage.tsx
frontend-admin/src/pages/NotesPage.tsx
frontend-admin/src/pages/NotificationsPage.tsx
frontend-admin/src/types/analytics.ts
frontend-admin/src/types/notes.ts
frontend-admin/vercel.json
frontend-cardapio/src/lib/protectContent.ts
```

### Arquivos MODIFICADOS (71)
```
backend/package.json
backend/src/app.module.ts
backend/src/common/utils/schedule.ts
backend/src/config/data-source.ts
backend/src/modules/cashback/cashback-ledger-entry.entity.ts
backend/src/modules/cashback/cashback.controller.ts
backend/src/modules/cashback/cashback.module.ts
backend/src/modules/cashback/cashback.service.ts
backend/src/modules/customers/customer.entity.ts
backend/src/modules/customers/customers-auth.service.ts
backend/src/modules/customers/dto/update-customer-profile.dto.ts
backend/src/modules/locations/location.entity.ts
backend/src/modules/locations/locations.service.ts
backend/src/modules/orders/dto/update-order-status.dto.ts
backend/src/modules/orders/order-item.entity.ts
backend/src/modules/orders/order.entity.ts
backend/src/modules/orders/orders.controller.ts
backend/src/modules/orders/orders.service.ts
backend/src/modules/products/dto/create-product.dto.ts
backend/src/modules/products/dto/update-product.dto.ts
backend/src/modules/products/product.entity.ts
backend/src/modules/products/products.service.ts
backend/src/modules/tables/tables.service.ts
backend/src/modules/tenants/dto/update-tenant.dto.ts
backend/src/modules/tenants/tenant.entity.ts
backend/src/modules/tenants/tenants.controller.ts
frontend-admin/package-lock.json
frontend-admin/package.json
frontend-admin/src/App.tsx
frontend-admin/src/buildInfo.ts
frontend-admin/src/components/AdminLayout.tsx
frontend-admin/src/components/CategoryManager.tsx
frontend-admin/src/components/MaskedNumberField.tsx
frontend-admin/src/components/ProductOptionsEditor.tsx
frontend-admin/src/components/ReceiptContent.tsx
frontend-admin/src/components/categoryLineIcons.tsx
frontend-admin/src/contexts/DashboardDataContext.tsx
frontend-admin/src/lib/admin-api.ts
frontend-admin/src/lib/establishmentTypes.tsx
frontend-admin/src/pages/CashbackSettingsPage.tsx
frontend-admin/src/pages/DashboardPage.tsx
frontend-admin/src/pages/HistoryPage.tsx
frontend-admin/src/pages/LocationsSettingsPage.tsx
frontend-admin/src/pages/LoyaltySettingsPage.tsx
frontend-admin/src/pages/MenuManagementPage.tsx
frontend-admin/src/pages/PromotionsSettingsPage.tsx
frontend-admin/src/pages/SettingsPage.tsx
frontend-admin/src/types/index.ts
frontend-cardapio/src/buildInfo.ts
frontend-cardapio/src/components/LogoViewer.tsx
frontend-cardapio/src/components/MenuHeader.tsx
frontend-cardapio/src/components/ProductCard.tsx
frontend-cardapio/src/components/ReceiptContent.tsx
frontend-cardapio/src/components/RestaurantInfoPanel.tsx
frontend-cardapio/src/components/SplashScreen.tsx
frontend-cardapio/src/components/TableMenuHeader.tsx
frontend-cardapio/src/components/categoryLineIcons.tsx
frontend-cardapio/src/contexts/CartContext.tsx
frontend-cardapio/src/hooks/useTableSession.ts
frontend-cardapio/src/index.css
frontend-cardapio/src/lib/customer-api.ts
frontend-cardapio/src/lib/openingHours.ts
frontend-cardapio/src/lib/seat.ts
frontend-cardapio/src/main.tsx
frontend-cardapio/src/pages/CustomerCashbackPage.tsx
frontend-cardapio/src/pages/CustomerProfilePage.tsx
frontend-cardapio/src/pages/EditProfilePage.tsx
frontend-cardapio/src/pages/MyAccountPage.tsx
frontend-cardapio/src/pages/ProductDetailPage.tsx
frontend-cardapio/src/pages/PublicReviewsPage.tsx
frontend-cardapio/src/types/index.ts
```

## 25. Mensagem sugerida para abrir a próxima sessão
> Claude, anexei o `HANDOFF-COMPLETO-2026-10-07-Z5.md` e o zip completo do projeto. **Leia o handoff inteiro antes de qualquer coisa** (principalmente o "Padrão exigido" no topo e as seções 0, 4 e 15), descompacte o zip, rode `tsc` nos três projetos e me diga o estado antes de começar. Siga **minuciosamente, rigorosamente, matematicamente, de ponta a ponta** tudo que eu pedir, em nível sênior: reproduza antes de corrigir, valide com Postgres e navegador reais, e seja honesto sobre o que não der pra testar daí.
