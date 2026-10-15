-- =====================================================================
-- MEDIÇÃO DE EGRESS — Supabase > SQL Editor
-- REGRA DE OURO: o SQL Editor mostra só o resultado da ÚLTIMA consulta
-- que rodar. Por isso: abra uma "New query" para CADA consulta abaixo,
-- cole UMA, clique em Run, copie o resultado. Nunca cole duas juntas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- CONSULTA 1 — RESUMO (a principal). Devolve 3 linhas: pedidos, produtos, TOTAL.
-- ---------------------------------------------------------------------
with j as (
  select (select stats_reset from pg_stat_statements_info) as desde,
         greatest(extract(epoch from (now() - (select stats_reset from pg_stat_statements_info))) / 3600, 0.01) as horas
),
alvo as (
  select case when query ilike '%from "orders"%' or query ilike '%from orders%'
              then 'pedidos' else 'produtos' end as grupo,
         calls, rows
  from pg_stat_statements
  where query ilike '%from "orders"%'   or query ilike '%from orders%'
     or query ilike '%from "products"%' or query ilike '%from products%'
)
select coalesce(a.grupo, 'TOTAL')                                         as grupo,
       sum(a.calls)::bigint                                               as chamadas,
       sum(a.rows)::bigint                                                as linhas,
       round(sum(a.rows)::numeric / nullif(sum(a.calls), 0), 1)           as linhas_por_chamada,
       round((sum(a.calls) / j.horas)::numeric)                           as chamadas_por_hora,
       round((sum(a.rows)  / j.horas)::numeric)                           as linhas_por_hora,
       to_char(j.desde at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as medindo_desde_horario_brasil,
       round(j.horas::numeric, 2)                                         as horas_de_medicao
from alvo a cross join j
group by rollup(a.grupo), j.desde, j.horas
order by (a.grupo is null), a.grupo;


-- ---------------------------------------------------------------------
-- CONSULTA 2 — AS 10 CONSULTAS MAIS PESADAS (detalhe)
-- ---------------------------------------------------------------------
select left(regexp_replace(query, '\s+', ' ', 'g'), 110)          as consulta,
       calls                                                      as chamadas,
       rows                                                       as linhas,
       round(rows::numeric / nullif(calls, 0), 1)                 as linhas_por_chamada
from pg_stat_statements
where query ilike '%from "orders"%'   or query ilike '%from orders%'
   or query ilike '%from "products"%' or query ilike '%from products%'
order by rows desc
limit 10;


-- ---------------------------------------------------------------------
-- CONSULTA 3 — TAMANHO E CRESCIMENTO DOS PEDIDOS (para o ADR / roadmap)
-- ---------------------------------------------------------------------
select (select count(distinct tenant_id) from orders where deleted_at is null)           as restaurantes_com_pedidos,
       (select count(*)                  from orders where deleted_at is null)           as pedidos_total,
       (select min(created_at)           from orders where deleted_at is null)           as primeiro_pedido,
       (select max(created_at)           from orders where deleted_at is null)           as ultimo_pedido,
       round((select count(*) from orders where deleted_at is null)::numeric
             / greatest(extract(epoch from ((select max(created_at) from orders where deleted_at is null)
                                          - (select min(created_at) from orders where deleted_at is null))) / 86400, 1), 1) as pedidos_por_dia,
       (select round(avg(pg_column_size(o))) from orders o where o.deleted_at is null) as bytes_medios_por_pedido,
       (select count(*)                      from order_items)                         as itens_total,
       (select round(avg(pg_column_size(i))) from order_items i)                       as bytes_medios_por_item;


-- ---------------------------------------------------------------------
-- ZERAR AS ESTATÍSTICAS (só quando o protocolo mandar). Anote o horário que ele devolve.
-- ---------------------------------------------------------------------
select pg_stat_statements_reset();
