# Handoff — Cardápio SaaS (20/08/2026)

## 1. Visão geral

Plataforma multi-tenant de cardápio digital + pedidos (estilo iFood/McDonald's app), com três projetos:

- **backend/** — NestJS + TypeScript + TypeORM + PostgreSQL + Redis
- **frontend-admin/** — React + Vite + Tailwind v4, painel do restaurante
- **frontend-cardapio/** — React + Vite + Tailwind v4, app do cliente final (o que os clientes usam pra pedir)

Felipe é "vibe coder": não escreve nem edita código manualmente. Toda entrega é feita por zip + comandos de terminal que ele copia e cola. **Todo trabalho de código é feito por Claude, do design da arquitetura à implementação.**

## 2. Convenções de entrega (regras fixas, nunca quebrar)

- Nome do zip de entrega sempre com data/hora: `cardapio-saas-<assunto>-AAAA-MM-DD-HHMM.zip` — nunca reutilizar nome
- Comando de entrega no formato: `cd ~/Downloads && mkdir -p <nome> && unzip -o <nome>.zip -d <nome> && cp -r <nome>/backend/. ~/Projetos/cardapio-saas/backend/` (repetir `cp -r` por subprojeto alterado)
- Migrations **nunca** vão dentro do `cp -r` do backend de forma implícita — sempre mencionar separadamente: `cd ~/Projetos/cardapio-saas/backend && npm run migration:run`
- **Nunca editar uma migration já aplicada** — sempre criar uma nova migration incremental
- `synchronize: true` nunca é usado — só migrations controlam o schema
- Toda nova entity TypeORM precisa ser registrada em **dois lugares**: `app.module.ts` (runtime) e `src/config/data-source.ts` (CLI de migrations) — esquecer um dos dois é o erro mais comum
- Antes de construir qualquer feature nova, pesquisar como apps de referência (iFood, McDonald's, Uber Eats, Google/Yelp reviews, cartões de cashback) fazem, e trazer isso pro design
- Todo `.env.example` (3 arquivos: `backend/`, `frontend-admin/`, `frontend-cardapio/`) deve refletir 100% das variáveis realmente lidas pelo código — **este handoff já vem com os três atualizados**, mantenha assim

### Gotcha crítico do TypeORM (já mordeu antes, documentar sempre)

Qualquer `@Column()` com tipo TypeScript `string | null` ou union de string literal **precisa** de `type: 'varchar'` (ou o tipo apropriado) explícito no decorator. Sem isso, `strictNullChecks` faz o TypeScript emitir `design:type: Object`, e o TypeORM lança `DataTypeNotSupportedError` **em runtime da migration**, não pego por `tsc --noEmit`. Validar toda entity nova contra Postgres real antes de entregar.

### Convenção de teste antes de entregar

Para qualquer lógica financeira ou de regra de negócio não-trivial (cashback, reviews, promoções), o padrão estabelecido é: **instalar Postgres real no sandbox, rodar a migration de verdade, escrever um script TS isolado que exercita o service contra esse banco, e só entregar depois que os testes passarem**. Isso já pegou bugs reais antes de chegar no Felipe (ex: erro de `getRawOne` podendo vir `undefined`, e o bug de "cashback em cima de cashback").

## 3. Arquitetura de segurança/design que se tornou padrão do projeto

Esses princípios apareceram em várias features e devem ser replicados em features novas:

- **Nunca hard-delete dado financeiro/de auditoria** — sempre soft-delete (`@DeleteDateColumn`) ou "esconder da tela" (cron), nunca apagar de verdade do banco
- **Idempotência via índice único parcial** + `try/catch` na violação — protege contra double-processing em qualquer fluxo assíncrono (webhook + polling correndo junto, por exemplo)
- **Lock pessimista (`SELECT ... FOR UPDATE`) sempre em ordem determinística** (mesmo `ORDER BY` em toda consulta que trava linhas) — evita deadlock entre transações concorrentes
- **"Ponto sem volta" explícito** em qualquer fluxo que envolve dinheiro ou conteúdo do cliente — uma vez que o valor real foi entregue (pagamento confirmado, produto recebido), reverter deixa de ser automático
- **Nunca deixar o estabelecimento editar/ocultar/apagar conteúdo do cliente** (reviews) — só o próprio cliente controla o que ele publicou
- **Toda ação de moderação exige motivo obrigatório e fica auditada** (nome do funcionário + timestamp), quando essa capacidade existe
- **Nunca vazar identidade entre sessões/contas** — este foi o bug mais sério encontrado no projeto (ver seção 8)

## 4. Inventário de features — Backend

### 4.1 Multi-location / franquia
`Location` guarda dados físicos (endereço, GPS, horário de funcionamento); `Tenant` é só a marca. Migração automática criou uma `Location` padrão por tenant existente. Cliente escolhe loja (balcão/entrega) ou é resolvido automaticamente (mesa, via QR code).

### 4.2 Modificadores de produto (estilo iFood)
`ProductOption`/`ProductOptionValue`. Linha de carrinho identificada por `product+selectedOptions` (`lineKey`). Preço sempre revalidado no servidor.

### 4.3 Promoções
Múltiplos cupons por pedido (`promotionIds[]`), `maxEligibleQuantity`, reset de uso por cliente, `order_promotion_discounts` pra relatório. Painel de resgates no admin.

### 4.4 Fidelidade (cartão-selo)
`LoyaltyProgram`, `LoyaltyStamp`, `LoyaltyReward`. Anti-passback via índice parcial único no Postgres. Hook de prêmio tipo "cashback" credita valor fixo via `CashbackService.creditFixedAmount`.

### 4.5 Cashback (`modules/cashback/`)
Sistema completo estilo Uber Cash/iFood:

- **Entities**: `CashbackSettings` (config por tenant, escopo por loja via M2M, resolução por especificidade), `CashbackLedgerEntry` (ledger de créditos, append-only), `CashbackConsumption` (detalhamento de gasto por pedido)
- **Regra de ouro (corrigida depois de bug real)**: valor pago com saldo de cashback **nunca conta como base pra ganhar mais cashback** — mesmo tratamento que vale-presente em programas de cartão. Fórmula certa: `eligibleCents = order.total - deliveryFee` (nunca somar `cashbackUsed` de volta)
- **Fraude/segurança**: teto por pedido (`maxCashbackPerOrder`), teto diário por cliente (`maxCashbackPerCustomerPerDay`, soma últimas 24h), trava `order.cashbackLocked` que impede reversão de cashback depois que o pagamento já foi confirmado (fecha a brecha de "recebeu o produto e cancelou pra recuperar o cashback usado")
- **4 pontos de crédito** (mesmos em toda a arquitetura de "pedido virou definitivo"): `OrdersService.concludeWithPayment`, `confirmPixPayment`, `applyMercadoPagoStatus`, `TablesService.closeSession`
- Histórico completo (quem recebeu/gastou, quando, onde, quanto) na aba Cashback de Histórico no admin; extrato do cliente na área "Meu Cashback"

### 4.6 Avaliações / Reviews (`modules/reviews/`)
Reescrito uma vez depois do design inicial, por pedido explícito do Felipe — regras finais:

- **Prova de compra estrutural**: `Review.orderId` é `UNIQUE` — impossível existir review sem pedido real, concluído de verdade (critério: avulso/entrega = `status==='entregue'`; mesa = sessão fechada, não o status do pedido individual)
- **Imutável depois de publicada**: não existe `updateReview` em lugar nenhum do sistema. Cliente só pode **apagar** (soft-delete via `@DeleteDateColumn`) — e apagar **não libera o pedido pra nova avaliação** (o índice único em `orderId` continua contando a linha apagada; só uma compra nova libera avaliação nova)
- **Estabelecimento nunca edita/oculta/apaga** — só pode **responder publicamente** (upsert, 1 resposta por review). Não existe mais nenhum conceito de "status oculto" no schema (removido numa migration de simplificação)
- **Anônimo**: campo `isAnonymous` — público vê "Anônimo" + avatar genérico; admin sempre vê o nome real (precisa pra dar suporte)
- **Nome público**: "Felipe Santos" → "Felipe S."; nome de uma palavra só (ex: "Felipe") nunca ganha inicial fantasma
- **Por loja, sempre independente**: toda query de resumo/listagem aceita `locationId`; `getSummaryByLocation` traz todas de uma vez pra tela de "escolher loja"
- **Ética embutida no design** (baseado em pesquisa da regra da FTC 2024): nunca condicionar incentivo à nota, nunca excluir review de baixa nota do cálculo de média

### 4.7 Push Notifications (`modules/push/`)
Web Push real (RFC 8291/8292), não é push nativo de app — funciona em qualquer navegador moderno via Service Worker.

- `PushSubscription` entity — um registro por navegador/dispositivo inscrito
- `PushService.sendToCustomer` — "melhor esforço", nunca lança erro, autolimpa inscrições expiradas (404/410)
- Chaves VAPID vêm de env var, **nunca geradas em runtime** (regeneraria e quebraria toda inscrição existente)
- Hoje só um gatilho implementado: **"avalie seu pedido"** (`tag: 'review_prompt'`), disparado nos mesmos 4 pontos do cashback
- Catálogo de tipos já desenhado pro frontend (7 tipos, ver seção 5.4) — só falta implementar os gatilhos de backend pros outros 6

### 4.8 Histórico (`modules/history/`)
Soft-delete + cron de limpeza (`EVERY_HOUR`, não mais uma vez por dia — corrigido depois que o cron diário não disparava de forma confiável em ambiente de dev). Endpoint de busca no arquivo (`GET history/search`) inclui registros já escondidos da tela normal, via `withDeleted: true` — nunca perde acesso a cupom antigo de verdade, só some da lista do dia a dia.

### 4.9 Autenticação do cliente final — reformulada
Duas mudanças estruturais grandes nesta sessão:

1. **Login agora é obrigatório em todo o app** (decisão de produto: "como Instagram", sem navegação anônima) — `RequireCustomerAuth` guarda praticamente toda rota
2. **`useCustomerAuth` reescrito com sincronização entre instâncias**: antes, cada componente que chamava o hook tinha sua própria cópia de estado (lida direto do localStorage), o que causava bugs reais de identidade dessincronizada (ex: modal de avaliação mostrando pedido de uma sessão diferente da que estava sendo usada pra logar). Agora existe um evento customizado (`cardapio:customer-auth-changed`) que toda instância escuta — login/logout em qualquer lugar propaga instantaneamente pra todo o app

## 5. Inventário de features — Frontend

### 5.1 Admin (`frontend-admin`)
- `/cashback` — CRUD de configs (percentual, teto por pedido, teto diário, campos de dinheiro em formato de caixa registradora — nunca `<input type=number>` puro)
- `/avaliacoes` — nota média + gráfico de distribuição (recharts), responder publicamente. **Sem nenhum botão de ocultar/apagar review** de propósito
- `/historico` — 3 abas: Pedidos, Cashback, Fidelidade + busca no arquivo

### 5.2 Cliente (`frontend-cardapio`)
- Tela de login/cadastro (`CustomerAuthPage`) — glassmorphism claro, cores do próprio restaurante (nunca paleta genérica), botão "Continuar com Google" **só visual, ainda não funcional**
- `ReviewModal` — notificação de avaliação com dupla confirmação (cancelar confirma; enviar confirma avisando que não dá pra editar depois)
- `ReviewDisplay` — mostra review já feita (cupom, minhas avaliações), nunca permite criar/editar por lá
- `ReviewPromptProvider` — montado uma vez no topo do app, decide quando mostrar o modal (nunca na tela de login)
- Badge de nota sempre visível (mesmo com 0 avaliações), por loja, no header do cardápio e na tela de escolher loja
- `/{slug}/avaliacoes` — lista pública de reviews, sempre por loja selecionada
- `NotificationsPage` (`/conta-cliente/notificacoes`) — toggle individual por tipo de notificação, preferências em **IndexedDB** (não localStorage — Service Worker precisa ler isso com o app fechado)
- `usePushNotifications` hook — registra Service Worker, pede permissão só a partir de gesto explícito do usuário
- `public/sw.js` — recebe push, confere preferência do tipo antes de mostrar, resolve clique pra URL certa

## 6. Variáveis de ambiente (os 3 `.env.example` já vêm atualizados no zip)

Backend precisa, no mínimo: `DATABASE_URL`, `JWT_SECRET`, `CUSTOMER_JWT_SECRET` (diferente do anterior), `SUPABASE_*`, `LOCATIONIQ_ACCESS_TOKEN`, `API_PUBLIC_URL`, `CUSTOMER_APP_URL`, `CREDENTIALS_ENCRYPTION_KEY`, `RECEIPT_SIGNING_SECRET`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`.

Chaves VAPID já geradas nesta sessão (não regenerar — quebraria inscrições existentes):
```
VAPID_PUBLIC_KEY=BCR5h1QaJdttXYqytXirHFgASfSawTsfs5GVEtPpc5LolxBRiYlPsJh2ue0uqrWaH0Ckb2WY53VJe3xwMcwQ4go
VAPID_PRIVATE_KEY=xlPPMOKI3Sv8w3dpqziNYbZghfQBRvpfEZ3WEozdfpg
```

## 7. Pendências conhecidas / próximos passos sugeridos

- **Login com Google**: botão já existe na UI, backend ainda não tem a estratégia OAuth (Passport + callback + vínculo de conta) — trabalho à parte
- **6 dos 7 tipos de notificação push** têm toggle pronto no frontend mas nenhum gatilho no backend ainda: Pedido entregue, Pagamento concluído, Cashback, Promoções, Fidelidade, Reclamações
- **Avaliação de pedidos de mesa no histórico**: hoje só pedidos avulsos (balcão/entrega) mostram a estrela no histórico de pedidos do cliente — mesa precisaria de refatoração no agrupamento por sessão pra mostrar por pedido individual
- **Limpar dados de teste acumulados**: muitas contas/tokens de teste foram criados ao longo das sessões de debug — vale a pena um cliente limpar localStorage/dados do site antes de testar em produção
- Tenkai/Venus (projeto social separado) segue com as pendências já documentadas em memória, não tocado nesta sessão

## 8. Bugs sérios encontrados e corrigidos nesta sessão (pra nunca reintroduzir)

1. **Carrinho vazando entre contas** — corrigido chamando `clearCart()` explicitamente em todo login/registro/logout/token-inválido
2. **Cashback em cima de cashback** — fórmula errada somava de volta o valor pago com saldo na base de cálculo de novo cashback; corrigido e testado com dois cenários (pedido 100% pago com saldo, pedido parcial)
3. **Modal de avaliação aparecendo com dados de sessão errada durante login** — causa raiz era estado de autenticação duplicado entre componentes (cada `useCustomerAuth()` tinha sua própria cópia); corrigido com evento de sincronização cross-instância
4. **Cron de limpeza de histórico não confiável** — dependia de disparar num horário fixo (3h da manhã); mudado pra rodar a cada hora
5. **Erro de validação confuso em campo "opcional"** — digitar "0" num campo de teto opcional passava a validação de truthy-string mas falhava no `@Min(0.01)` do backend; corrigido com componente de input que nunca produz o valor `0` pra campos opcionais (ou é `null`/vazio, ou é um valor real)
