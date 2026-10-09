# Auditoria geral Z6-07 (09/10/2026)

Base auditada: `cardapio-saas-COMPLETO-2026-10-08-2315` (z6-05) + patch `z6-06` aplicado por cima.
BUILD_VERSION dos dois frontends: `2026-10-09-sessao-z6-07`. **Nenhuma migration nova.**

## Verificado (ambiente limpo, Postgres 16 real, 65 migrations)
- `tsc` limpo: backend (`tsc --noEmit`), frontend-admin e frontend-cardapio (`tsc -b --noEmit --force`).
- `nest build` gera `dist/main.js` (raiz de saída correta); `vite build` limpo nos dois frontends.
- `npm run test:all`: 333 verificações, 0 falhas (backup 57+66, horário 10, cashback 14, notas 32, push 6, Análise 79, RBAC 47, notificações 22).
- `test:logic` dos dois frontends: verde. `docs/testes-e2e/test_api_leaks.py` contra o backend de verdade: 19/19.
- Regra 26: `frontend-cardapio` não referencia custo/CMV/taxas em nenhum arquivo; rotas públicas (produtos, promoções, categorias, lojas, cashback, fidelidade, avaliações, status do Pix, resposta de criação de pedido) varridas por HTTP real sem vazamento; `unit_cost` segue `select: false`.
- Entidades: todas as 37 registradas em `app.module.ts` e `config/data-source.ts`. Rotas sem guard são só as `public/…`, login/registro e health.

## Falhas encontradas e corrigidas neste patch
1. **Laço de redirecionamento no navegador embutido do Instagram** (`api/share.ts` + `vercel.json`). O User-Agent do app contém "Instagram", cai na regra de robô, a página de preview faz `location.replace` para o mesmo link e a regra reescreve de novo, sem fim. Correção: o redirecionamento leva `?app=1` e os dois rewrites de robô têm `missing` para essa query. `canonical`/`og:url` continuam sem o parâmetro. Teste novo em `test/share.test.ts`.
2. **Host sem validação em `api/share.ts`**: `x-forwarded-host` ia direto para `og:url`, `canonical` e o redirecionamento. Agora só aceita nome de host válido (senão 400). Teste novo.
3. **Regra 23 (sem emoji) violada em 14 pontos**: recibos (admin e cardápio, 4 arquivos), `VerifyReceiptPage`, `DashboardPage` (2), `CartPage` (cupom aplicado x4, cashback estimado). Trocados por ícones Lucide de traço fino (`strokeWidth` 1.5) ou texto limpo. O `★` do filtro de notas de `ReviewsPage` foi mantido (glifo de texto da nota, não emoji).
4. **Tipos**: `noImplicitAny` estava `false` no backend; ligado (0 erros). `dto.presetId as any` virou `as PresetAvatarId`; `buildFormattedAddress(feature: any)` ganhou a interface `LocationIqFeature` (e `response.json()` passou a `unknown`).

## Pendências que NÃO foram alteradas (decisão do Felipe ou fora do alcance)
- **Calculadora de Gestão (z6-04)**: os arquivos novos (`ManagerCalculatorPage`, `ManagerCalculatorContext`, `lib/calculator/*`) não vieram em nenhum zip, então ela não foi auditada. O script `integrar-calculadora.py` (correção z6-04b) só funciona se esses arquivos já estiverem no repositório; sem eles o `tsc` acusa 6 TS2307. Ele também grava `BUILD_VERSION = '2026-10-08-sessao-z6-04'` e **rebaixa** a versão se rodar depois do z6-06. Rode-o apenas antes de aplicar este patch, ou rebumpe depois.
- **Filtros do Histórico**: "Pendentes / Em preparo / Prontos" sempre mostram 0, porque `HistoryService.findHistory` só devolve status terminais. Foram pedidos explicitamente; decidir se somem ou se o histórico passa a incluir pedidos em andamento.
- 14 `catch (err: any)` no admin e no cardápio e 3 `as any` em `tables.service.ts` (opções de `find` do TypeORM) continuam: funcionam, são dívida de tipagem sem risco de runtime.
- O backup nunca foi testado contra o Supabase Storage real (já documentado no handoff, seção 28).
