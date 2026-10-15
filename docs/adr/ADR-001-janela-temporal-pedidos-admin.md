# ADR-001 — Janela temporal para a lista de pedidos do painel (GET /orders)

- Status: PROPOSTO (não implementado; entrar no roadmap)
- Data: 2026-10-15
- Contexto técnico: backend NestJS + TypeORM + Supabase (plano free) + Render (plano free)

## Problema
`GET /orders` (painel admin, polling de 5 s) devolve TODOS os pedidos do restaurante, com itens e cliente,
sem limite nem filtro de data. O payload cresce linearmente com o histórico e nunca encolhe.
O cache por restaurante (z6-23/z6-24) reduz quantas vezes o banco é consultado, mas NÃO reduz o tamanho de cada carga.

## Números (premissas — medir com a CONSULTA 3 de scripts/medir-egress.sql)
- Peso estimado: ~1,75 KB por pedido (≈ 700 B/linha × ≈ 2,5 linhas por pedido, de pg_stat_statements).
- Teto de 60 s do cache: 1.440 recargas completas por dia com o painel aberto 24 h.

| Pedidos/dia | Histórico em 6 meses | Em 1 ano | Egress/dia só da recarga de 60 s (6 m) | (1 ano) |
|---|---|---|---|---|
| 30  | 5.460 pedidos ≈ 9,6 MB  | 10.950 ≈ 19 MB | ≈ 13,8 GB | ≈ 27,6 GB |
| 100 | 18.200 pedidos ≈ 32 MB  | 36.500 ≈ 64 MB | ≈ 46 GB   | ≈ 92 GB   |

Limite do plano free: 5 GB/mês (≈ 167 MB/dia). Antes de chegar a 6 meses o limite já estoura: o ponto de
equilíbrio da recarga de 60 s sozinha é um payload de ~116 KB (≈ 66 pedidos).
Além do egress: o navegador baixa e interpreta esse JSON a cada mudança, o Node trava no `JSON.stringify`,
e o cache guarda o objeto inteiro nos 512 MB do Render grátis.

## Opções
1. Paginação clássica (offset/limite): simples, mas o painel precisa dos pedidos ATIVOS sempre à vista — paginar esconde pedido aberto.
2. Histórico em tabela separada / arquivamento: custo alto (migração, dois caminhos de leitura); só se justifica com milhões de linhas.
3. Janela temporal + histórico por cursor (RECOMENDADA).

## Decisão recomendada
- `GET /orders` passa a devolver a JANELA OPERACIONAL: todos os pedidos em andamento (qualquer idade) + os finalizados nas últimas 24–48 h.
- Nova rota `GET /orders/history?cursor=&limit=` (ordem por data decrescente, cursor por `created_at,id`) para tela de histórico, relatórios e busca.
- Cache e fingerprint continuam iguais, agora sobre a janela (payload limitado e previsível: dezenas de KB, não MB).
- Alerta `payload_growth` do /internal/cache-stats (> 2 MB) é o gatilho de segurança até lá.

## Consequências
- Positivas: payload constante independente da idade da conta; egress e memória previsíveis; painel mais leve.
- Custos: ajustar frontend-admin (Dashboard, Histórico, Analytics) para usar a rota de histórico; definir o que conta como "em andamento".
- Riscos: telas que hoje somam métricas sobre a lista completa precisam consultar agregados no servidor.
- Pré-requisito: medir antes (CONSULTA 3) e confirmar quais telas consomem GET /orders.
