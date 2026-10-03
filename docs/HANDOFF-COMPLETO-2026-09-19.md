# HANDOFF COMPLETO — Cardápio SaaS (consolidado em 19/09/2026)

Este documento substitui a necessidade de ler todos os handoffs de sessão individuais (`HANDOFF-2026-09-13-*.md` até `HANDOFF-2026-09-19-R.md`, ainda incluídos no zip pra referência histórica se precisar). Se você é uma sessão nova do Claude, **leia isso inteiro antes de tocar em qualquer código**. Esse projeto teve uma sequência longa e cara de bugs de reabertura de sessão de mesa causados por sessões anteriores não lerem o handoff completo — não repita isso.

## 1. O que é o projeto

Cardápio SaaS: plataforma multi-tenant de cardápio digital e pedidos pra restaurantes/bares. Três subprojetos num monorepo:

- **backend/** — NestJS + TypeScript + TypeORM + PostgreSQL (via Supabase).
- **frontend-admin/** — React + Vite + Tailwind. Painel do dono do restaurante. **Nunca publicado** — roda só local (`npm run dev`), decisão intencional.
- **frontend-cardapio/** — React + Vite + Tailwind. App do cliente final. Publicado na Vercel.

**Em produção** desde início de setembro de 2026.

## 2. Quem é o usuário e como ele trabalha

Felipe é "vibe coder": não escreve nem edita código manualmente. Toda entrega é feita por **zip + bloco de comandos de terminal que ele copia e cola**. Preferência salva: quando dá os comandos de terminal, dar **só o bloco de comandos**, sem texto explicativo misturado no meio — a explicação vem antes, os comandos vêm depois, puros.

Ele se frustra (com razão, várias vezes) quando uma correção é entregue como resolvida sem ter sido validada de verdade, ou quando o mesmo tipo de bug volta depois de "corrigido". Quando frustrado, xinga bastante — isso não muda o rigor técnico nem deve gerar defensividade, só mais cuidado e honestidade sobre incerteza.

## 3. Deploy — topologia e como atualizar

| Peça | Onde | Como atualizar |
|---|---|---|
| Backend | Render (free tier, cold start) | `git push` (auto-deploy da branch `main`) |
| Banco | Supabase | `cd backend && npm run migration:run` manual, sempre que tiver migration nova |
| frontend-cardapio | Vercel `cardapio-saas-beta.vercel.app` (projeto real chamado `cardapio-saas` no painel — "-beta" é só o alias/domínio) | `npx vercel --prod --force` de dentro de `frontend-cardapio/` |
| frontend-admin | Não publicado | `npm run dev` local sempre |

- Repo: `github.com/Fredericrypto/cardapio-saas`. Git sempre da raiz do monorepo; npm sempre da subpasta específica — sempre dizer explicitamente qual.
- Autenticação do GitHub é por **token pessoal** (classic, escopo `repo`), não senha — se der "Invalid username or token", é isso.
- Render precisa da connection string do Supabase em modo **"Transaction pooler"** (porta 6543) — Render não tem saída IPv6. Dev local usa a connection string direta.
- Render é plano grátis: "dorme" depois de um tempo sem requisição. Cron jobs **não rodam com o processo dormindo** — pra algo funcionar de verdade em background independente de qualquer visita, só resolve de vez com um keep-alive externo (ex: UptimeRobot grátis pingando a URL do backend a cada poucos minutos) ou upgrade de plano.

## 4. Convenções fixas — quebrar qualquer uma já causou bug real de produção

- Nome do arquivo do zip sempre com data+hora, nunca reaproveitado. Sempre testar integridade (`unzip -t`) antes de entregar.
- **`frontend-admin` e `frontend-cardapio` usam TypeScript project references** — a ÚNICA checagem válida é `npx tsc -b --noEmit --force` depois de `npm install`. `tsc --noEmit` sozinho sempre reporta "limpo" mesmo com erro real. O `backend` tem tsconfig normal, `tsc --noEmit` simples está certo lá.
- Migration nova ou alterada: sempre listar claramente no handoff que precisa rodar `npm run migration:run` — já aconteceu de esquecer e o deploy quebrar com `column does not exist`.
- **TypeORM**: `@Column()` com `string | null` ou union de string literal precisa de `type: 'varchar'` explícito, ou quebra em runtime na migration, sem o `tsc` acusar nada.
- **Toda entidade TypeORM nova precisa ser registrada em DOIS lugares**: `app.module.ts` (lista de entities do `TypeOrmModule.forRoot`) E `src/config/data-source.ts`. Registrar só via `forFeature` no módulo dono NÃO basta — já causou `EntityMetadataNotFoundError` (um 500 cru) em produção por esquecer isso.
- Dados financeiros/de auditoria: soft-delete só, nunca hard delete. Locks pessimistas sempre em ordem determinística.
- Todo zip entregue vem acompanhado do bloco de comando exato pra aplicar (unzip → rsync com `--exclude` de `.git`/`node_modules`/`.env`/`android` → migration se tiver → git add/commit/push → npm install nos frontends → deploy).
- **Um zip baixado precisa ser DESCOMPACTADO antes do rsync** — rodar rsync direto de `~/Downloads/<nome-do-zip>/` sem descompactar falha silenciosamente e parece "nothing to commit". Isso já causou uma sessão inteira em que nada nunca chegou a ser aplicado de verdade.
- **Marcador de build**: `frontend-admin/src/buildInfo.ts` e `frontend-cardapio/src/buildInfo.ts` exportam um `BUILD_VERSION` (string tipo `'2026-09-19-sessao-r-01'`), mostrado discretamente no rodapé (barra lateral do admin, embaixo de "Sair"; e nas telas do próprio fluxo de mesa no app do cliente). **Bumpar essa string nos dois arquivos em TODA entrega nova** — é o jeito confirmado de saber se um deploy/reload realmente pegou, em vez de adivinhar. Uma aba já aberta no navegador NÃO busca o JS novo sozinha só porque o servidor recebeu um deploy — só depois de um reload de verdade. Sempre fechar o app inteiro e abrir do zero antes de retestar depois de um deploy.
- Nunca mostrar texto cru de erro do servidor pro cliente final — só confiar numa mensagem de erro vinda do backend quando é 4xx (as exceções escritas de propósito, em português simples); qualquer 5xx ou falha de rede vira uma mensagem genérica amigável.
- Endpoints públicos e protegidos de leitura (GET) que servem dado que muda com frequência (tenant, location) levam `Cache-Control: no-store` — sem isso, o navegador já serviu resposta em cache antiga e pareceu bug de dado perdido (não era, o banco sempre esteve certo).

## 5. Arquitetura atual de sessão de mesa (a mais importante — muito retrabalho até chegar aqui)

Depois de muitas rodadas de tentativa e erro (redirecionamento entre abas, telas de "mesa livre", pontos de confiança no localStorage — tudo isso foi removido), o modelo final, **sem nenhum estado do lado do cliente decidindo nada de sessão**:

1. Toda vez que a página de `/mesa/:qrCodeToken` carrega, consulta o backend do zero, só pra aquele token específico — nunca herda nada de outra aba/token.
2. **Sessão ativa encontrada** → se `mesa_ativa_{slug}` (localStorage, só gravado dentro de uma entrada CONFIRMADA de verdade, nunca de passagem) já é esse token, reconhece direto sem perguntar; token diferente → mostra a única confirmação que sobrou ("essa mesa já tem conta aberta, continuar?").
3. **Sem sessão ativa, mas a última fechou há menos de 2 minutos** (`recentlyEnded`, calculado no servidor) → tela final "Sessão encerrada", só com botão de voltar pro cardápio geral, sem nenhum jeito de reabrir ali — e isso é reforçado também DIRETO NO BACKEND (`openOrJoinSession` recusa criar sessão nova nessa janela), não só na tela.
4. **Sem sessão ativa e não recém-encerrada** (mesa genuinamente livre) → entra direto, zero fricção.
5. **Bloqueio entre mesas**: abrir/entrar numa mesa/balcão diferente é bloqueado sempre que o cliente logado tem outra sessão ativa em outro lugar **com pedido de verdade** (seja como quem abriu ou como participante) — uma sessão vazia que ele mesmo abriu em outro lugar é fechada sozinha em vez de bloquear (bloquear até vazia já causou trava total por sobra de teste).
6. Fazer pedido de **Balcão/Entrega com mesa aberta** é bloqueio de verdade agora (`ConflictException`), não só aviso.
7. **Mesa compartilhada**: `TableSessionParticipant` (tabela própria) rastreia quem está presente, atualizado no momento que a pessoa confirma entrar (não só depois do primeiro pedido). Roster do admin e o cupom ("Mesa compartilhada por:") vêm daí. Quem abriu ganha selo "Abriu a mesa". "Sair da mesa" só aparece pra quem se JUNTOU (nunca pra quem abriu) e só enquanto não tiver feito nenhum pedido — depois disso, a única saída é fechar a conta com pagamento.
8. Cashback já é creditado por pedido/por cliente corretamente (confirmado por revisão de código, nunca precisou mudar) — aparece no cupom por pedido junto com quem fez.
9. Botões de ação nessas telas usam a cor do tenant (`primaryColor`) e dizem "Voltar pra minha mesa" (linkando direto via `mesa_ativa_{slug}`) em vez de "cardápio geral" genérico sempre que a mesa ativa é conhecida.
10. Sincronização entre dispositivos usa varredura de fundo a cada 20s (pausada com a aba escondida) enquanto uma sessão está sendo mostrada. WebSocket/push de verdade foi descartado como inviável no Render grátis + Vercel sem um projeto bem maior à parte.
11. Varredura periódica no backend (`@Cron`, a cada 1 minuto) fecha sozinha uma sessão vazia que passou do prazo, mesmo sem ninguém revisitar a página — mas só roda enquanto o processo está acordado (ver limitação do Render grátis acima).

## 6. Sistemas entregues (resumo — detalhe completo nos handoffs de sessão se precisar)

- Fluxo completo de cardápio, carrinho, pedido, cashback, cupom fiscal (mesa/balcão/entrega, com código de autenticidade verificável).
- Painel admin: mesas/balcão/entrega em tempo real (polling), status de pedido com controle de um toque só (etiqueta + botão "avançar", sem dropdown), borda azul piscante por pedido novo (mesa e balcão/entrega), confirmação de pagamento clara ("Receber pagamento").
- Mesa vs Balcão como categorias (`kind` na tabela), QR code com nível de correção de erro reforçado.
- Múltiplas lojas/filiais por tenant (`Location`) — WhatsApp, Telegram e telefone de contato são por LOJA (cada filial tem o seu); Instagram, Facebook, YouTube, TikTok, X, Messenger e Gmail são da MARCA (tenant inteiro).
- Ícones de redes sociais no cardápio do cliente: reconstruídos com dados oficiais verificados do pacote `simple-icons` (não mais desenho à mão) — ver seção 7.
- Horário de funcionamento por dia com suporte a "Fechado" (aparece em vermelho pro cliente), endereço formatado em duas linhas ("Rua X, Bairro" / "Cidade - UF, CEP").
- Sistema de avaliações, cashback/loyalty, histórico com expiração de 7 dias, verificação de conta de cliente.

## 7. Ícones de redes sociais — fonte e ressalvas importantes

Depois de várias tentativas de desenhar os ícones à mão (todas com erro de proporção/cor segundo o Felipe), a solução final foi instalar o pacote npm `simple-icons` (CC0, github.com/simple-icons/simple-icons) e usar os caminhos vetoriais (`d=`) e cores hex REAIS de lá — não mais nada desenhado por mim. Isso está em `frontend-cardapio/src/components/BrandIcons.tsx`.

Duas ressalvas que o próprio Felipe precisa saber (documentadas, não escondidas):
- **Messenger**: a cor oficial verificada hoje é `#0866FF`, igual ao Facebook (a Meta unificou a marca) — não é mais o degradê roxo/rosa antigo.
- **Gmail**: só existe fonte oficial livre/verificada pro envelope clássico (vermelho `#EA4335`), não pro ícone colorido "M" de tela inicial (esse é um asset de loja de app do Google, não um "brand mark" público). Se for importante ter exatamente esse segundo formato, precisa de uma busca específica de fonte oficial do Google — ainda não feita.

**NÃO CONFIRMADO VISUALMENTE ainda** — Claude não consegue renderizar/visualizar SVG pra conferir pixel a pixel antes de entregar. Depois do deploy da sessão R, o Felipe ainda precisa comparar os 9 ícones com os apps de verdade e avisar se algum precisar de ajuste fino de proporção/posição.

## 8. Pendências antigas (nenhuma tocada recentemente — reproduzir antes de mexer)

i18n entre tenants, login com Google no backend, área dedicada de Reclamações, bug de exportação de recibo em PNG no mobile, clique de notificação push não navegando em alguns testes mobile, auditoria geral de CSS mobile, lightbox de foto do restaurante, separação visual "pedido em casa vs no estabelecimento", opção "Agendar retirada", dois bugs antigos de promoção (configuração de localização afetando todas as promoções juntas; promoção sumindo depois de salvar com validade futura) — precisam de passos de reprodução antes de qualquer tentativa de conserto.

## 9. Se algo parecer "consertado mas continua quebrado"

Antes de assumir que o código está errado, nessa ordem:
1. O deploy realmente rodou? (`git log -1`, comparar hash com o GitHub; conferir status "Live" no Render; conferir deployment mais recente na Vercel.)
2. O `BUILD_VERSION` no rodapé bate com o que foi mandado? Se não, o deploy não pegou.
3. O app foi fechado por completo e reaberto do zero (não só dado refresh na mesma aba)?
4. Existe algum `Cache-Control` faltando num endpoint GET que serve dado que muda?
5. Alguma entidade nova foi registrada nos dois lugares (seção 4)?
6. Alguma migration nova ficou pendente de rodar?

Esse roteiro já resolveu a maioria dos "bugs fantasma" reportados ao longo do projeto.
