# AUDITORIA DE PROMOÇÕES — relatório parcial (Fase A) — 2026-10-20

Base: leitura estática de `contexto-promocoes-20261019.txt` (216 arquivos). Nada foi executado: sem tsc, vite build, testes, Postgres ou navegador. Nenhum patch foi aplicado. A auditoria NÃO está 100% concluída (ver "Não verificado").

## 1. Mapa (arquivo -> papel)

Backend
- `promotions/promotion.entity.ts` — promoção (escopo all/category/product, lojas, limites, janela, teto, reset).
- `promotions/promotions.service.ts` — CRUD admin, lista pública, motor de desconto (`validateSelectedPromotions` / `claimEligibleCents`), limites, reset, `recordRedemption` / `releaseRedemption`.
- `promotions/promotions.controller.ts`, `dto/create|update-promotion.dto.ts` — rotas e validação.
- `promotions/order-promotion-discount.entity.ts` — quanto cada promoção descontou em cada pedido (fonte do total do painel).
- `promotions/promotion-customer-reset.entity.ts` — reset individual de uso.
- `orders/orders.service.ts` (`create`, `markCancelled`, `checkPixStatus`, `findAll`) — chama o motor dentro da transação, grava `discount_amount`, `promotion_ids`, snapshots; cancelamento devolve uso.
- `orders/dto/create-order.dto.ts` — payload (`promotionIds`, `items`, `useCashback`).
- `orders/order.entity.ts` — colunas `discount_amount`, `promotion_id(s)`, `promotion_title(s)_snapshot`.
- `analytics/analytics.service.ts` (+ `analytics.types.ts`) — DRE; desconto = `SUM(discount_amount)` só de pedidos válidos.
- `tables/tables.service.ts` — não aplica desconto; usa o `total` já líquido gravado no pedido.
- `cashback/cashback.service.ts` — base de ganho = total líquido de promoção e cashback usado, sem taxa de entrega.
- Migrations: AddPromotions, ScopeAndUsageLimits, DiscountCapAndLocations, EligibleQuantityAndCustomerReset, RecomputeRedemptionCount, GlobalUsageReset, ClearOrphanedMaxEligibleQuantity, MultiplePromotionsToOrders, OrderPromotionDiscounts.

Frontend-cardapio
- `lib/promotionEligibility.ts` — espelho do motor (preview) + `pickItemPromotion`.
- `hooks/useItemPromotions.ts` — fonte única do preço promocional por item (só promoções em `selectedPromotionIds`).
- `contexts/CartContext.tsx` — carrinho e `selectedPromotionIds`, persistidos em localStorage por tenant+cliente.
- `pages/MenuPage`, `CategoryProductsPage`, `PromotionExplorePage`, `PromotionDetailPage`, `ProductDetailPage`, `CartPage` — consumo.
- `components/PromoCards`, `ProductCard`, `promotion/*` — exibição.
- `lib/menu-api.ts` (`fetchActivePromotions`, `createOrder`).

Frontend-admin
- `pages/PromotionsSettingsPage.tsx` — lista, formulário, reset, resgates.
- `types/analytics.ts`, `components/analytics/*`, `lib/analyticsExport.ts` — Análise.

## 2. Achados

| Id | Sev. | Onde | Descrição | Causa raiz |
|---|---|---|---|---|
| P-01 | Alto | `CartContext.tsx` (persistência + `setCartOwner`), `PromotionExplorePage.tsx:166-172`, `useItemPromotions.ts` | Promoção aparece aplicada ao abrir o app sem ação na sessão. | `selectedPromotionIds` é gravado no localStorage por tenant+cliente e reidratado no login/reload, sem validade, sem conferir contra a lista ativa e sem aviso. Entrar na tela "Explorar promoção" já ativa a promoção sozinho. Com a promoção ativada, `useItemPromotions` mostra preço promocional em todos os cards na abertura e o carrinho aplica. Ids antigos ficam guardados e reativam sozinhos se a promoção voltar (troca de unidade, reativação, nova janela). |
| P-02 | Alto | `promotions.service.ts:736-744` + `orders.service.ts:793-1264` | Limite "por cliente" furável por concorrência. | Contagem de usos é um SELECT sem lock em transação READ COMMITTED, e não há índice único. Dois POSTs simultâneos do mesmo cliente (duas abas, retry, replay) passam os dois. |
| P-03 | Médio | `orders.service.ts:182-196` (`markCancelled`) | Devolução de uso pode rodar 2x. | A guarda é `order.status === 'cancelado'` na entidade em memória. Poll do cliente, poll do painel e webhook podem carregar o mesmo pedido antes de qualquer um salvar. Cada um chama `releaseRedemption`. Também roda fora da transação que salva o pedido. Afeta `redemption_count` (teto legado e "N usados"). Dinheiro e cashback não são afetados (cashback tem guarda própria). |
| P-04 | Médio | `CartContext.tsx` (`loadPersistedCart`), `CartPage.tsx` | Carrinho persistido guarda snapshot de produto (preço, promoPrice, disponibilidade) e nunca é reconciliado. | Total e desconto do carrinho usam preço antigo. O servidor cobra o preço atual, então a divergência só aparece depois do envio. Item indisponível gera erro com UUID cru do produto (`orders.service.ts:816-819`). |
| P-05 | Médio | `promotions.service.ts:644` | Promoção sem alvos (produtos/categorias removidos) não pode nem ser desativada. | `assertScopeHasTargets` roda em todo `update`, inclusive `{ isActive: false }`. No admin, `handleToggleActive` não tem try/catch: falha silenciosa. |
| P-06 | Médio | `promotions.service.ts:454-458`, relação `locations` | A verificar: loja removida alarga o escopo. | Se uma promoção só vale na loja X e X sai da relação (soft-delete ou remoção), `locations` vira vazio e `isValidAtLocation` interpreta como "vale em todas". Não confirmado: `location.entity.ts` não foi coletado. |
| P-07 | Médio | `promotionEligibility.ts:362-366` | Menu mostra preço promocional ignorando pedido mínimo; carrinho/servidor cobram cheio se o mínimo não bate. | Decisão de produto documentada no código ("estímulo visual"). Divergência exibido x cobrado até o mínimo ser atingido. Precisa de decisão (D3). |
| P-08 | Baixo | `create-order.dto.ts`, `create/update-promotion.dto.ts` | Faltam limites de entrada. | `quantity` sem `@Max` (valor enorme estoura `numeric(10,2)` e vira 500), `items` e `promotionIds` sem `@ArrayMaxSize`, `tipAmount` sem teto, `discountValue` fixo sem teto, `endsAt < startsAt` aceito (promoção nunca vale, sem erro). |
| P-09 | Baixo | `promotions.service.ts:135-143` x `analytics.service.ts:44,184` | Total "descontado" do painel inclui pedidos `aguardando_pagamento`; a Análise só conta pedidos válidos. | Duas definições de "pedido que conta". Diverge temporariamente enquanto há Pix pendente. |
| P-10 | Baixo | `promotions.service.ts:761-767` x `previewItemPromotion` | Arredondamento: backend arredonda sobre o total elegível; o preview por item arredonda por unidade. | Pode dar 1 centavo de diferença entre "preço unitário x qtd" e o desconto do carrinho. Só preview; o servidor é a autoridade e o carrinho usa o mesmo motor. |
| P-11 | Baixo | `promotions.controller.ts:36-45` | `GET /promotions/public/:tenantId` sem `ParseUUIDPipe` (id inválido gera 500); nenhum `Cache-Control: no-store` visto. | `main.ts` não foi coletado; cache global não verificável. |
| P-12 | Info | `analytics.service.ts:253` | `date_trunc('${g}', ...)` interpola `granularity`. | Seguro só se `resolveRange` devolver sempre `hour|day|month`; `analytics.range.ts` não foi coletado. |
| P-13 | Info | Bugs antigos | (1) Unidade afetando todas as promoções e (2) sumir após salvar com validade futura: não reproduzidos por leitura. | (2): o ciclo local-ISO do admin está correto; no cardápio público a promoção fica oculta até `startsAt` por desenho (`isWithinWindow`). Nenhum caminho do código a esconde do admin. (1): uma busca sem `locationId` só esconde promoções restritas a loja; o código protege contra a corrida de busca. Precisa de reprodução real ou do diagnóstico SQL abaixo. |
| P-14 | Info | Mesa | Pedido mínimo e limite por cliente valem por PEDIDO (rodada), não por sessão de mesa; convidado sem login não usa promoção limitada. | Regra de negócio a documentar. |

## 3. Verificado e CORRETO (leitura de código)

- O servidor recalcula tudo: preço e opções vêm do banco; promoção revalidada por tenant, ativa, janela, loja, mínimo, limite por cliente; cliente só envia ids.
- Itens fora da seleção do admin não recebem desconto no backend (`matchingWorkingLines`) nem no preview (`isProductCoveredByPromotion` única), nem no hook de preço.
- Sem desconto duplo na mesma unidade entre promoções (`remainingQty`). Desconto nunca passa do elegível. Percentual sempre tem teto em R$.
- Centavos inteiros; `total = itens - descontos + entrega - cashback` (gorjeta fora). `discount_amount` é a soma de `order_promotion_discounts`.
- Cancelamento tira o pedido do total do painel e do bruto da Análise; cashback tem guarda `cashbackLocked`.
- Queries de promoção, pedidos e Análise parametrizadas. Busca do histórico usa bind param (só curingas `%`/`_` do usuário passam, sem injeção).
- RBAC `promotions:view` / `promotions:manage` nas rotas admin; `tenantId` em todos os finds; categorias, produtos e lojas validados por tenant ao salvar.
- Não existe endpoint de "digitar código de cupom": não há superfície de força bruta de cupom.
- Resposta pública da promoção não expõe custo nem dado interno.

## 4. Regras de negócio atuais (a consolidar após as decisões)

- Elegibilidade: `scope` all = tudo; category = produtos das categorias; product = produtos escolhidos. Pedido mínimo olha o carrinho inteiro, sem considerar o que outros cupons já usaram.
- Prioridade entre promoções: ordem de seleção do cliente. A primeira reivindica a unidade e a seguinte só vê o que sobrou.
- `maxEligibleQuantity`: as N unidades mais caras do que sobrou.
- Desconto: percentual = `round(elegível * % / 100)` limitado pelo teto; fixo = `min(valor, elegível)`.
- Cashback usado entra depois de promoção e entrega. Cashback ganho = `total - entrega`, pago só após confirmação.
- Cancelamento: devolve uso e cashback usado (se não travado).

## 5. Diagnóstico somente leitura (produção) — rodar no banco, não altera nada

```sql
-- P-06 / bug 1: promoções restritas a lojas e se alguma loja sumiu
SELECT p.id, p.title, p.is_active, p.starts_at, p.ends_at,
       count(pl.location_id) AS lojas_vinculadas,
       count(l.id) FILTER (WHERE l.deleted_at IS NULL) AS lojas_vivas
FROM promotions p
LEFT JOIN promotion_locations pl ON pl.promotion_id = p.id
LEFT JOIN locations l ON l.id = pl.location_id
WHERE p.deleted_at IS NULL
GROUP BY p.id ORDER BY p.created_at DESC;

-- P-02: clientes que já passaram do limite por cliente
SELECT o.customer_id, p.id AS promotion_id, p.title, p.usage_limit_per_customer, count(*) AS usos
FROM orders o
JOIN promotions p ON p.id = ANY(o.promotion_ids)
WHERE o.status <> 'cancelado' AND o.customer_id IS NOT NULL AND p.usage_limit_per_customer IS NOT NULL
GROUP BY 1,2,3,4 HAVING count(*) > p.usage_limit_per_customer;

-- P-03: contador de usos x pedidos reais
SELECT p.id, p.title, p.redemption_count,
       (SELECT count(*) FROM orders o WHERE p.id = ANY(o.promotion_ids) AND o.status <> 'cancelado') AS reais
FROM promotions p WHERE p.deleted_at IS NULL;

-- Invariante de dinheiro: total = itens - desconto + entrega - cashback
SELECT o.id, o.total,
       (SELECT coalesce(sum(subtotal),0) FROM order_items i WHERE i.order_id = o.id) - o.discount_amount + o.delivery_fee - o.cashback_used AS esperado
FROM orders o
WHERE abs(o.total - ((SELECT coalesce(sum(subtotal),0) FROM order_items i WHERE i.order_id = o.id) - o.discount_amount + o.delivery_fee - o.cashback_used)) > 0.005;
```

## 6. Não verificado

Nada foi executado. Arquivos que faltam: `main.ts`, `analytics.range.ts`, `customers-auth.service.ts`, `common/utils/money.ts`, `locations/location.entity.ts`, `orders/dto/update-order-status.dto.ts`, `tenants/tenant-cache`. Não auditado a fundo: `CloseSessionModal`, fluxo de fechamento de conta da mesa, recibo no cliente, exportação CSV/XLSX, "Pix pendente reverte sessão" (limite já conhecido).

## 7. Próximos patches (ordem proposta; nenhum aplicado)

1. Backend: lock por promoção (ordem determinística) antes de contar uso, em `validateSelectedPromotions` (P-02).
2. Backend: `markCancelled` com claim atômico (`UPDATE ... WHERE status <> 'cancelado'`) e devolução só para o vencedor (P-03).
3. Cardápio: reconciliar promoções persistidas e itens do carrinho com o servidor ao carregar; regra de ativação conforme D1 (P-01, P-04).
4. Backend: DTO com limites, `ParseUUIDPipe`, `startsAt <= endsAt`, `assertScopeHasTargets` só quando alvos/escopo mudam; admin com tratamento de erro no toggle (P-05, P-08, P-11).
5. `backend/test/promotions-audit.ts` + entrada em `test:all`, `docs/AUDITORIA-PROMOCOES-<data>.md` final.

## Achados adicionais (registrados após a revisão arquitetural do Patch 1)

| ID | Achado | Onde | Gravidade | Tratamento |
|---|---|---|---|---|
| P-15 | Cobrança Pix órfã: `createPixPayment` roda DENTRO da transação do pedido; qualquer falha posterior faz rollback do pedido, mas a cobrança no Mercado Pago continua válida (cliente pode pagar sem pedido). | orders.service.ts create (passo MP) | Alta (dinheiro) | Caracterizado no teste (ABERTO). Correção estrutural = recomendação futura (commit do pedido, Pix fora da transação, atualizar payload; falha cancela via markCancelled). NÃO faz parte do Patch 1. |
| P-16 | Ausência de Idempotency-Key: a mesma requisição repetida cria pedidos duplicados (só promoções com limite barram). | POST /orders | Média | Documentado no teste (nota). Exige decisão de API (cabeçalho + tabela de chaves). Fora do Patch 1. |
| P-17 | Deadlock potencial: `recordRedemption` em `Promise.all` na ordem escolhida pelo cliente; [A,B] e [B,A] concorrentes travam linhas em ordem oposta. | orders.service.ts ~1256 | Média | Reproduzido no teste (P-17). Corrigido no Patch 1 v2 (ordenar por promotionId em recordRedemption e release). |
| P-18 | Corrida com `cashbackLocked`: `markCancelled` decide a devolução de cashback com cópia em memória do pedido; se o pagamento travou o cashback no meio, devolve cashback de pedido já pago. | orders.service.ts markCancelled | Média | Caracterizado no teste (ABERTO). Fora do Patch 1 (patch próprio: reler `cashback_locked` no claim). |
