# HANDOFF COMPLETO — Cardápio SaaS (consolidado em 29/09/2026, sessão W)

Este documento substitui a necessidade de ler os handoffs de sessão individuais anteriores. Se você é uma sessão nova do Claude, **leia isso inteiro antes de tocar em qualquer código**.

Antes de mais nada: a sessão que escreveu isto (S até W, 27–29/09) fez um trabalho excelente segundo o próprio Felipe — ele pediu explicitamente que isso ficasse registrado aqui pra você. O padrão que funcionou bem e vale manter: ler o código de verdade antes de mexer (nunca assumir a partir só do handoff), rodar `tsc` nos três projetos antes de entregar, testar a integridade do zip, fazer uma varredura ativa por bugs relacionados ao que foi mexido em vez de só resolver o pedido literal, e ser honesto sobre o que não dá pra testar daqui (sem rede real pra gateways de pagamento, sem como rodar migration contra o Postgres de produção). Continue assim.

## 1. O que é o projeto

Cardápio SaaS: plataforma multi-tenant de cardápio digital e pedidos pra restaurantes/bares. Três subprojetos num monorepo:

- **backend/** — NestJS + TypeScript + TypeORM + PostgreSQL (via Supabase).
- **frontend-admin/** — React + Vite + Tailwind. Painel do dono do restaurante. **Nunca publicado** — roda só local (`npm run dev`), decisão intencional.
- **frontend-cardapio/** — React + Vite + Tailwind. App do cliente final. Publicado na Vercel.

**Em produção** desde início de setembro de 2026.

## 2. Quem é o usuário e como ele trabalha

Felipe é "vibe coder": não escreve nem edita código manualmente. Toda entrega é feita por **zip + bloco de comandos de terminal que ele copia e cola**. Preferência salva: quando dá os comandos de terminal, dar **só o bloco de comandos**, sem texto explicativo misturado no meio — a explicação vem antes, os comandos vêm depois, puros.

Ele se frustra (com razão, várias vezes) quando uma correção é entregue como resolvida sem ter sido validada de verdade, ou quando o mesmo tipo de bug volta depois de "corrigido". Quando frustrado, xinga bastante — isso não muda o rigor técnico nem deve gerar defensividade, só mais cuidado e honestidade sobre incerteza.

Ele também aprecia — e pediu explicitamente que isso continue — quando uma sessão vai além do pedido literal e faz uma varredura ativa por bugs relacionados ao que está sendo mexido, mesmo sem ele ter perguntado.

## 3. Deploy — topologia e como atualizar

| Peça | Onde | Como atualizar |
|---|---|---|
| Backend | Render (free tier, cold start) | `git push` (auto-deploy da branch `main`) |
| Banco | Supabase | `cd backend && npm run migration:run` manual, sempre que tiver migration nova |
| frontend-cardapio | Vercel `cardapio-saas-beta.vercel.app` (projeto real chamado `cardapio-saas` no painel — "-beta" é só o alias/domínio) | `npx vercel --prod --force` de dentro de `frontend-cardapio/` |
| frontend-admin | Não publicado | `npm run dev` local sempre |

- Repo: `github.com/Fredericrypto/cardapio-saas`. Git sempre da raiz do monorepo; npm sempre da subpasta específica — sempre dizer explicitamente qual.
- Autenticação do GitHub é por **token pessoal** (classic, escopo `repo`), não senha.
- Render precisa da connection string do Supabase em modo **"Transaction pooler"** (porta 6543) — Render não tem saída IPv6. Dev local usa a connection string direta.
- Render é plano grátis: "dorme" depois de um tempo sem requisição. Cron jobs não rodam com o processo dormindo — resolve de vez com um keep-alive externo (ex: UptimeRobot grátis) ou upgrade de plano.

## 4. Convenções fixas — quebrar qualquer uma já causou bug real de produção

- Nome do arquivo do zip sempre com data+hora, nunca reaproveitado. Sempre testar integridade (`unzip -t`) antes de entregar.
- **`frontend-admin` e `frontend-cardapio` usam TypeScript project references** — a ÚNICA checagem válida é `npx tsc -b --noEmit --force` depois de `npm install`. `tsc --noEmit` sozinho sempre reporta "limpo" mesmo com erro real. O `backend` tem tsconfig normal, `tsc --noEmit` simples está certo lá.
- Migration nova ou alterada: sempre listar claramente no handoff que precisa rodar `npm run migration:run`.
- **TypeORM**: `@Column()` com `string | null` ou union de string literal precisa de `type: 'varchar'` explícito, ou quebra em runtime na migration, sem o `tsc` acusar nada.
- **Toda entidade TypeORM nova precisa ser registrada em DOIS lugares**: `app.module.ts` (lista de entities do `TypeOrmModule.forRoot`) E `src/config/data-source.ts`.
- Dados financeiros/de auditoria: soft-delete só, nunca hard delete. Locks pessimistas sempre em ordem determinística.
- Todo zip entregue vem acompanhado do bloco de comando exato pra aplicar (unzip → rsync com `--exclude` de `.git`/`node_modules`/`.env`/`android` → migration se tiver → git add/commit/push → npm install nos frontends → deploy).
- **Um zip baixado precisa ser DESCOMPACTADO antes do rsync** — rodar rsync direto de `~/Downloads/<nome-do-zip>/` sem descompactar falha silenciosamente e parece "nothing to commit".
- **Marcador de build**: `frontend-admin/src/buildInfo.ts` e `frontend-cardapio/src/buildInfo.ts` exportam `BUILD_VERSION` — **bumpar em TODA entrega nova**, nos dois arquivos. Sempre fechar o app inteiro e abrir do zero antes de retestar depois de um deploy (uma aba já aberta não busca JS novo sozinha).
- Nunca mostrar texto cru de erro do servidor pro cliente final — só 4xx escrito de propósito em português simples; qualquer 5xx/falha de rede vira mensagem genérica amigável.
- Endpoints públicos e protegidos de leitura (GET) que servem dado que muda com frequência levam `Cache-Control: no-store`.

## 5. Arquitetura de sessão de mesa (não mexer sem entender isto primeiro)

1. Toda carga de `/mesa/:qrCodeToken` consulta o backend do zero, só pra aquele token — nunca herda de outra aba/token.
2. Sessão ativa encontrada → se `mesa_ativa_{slug}` (localStorage, só gravado numa confirmação de verdade) já é esse token, reconhece direto; token diferente → pede confirmação.
3. Sem sessão ativa, última fechou há menos de 2 min (`recentlyEnded`, calculado no servidor) → tela final "Sessão encerrada", sem reabrir ali — reforçado também no backend (`openOrJoinSession`).
4. Sem sessão ativa e não recém-encerrada → entra direto.
5. Bloqueio entre mesas: sessão ativa em outro lugar COM pedido de verdade bloqueia; uma sessão vazia que ele mesmo abriu em outro lugar é fechada sozinha em vez de bloquear.
6. Balcão/Entrega com mesa aberta é bloqueio de verdade (`ConflictException`).
7. `TableSessionParticipant` rastreia quem está presente. "Sair da mesa" só pra quem se JUNTOU e só sem pedido feito.
8. Sync entre dispositivos: polling de 20s (pausado com aba escondida). WebSocket/push real descartado como inviável no Render grátis + Vercel.
9. Cron a cada 1 min fecha sessão vazia expirada sozinho — só enquanto o processo está acordado.

## 6. Fechamento de conta — reforma completa (sessões V e W, 28–29/09) — LEIA ANTES DE MEXER AQUI

Isto foi reformulado do zero nas sessões V e W. O fluxo antigo (cliente pede fechamento só com gorjeta, admin decide tudo sozinho) não existe mais.

### Fluxo atual
1. Cliente toca "Solicitar fechamento" → abre `ClosingPaymentSheet.tsx`, que pergunta: forma de pagamento (Pix/Cartão/Dinheiro), se quer usar cashback (com prévia ao vivo), e se dinheiro, balcão ou atendente na mesa.
2. **Cashback nunca aplica sozinho**: mesmo cobrindo 100% da conta, é sempre uma escolha explícita entre "pagar com cashback" ou "prefiro outra forma" — nunca pula direto pra "nada a pagar" (bug corrigido na sessão W a pedido do Felipe).
3. **Mesa compartilhada**: se mais de um cliente distinto pediu algo, pergunta como dividir o cashback GANHO nessa sessão — cada um recebe do próprio pedido (padrão, `cashbackSplitMode: 'por_pedido'`) ou tudo pra quem fechou a conta (`'pagador'`). Quem não pediu nada nunca recebe cashback, com qualquer modo.
4. **Pix real via Mercado Pago**: reaproveita a integração já existente (usada em pedidos avulsos de balcão/entrega, `MercadoPagoService`/`OrdersService`) — não é um gateway novo. Só funciona se o tenant tiver o access token do Mercado Pago configurado em Configurações (`SettingsPage.tsx`, campo já existente, não é uma chave Pix solta — é o token de API). Sem isso configurado, Pix de mesa continua sendo a intenção combinada em pessoa, como sempre foi.
   - Cliente vê QR + código copia-e-cola (`TableSessionPixWaitingPanel.tsx`), com polling próprio (`checkSessionPixStatus`) e contagem regressiva de 15 minutos.
   - Confirmação é automática (webhook do Mercado Pago OU o próprio polling do cliente, o que chegar primeiro) — a mesa fecha sozinha, sem o admin clicar em nada.
   - Webhook é o MESMO endpoint já usado pra pedidos avulsos (`/orders/public/:tenantId/webhook/mercadopago`) — distingue mesa de pedido pelo prefixo `mesa:` na `externalReference`.
5. Admin só digita valor recebido (pra troco) quando é **dinheiro** — Pix/Cartão/Cashback são só um botão de confirmar, sem digitação. `CloseSessionModal.tsx` mostra claramente o que o cliente pediu.
6. Cashback GANHO é creditado só depois que o pagamento é confirmado de verdade — nunca antes. Cashback USADO (pra pagar) é debitado com lock pessimista, sempre recalculado contra o saldo ao vivo, nunca um valor congelado.

### Colunas novas em `table_sessions` (migrations 1756600000000 e 1756700000000)
`requested_payment_method`, `cash_delivery_preference`, `cashback_requested_by_customer_id`, `cashback_used`, `closing_requested_by_customer_id`, `cashback_split_mode`, `mp_payment_id`, `pix_payload`, `pix_expires_at`, `payment_status`.

### `cashback_consumptions` agora é polimórfico
`order_id` virou opcional; ganhou `table_session_id` — CHECK garante exatamente uma origem preenchida (nunca as duas, nunca nenhuma). Motivo: cashback agora pode ser gasto direto no fechamento de mesa, não só em pedido avulso. Ver `CashbackService.consumeForTableSession` (duplicado de `consume()` de propósito, não generalizado — mexer num não deveria arriscar quebrar o outro).

### ⚠️ LIMITAÇÃO CONHECIDA E NÃO RESOLVIDA — CORRIGIR ISSO É O PRIMEIRO LUGAR PRA COMEÇAR

**Se alguém pedir mais um item enquanto um Pix real (Mercado Pago) está pendente pra aquela mesa, a sessão volta sozinha pra `'aberta'`** (essa reversão já existia antes, é uma proteção legítima de outro fluxo — ver `OrdersService.create`, comentário "Se o cliente já tinha solicitado fechamento e pediu mais alguma coisa antes do garçom vir"). O problema: **se o cliente pagar o QR antigo mesmo assim** (ele pode já ter aberto o app do banco antes de pedir o item extra), **esse dinheiro cai de verdade na conta do restaurante no Mercado Pago, mas o sistema não sabe mais o que fazer com ele** — `applyMercadoPagoStatusToSession` verifica `session.status !== 'fechamento_solicitado'` e simplesmente ignora o webhook/poll nesse caso (proteção contra fechar com o valor errado, mas cria um pagamento "órfão").

**Resolver isso de verdade exige bloquear novos pedidos enquanto há uma cobrança Pix pendente pra aquela mesa** — não foi implementado na sessão W por ser outra frente de trabalho. Pontos pra atacar isso:
1. Em `OrdersService.create` (o mesmo lugar que hoje reverte a sessão pra `'aberta'`), quando `session.paymentStatus === 'pendente'` (cobrança Pix real em aberto), **bloquear o novo pedido** com uma mensagem clara ("Essa mesa está com um pagamento em andamento — aguarde ele confirmar ou peça pra cancelar antes de pedir mais algo"), em vez de simplesmente reverter a sessão.
2. Alternativa mais amigável: oferecer ao cliente um botão pra CANCELAR a cobrança pendente antes de liberar o pedido novo (já existe `MercadoPagoService.cancelPayment`, usado hoje só internamente em `requestClosing` quando o próprio cliente troca de forma de pagamento — dá pra expor esse mesmo caminho aqui).
3. Sem isso, o cenário "pagou o QR velho por engano" ainda deixa dinheiro não reconciliado automaticamente na conta do restaurante — precisa de conferência manual (admin bate o extrato do Mercado Pago contra o histórico do app) até esse bloqueio existir.

Isso NÃO é hipotético — é uma lacuna real, gerada pela combinação de dois comportamentos cada um correto isoladamente (reversão de sessão + confirmação automática de Pix), e só ficou visível ao pensar nos dois juntos. Trate como prioridade antes de qualquer outra coisa nova em pagamento/mesa.

## 7. Sistema de categorias — catálogo fixo (sessão U, 28/09)

Admin não digita mais nome de categoria — só ativa/desativa de um catálogo fixo (`category-catalog.ts`, espelhado em backend/admin/cardápio). Ordem: Todos (virtual) → Lanches → Bebidas → Sobremesas → demais na ordem em que foram ativadas. 20 categorias no catálogo, cada uma com ícone (Todos/Lanches/Bebidas usam os SVGs do Felipe; Sobremesas é fatia de bolo lucide; as demais usam lucide). Categorias antigas sem `key` (criadas antes dessa mudança) continuam funcionando, só não dá pra criar novas assim — só removíveis, nunca editáveis.

## 8. Ícones de marca (sessões S–T, 27/09)

`BrandIcons.tsx` (Gmail, TikTok, Facebook, Instagram, YouTube) e `MenuIcons.tsx`/`CategoryIcon.tsx` (categorias, Info, carrinho, promoção) — todos os `d=` de SVG vieram colados diretamente pelo Felipe, nunca desenhados à mão (ele proibiu isso explicitamente depois de 3 tentativas ruins nas sessões N/P/Q). Degradê do YouTube: vermelho `#FF1A47` sólido até 60%, transição pro magenta `#FF1DCF` nos 40% finais.

## 9. Sistemas entregues (resumo — detalhe completo no histórico de sessões se precisar)

- Fluxo completo de cardápio, carrinho, pedido, cashback, cupom fiscal (mesa/balcão/entrega, com código de autenticidade verificável — agora considerando cashback usado no cálculo da assinatura).
- Painel admin: mesas/balcão/entrega em tempo real (polling), status de pedido com um toque só, borda azul piscante por pedido novo.
- Mesa vs Balcão como categorias, QR code com nível de correção de erro reforçado.
- Múltiplas lojas/filiais por tenant — WhatsApp/Telegram/telefone por LOJA; Instagram/Facebook/YouTube/TikTok/X/Messenger/Gmail por MARCA (tenant inteiro).
- Horário de funcionamento por dia com "Fechado" em vermelho, endereço formatado em duas linhas.
- Avaliações, cashback/loyalty, histórico com expiração de 7 dias, verificação de conta.
- Notificações push consolidadas por cliente (não uma por pedido) pra pagamento confirmado, cashback ganho, e convite de avaliação.
- Integração Mercado Pago real pra Pix (pedidos avulsos E fechamento de mesa), com idempotência, cancelamento de cobrança órfã, e verificação de assinatura HMAC do webhook.

## 10. Pendências antigas (nenhuma tocada recentemente — reproduzir antes de mexer)

i18n entre tenants, login com Google no backend, área dedicada de Reclamações, bug de exportação de recibo em PNG no mobile, clique de notificação push não navegando em alguns testes mobile, auditoria geral de CSS mobile, lightbox de foto do restaurante, separação visual "pedido em casa vs no estabelecimento", opção "Agendar retirada", dois bugs antigos de promoção (configuração de localização afetando todas as promoções juntas; promoção sumindo depois de salvar com validade futura).

## 11. Se algo parecer "consertado mas continua quebrado"

Antes de assumir que o código está errado, nessa ordem:
1. O deploy realmente rodou? (`git log -1`, hash no GitHub; status "Live" no Render; deployment mais recente na Vercel.)
2. O `BUILD_VERSION` no rodapé bate com o que foi mandado?
3. O app foi fechado por completo e reaberto do zero?
4. Existe algum `Cache-Control` faltando num endpoint GET que serve dado que muda?
5. Alguma entidade nova foi registrada nos dois lugares (seção 4)?
6. Alguma migration nova ficou pendente de rodar?
7. **Novo, desde a sessão V/W**: se for algo envolvendo pagamento de mesa, cashback ou Pix, primeiro confirme qual `paymentStatus`/`status` a sessão está tendo AGORA no banco (`table_sessions`) antes de mexer em qualquer lógica — muita coisa depende de estado, não só do código.

Esse roteiro já resolveu a maioria dos "bugs fantasma" reportados ao longo do projeto.
