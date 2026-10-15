# SIOD — Sistema de Inteligência Operacional de Delivery (13/10/2026)

> O SIOD não é um sistema de IA. É uma plataforma de observabilidade operacional baseada em
> snapshots imutáveis e comparação sistemática entre previsão e realidade. Machine Learning é uma
> possível implementação futura da Camada 5, não um requisito. Regra fundamental: nenhum dado
> necessário para explicar uma estimativa futura pode depender de reconstrução posterior.

## O que existe

| Peça | Arquivo |
|---|---|
| Migration `1760000000000-OrderDeliveryIntelligence` | `backend/src/migrations/` |
| Entidade `order_delivery_intelligence` (1:1 com `orders`) | `backend/src/modules/siod/order-delivery-intelligence.entity.ts` |
| Motor determinístico + métricas reais/feedback (funções puras) | `siod/siod.math.ts` |
| Cliente OSRM com fallback Haversine (sem NestJS, testável) | `siod/osrm.client.ts`, `siod/osrm.service.ts` |
| `SIODEngineService` (grava no checkout, fecha no `entregue`) | `siod/siod-engine.service.ts` |
| Carimbos do ciclo de vida do pedido | `orders/order-lifecycle.ts` (+ colunas em `orders`) |
| Testes (52 verificações, sem banco) | `backend/test/siod-audit.ts` → `npm run test:siod` |

Colunas novas: `orders.preparing_at/ready_at/delivered_at`, `tenants.siod_settings` (jsonb, nunca vai
para o cliente: removida em `toPublicTenant`).

## Fluxo

1. **Checkout (`OrdersService.create`, só `orderType = 'entrega'`)**: depois da geocodificação e FORA da
   transação, `OSRMService` calcula a rota (timeout 3 s). Dentro da transação, em SAVEPOINT e sem lançar,
   `SIODEngineService.recordOrderEstimate` conta a fila, roda o motor e grava a linha imutável. Falha no
   SIOD nunca derruba o pedido (só log).
2. **Ciclo de vida**: `stampOrderLifecycle` carimba `preparing_at`/`ready_at`/`delivered_at` em
   `updateStatus` e `concludeWithPayment`. Só na transição; `preparando`/`pronto` guardam a primeira vez.
3. **Entregue**: `finalizeOnDelivered` valida a linha do tempo e grava `actual*Seconds` e o erro de previsão.

## Motor (v1-heuristica-base)

```
ativos        = pendentes + em preparo (no instante do checkout, na mesma loja, todos os tipos de pedido)
prep_bruto    = base + ativos × penalidade
multiplicador = 1 + (ativos − limiar) × passo, limitado ao teto (1,00 até o limiar)
prep          = ceil(prep_bruto × multiplicador)
rota          = max(1, ceil(segundos_rota / 60))
total         = max(prep + rota, piso)      // a folga do piso entra no preparo: prep + rota = total
janela        = [max(piso, total − abaixo), total + acima]
```

Padrões: base 20 min, penalidade 2 min/pedido, piso 15 min (estrutural, não configurável abaixo),
janela −5/+10, limiar de pico 6 pedidos, passo 0,10, teto 1,50. Por restaurante, `tenants.siod_settings`:

```json
{ "basePrepMinutes": 25, "queuePenaltyMinutesPerOrder": 3, "minTotalMinutes": 20,
  "windowBelowMinutes": 5, "windowAboveMinutes": 10,
  "peakThresholdActiveOrders": 6, "peakStepPerOrder": 0.1, "peakMaxMultiplier": 1.5 }
```
Campo ausente/inválido = padrão; fora da faixa é limitado (`resolveSiodParams`). Não há tela nem endpoint
para editar (ver pendências): hoje é via banco.

Fila: `pendente` + `confirmado` = PENDING; `preparando` = PREPARING. Não contam `aguardando_pagamento`,
`pronto`, `entregue`, `cancelado` nem pedidos com `deleted_at`.

## Rota

`OSRM_URL` (padrão `https://router.project-osrm.org`; trocar por container próprio é só mudar a variável) e
`OSRM_TIMEOUT_MS` (padrão 3000, limitado a 500–10000). Qualquer falha (timeout, HTTP ≠ 2xx, JSON inválido,
`NoRoute`, rede) → Haversine × 1,3 a 25 km/h, `route_provider = 'HAVERSINE'`, `route_fallback_used = true`,
motivo em `engine_payload_json.route.fallbackReason`.

## Confiança

`LOW` se a rota veio do fallback; senão `MEDIUM` se há pico ou fila moderada (ativos × 2 ≥ limiar); senão `HIGH`.

## `metrics_status`

- `MISSING_DATA` (estado inicial): falta algum carimbo (ex.: concluído direto da fila) ou o pedido ainda não terminou.
- `INVALID_TIMESTAMPS`: `preparing_at < created_at`, `ready_at < preparing_at` ou `delivered_at < ready_at`.
  Nenhuma exceção; as métricas derivadas ficam nulas.
- `VALID`: `actual_*_seconds` e `prediction_*` preenchidos. Erro positivo = demorou mais que o estimado.

## Consultas úteis

```sql
-- Erro médio absoluto por restaurante e versão do motor (só medições válidas)
SELECT tenant_id, estimation_version, count(*) AS pedidos,
       round(avg(prediction_absolute_error_minutes), 2) AS mae_min,
       round(avg(prediction_error_minutes), 2) AS vies_min
  FROM order_delivery_intelligence
 WHERE metrics_status = 'VALID'
 GROUP BY 1, 2;

-- Quanto do histórico usou o fallback
SELECT route_provider, count(*) FROM order_delivery_intelligence GROUP BY 1;
```

## Pendências e limites conhecidos

- `actual_total_seconds = delivered_at − created_at` (como especificado). Em pedido Pix, `created_at` é anterior
  ao pagamento, então o tempo de espera do Pix entra no total real.
- Só pedidos de **entrega** geram registro. Mesa e balcão recebem os carimbos de ciclo de vida pelos fluxos
  que passam por `updateStatus`/`concludeWithPayment`; o fechamento de conta de mesa (`TablesService`) não carimba.
- Sem tela/endpoint para editar `siod_settings` e sem tela de análise do erro de previsão.
- O OSRM público é um servidor de demonstração (sem SLA); para produção, use um container próprio.
- A distância de OSRM (`distance_km`) é a de rota por ruas; `orders.delivery_distance_km` (taxa de entrega)
  continua sendo a linha reta e NÃO foi alterada.

## Aba "Entregas" (visualização e configuração)

Menu **Entregas** (`/entregas`, painel admin). Três abas: **Visão geral**, **Pedidos** e **Parâmetros**.

**Permissões** (reaproveita o catálogo, sem permissão nova nem migration): ver tudo = `analytics:view`;
salvar/restaurar parâmetros = `settings:manage` (Gerente só vê; Administrador edita).

**API** (`/siod`, sempre escopada ao restaurante do token; `Cache-Control: no-store`):

| Rota | Permissão | O que faz |
|---|---|---|
| `GET /siod/settings` | analytics:view | parâmetros em vigor, padrões, limites e rótulos |
| `PUT /siod/settings` | settings:manage | salva o conjunto COMPLETO (8 campos), validação estrita campo a campo (400 com mensagens em português) |
| `DELETE /siod/settings` | settings:manage | volta ao padrão (`siod_settings = NULL`) |
| `GET /siod/overview?period=&from=&to=&locationId=` | analytics:view | contagens, precisão, etapas, série, quebras e sugestões |
| `GET /siod/orders?...&recordClass=&confidence=&provider=&page=&pageSize=` | analytics:view | lista paginada (máx. 100 por página) |

**Classes de registro** (partição: todo pedido de entrega cai em exatamente uma): `valid` (medido), `invalid`
(horários contraditórios, ou VALID sem métricas), `skipped` (entregue sem passar por preparo/pronto),
`in_progress`, `cancelled`. Só `valid` entra na precisão. Pedidos com soft-delete continuam contados.

**Precisão** (somente `valid`): viés = média de (real − prometido); erro absoluto médio, mediana e p90;
"dentro da janela" = real entre o mínimo e o máximo prometidos, **inclusive** nos dois limites.
"Preparo" real = do pedido até ficar pronto (inclui a espera na fila), que é o que o motor estima; a cozinha
(preparando → pronto) aparece separada. No Pix a espera do pagamento entra no tempo total (há quebra por pagamento).

**Sugestões** (só com 30+ pedidos comparáveis; nunca aplicadas sozinhas): preparo base = mediana do tempo
pedido→pronto em pedidos com cozinha vazia, sem pico e sem piso; minutos por pedido = mediana de
`((pedido→pronto) − base usada) / fila` em pedidos com fila, sem pico e sem piso. Sempre dentro dos limites.

**Limites** (fonte única `SIOD_PARAM_LIMITS` em `siod.types.ts`, usada pelo motor e pela validação): preparo base
0–240, min/pedido 0–60, prazo mínimo 15–480 (nunca < 15), janela −0–60 / +0–120, limiar de pico 1–200,
acréscimo por pedido 0–1 (2 casas), teto de pico 1–3 (2 casas).

Testes: `npm run test:siod-insights` (backend, Postgres de teste obrigatório; apaga os dados) e
`npm run test:logic` (frontend-admin; inclui paridade formulário × servidor).
