# Plano de testes: promotions-audit.ts (Patch 1: P-02 + P-03)

Arquivo: backend/test/promotions-audit.ts  |  Script: `npm run test:promotions` (também em `test:all`)

## Segurança
- `assertTestDatabase()` na carga: recusa (exit 2) se o nome do banco em DATABASE_URL não contém "test".
- Faz `TRUNCATE tenants CASCADE`. Nunca rodar no Supabase de produção.
- Exige todas as migrations aplicadas no banco de teste.
- Usa código REAL de OrdersService / PromotionsService / CashbackService contra Postgres real. Stub só de rede: Mercado Pago, push, entrega, mesas, SIOD.

## Rodar o teste VERMELHO (código atual, sem patch)
```
cd ~/Projetos/cardapio-saas/backend
DATABASE_URL=postgres://USUARIO:SENHA@HOST:5432/cardapio_test npm run test:promotions
```
Windows PowerShell: `$env:DATABASE_URL="postgres://.../cardapio_test"; npm run test:promotions`
Exit code: 0 tudo ok | 1 há FALHOU | 2 banco recusado | 3 erro de ambiente/seed (resultado inconclusivo, não é bug).
Registrar a saída inteira: `... npm run test:promotions 2>&1 | tee ~/backups/promotions-audit-VERMELHO.txt`

## Como a concorrência é simulada
- Chamadas paralelas reais: `Promise.allSettled` sobre o pool do pg; cada `create()` abre a própria transação em outra conexão (8 paralelos, abaixo do pool padrão de 10).
- Janela de corrida alargada de forma determinística: spy em `recordRedemption` espera 150 ms entre "validou o limite" e "commit". Sem trava, todos leem a mesma contagem.
- Deadlock: o spy atrasa 250 ms a SEGUNDA promoção de cada transação; [A,B] e [B,A] seguram uma linha cada e pedem a do outro.
- Cancelamento: N cópias distintas do mesmo pedido em memória (como chamadores reais: poll do cliente, poll do admin, webhook) + barreira em `reverseConsumptionForOrder` para juntar todos antes da devolução.

## Cenários, falha esperada ANTES e evidência esperada
(PREVISÃO a partir da leitura do código e dos experimentos em SQL; o que vale é a saída real que você rodar.)

| Cenário | Achado | Prova | ANTES do patch | DEPOIS |
|---|---|---|---|---|
| P-02a | P-02 | limite 1/cliente, 8 pedidos paralelos, mesmo cliente | FALHOU: `pedidos_com_a_promo=8 linhas_opd=8 redemption_count=8` | OK: 1 pedido, 7 recusas 409 |
| P-02b | P-02 | teto global 1, 8 clientes | FALHOU: `redemption_count=8` (teto 1) | OK: 1 pedido, restantes 4xx |
| P-02c | controle | clientes distintos / promo sem limite não se serializam | OK | OK |
| P-02d | controle | replay sequencial com limite 1 recusado | OK | OK |
| P-02e | controle | falha injetada libera trava, nenhum advisory lock órfão, uso não consumido | OK (locks=0 trivial) | OK |
| P-16 | P-16 | mesma requisição 2x sem limite cria 2 pedidos | só nota (sem Idempotency-Key) | só nota |
| P-17 | P-17 | [A,B] x [B,A] sem limite | FALHOU: `DEADLOCK(40P01)` em alguma rodada (3 rodadas) | OK: todos criados, contadores = 6 |
| P-03a | P-03 | 5x markCancelled concorrente, contador 3 | FALHOU: `redemption_count` < 2 (ex. 0 ou 1) e/ou `cashback_restante` > 10 | OK: count=2, saldo=10.00 |
| P-03b | P-03 | 5x checkPixStatus com Pix expirado | FALHOU: mesmo sintoma do P-03a | OK |
| P-03c | controle | cancelamento sequencial repetido idempotente | OK | OK |
| P-03d | controle | webhook duplicado: 1 transição para pago, ≤1 crédito | OK (transição já é atômica) | OK |
| P-15 | P-15 | falha após criar cobrança Pix no MP | ABERTO: `createPixPayment=1 cancelPayment=0 pedidos=0` | ABERTO (fora do patch) |
| P-18 | P-18 | cancelamento com cópia velha após pagamento devolve cashback de pedido pago | ABERTO: `saldo_depois` > 0 | ABERTO (fora do patch) |

ABERTO = bug conhecido, fora do Patch 1: não derruba o test:all. `STRICT_KNOWN_OPEN=1` transforma em FALHOU. Se algum passar a dar OK, o script imprime CORRIGIDO.

Invariantes checadas nos cenários de criação: Σ order_promotion_discounts = discount_amount (pedidos não cancelados); total = itens − desconto + taxa − cashback.

## Resultado vermelho esperado (resumo)
FALHOU: P-02a, P-02b, P-17, P-03a, P-03b | OK: P-02c, P-02d, P-02e, P-03c, P-03d | ABERTO: P-15, P-18 | nota: P-16. Exit code 1.
Se P-17 não falhar no vermelho: o teste não reproduziu o deadlock (timing); rodar 3 vezes e me enviar a saída antes de qualquer patch.

## O que este teste NÃO cobre (documentado)
- P-18: só caracterizado, não corrigido. P-15: só caracterizado (correção estrutural = recomendação futura, fora do patch).
- P-16: não há API definida para asserir; exige decisão (Idempotency-Key + tabela de chaves).
- Camada HTTP, guards, throttling e assinatura do webhook; Mercado Pago real; pooler/tamanho de pool do Supabase; latência e volume de produção.
- Pedido de MESA e ENTREGA ponta a ponta (segunda rodada); admin poll (findAll) como chamador de cancelamento (mesma função `markCancelled`, coberta via P-03a/b).
- Cartão (pay-card) e cashback com concessão/expiração fora dos caminhos usados aqui.

## Recomendação arquitetural futura (NÃO implementar agora)
Commit do pedido como aguardando_pagamento → criar Pix FORA da transação → atualizar payload; falha no Pix cancela via markCancelled. Resolve P-15 e reduz o tempo de lock. Altera o fluxo de pagamento: patch separado, com aprovação.

## Depois do vermelho
Você me envia a saída; só então entrego patch1_v2.py (blocos a/b). Esperado depois do patch: P-02a, P-02b, P-17, P-03a, P-03b viram OK; P-15 e P-18 seguem ABERTO.
