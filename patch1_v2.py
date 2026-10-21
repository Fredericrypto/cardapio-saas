#!/usr/bin/env python3
# PATCH 1 v2 (P-02 + P-03 + P-17) - limite por cliente sob concorrencia, cancelamento atomico, ordem de locks.
# v2: so trava promocoes COM limite; try-lock (409, sem esperar); cancelamento na ordem claim->cashback->promocao;
# recordRedemption/release em ordem fixa por id.
# Aborta sem tocar em nada se qualquer trecho nao existir EXATAMENTE 1x.
import os, sys

ROOT = os.environ.get('ROOT') or os.path.expanduser('~/Projetos/cardapio-saas')
PROMO = os.path.join(ROOT, 'backend/src/modules/promotions/promotions.service.ts')
ORDERS = os.path.join(ROOT, 'backend/src/modules/orders/orders.service.ts')

def read(p):
    try:
        with open(p, encoding='utf-8') as f:
            return f.read()
    except OSError as e:
        sys.exit(f'ABORTADO: nao consegui ler {p}: {e}')

def rep(text, old, new, label):
    n = text.count(old)
    if n != 1:
        sys.exit(f'ABORTADO: trecho "{label}" encontrado {n}x (esperado 1x). Nada foi alterado.')
    return text.replace(old, new)

promo = read(PROMO)
orders = read(ORDERS)

if 'lockPromotionsForOrder' in promo or 'P-03' in orders or 'P-17' in orders:
    sys.exit('ABORTADO: patch ja aplicado. Nada foi alterado.')

# ---------------------------------------------------------------- promotions.service.ts
promo = rep(
    promo,
    "import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';\n",
    "import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';\n",
    'import do ConflictException',
)

promo = rep(
    promo,
    "    const ids = [...new Set(promotionIds ?? [])]; // dedupe — clicar 2x no mesmo cupom não conta 2x\n"
    "    if (ids.length === 0) return [];\n",
    "    const ids = [...new Set(promotionIds ?? [])]; // dedupe — clicar 2x no mesmo cupom não conta 2x\n"
    "    if (ids.length === 0) return [];\n"
    "\n"
    "    // Serializa pedidos concorrentes que disputam o MESMO limite (auditoria P-02).\n"
    "    // Tem que vir ANTES de qualquer leitura de uso/contador abaixo.\n"
    "    await this.lockPromotionsForOrder(manager, tenantId, customerId, ids);\n",
    'chamada do lock em validateSelectedPromotions',
)

promo = rep(
    promo,
    "  // Wrapper de compatibilidade pra qualquer chamador antigo que ainda\n",
    "  // CONCORRÊNCIA (auditoria P-02). O limite por cliente e o teto global são\n"
    "  // \"conte e depois grave\": sem trava, dois pedidos simultâneos do mesmo cliente\n"
    "  // (duas abas, retry de rede, replay) leem a mesma contagem e os dois passam.\n"
    "  // Locks consultivos DE TRANSAÇÃO (liberados no commit/rollback do pedido; valem\n"
    "  // atrás de pooler em modo transação), só para promoções que TÊM limite:\n"
    "  //  - usageLimitPerCustomer: chave (promoção, cliente) — clientes diferentes\n"
    "  //    não se bloqueiam;\n"
    "  //  - maxRedemptions: chave da promoção (teto global).\n"
    "  // Promoção sem limite não trava nada. É TRY-lock: se outro pedido do mesmo\n"
    "  // cliente/promoção está em andamento, responde 409 na hora em vez de esperar\n"
    "  // (esperar seguraria uma conexão do pool; o cliente tenta de novo e vê o\n"
    "  // resultado certo). Chaves ordenadas: ordem determinística entre pedidos.\n"
    "  // Só pode ser chamado DENTRO da transação de criação do pedido.\n"
    "  private async lockPromotionsForOrder(\n"
    "    manager: EntityManager,\n"
    "    tenantId: string,\n"
    "    customerId: string | null,\n"
    "    ids: string[],\n"
    "  ): Promise<void> {\n"
    "    const limited = await manager.find(Promotion, {\n"
    "      where: { id: In(ids), tenantId },\n"
    "      select: { id: true, maxRedemptions: true, usageLimitPerCustomer: true },\n"
    "    });\n"
    "    const keys: string[] = [];\n"
    "    for (const p of limited) {\n"
    "      if (p.usageLimitPerCustomer != null && customerId) keys.push(`promotion-customer:${p.id}:${customerId}`);\n"
    "      if (p.maxRedemptions != null) keys.push(`promotion:${p.id}`);\n"
    "    }\n"
    "    keys.sort();\n"
    "    for (const key of keys) {\n"
    "      const rows = await manager.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS ok', [key]);\n"
    "      if (!rows?.[0]?.ok) {\n"
    "        throw new ConflictException(\n"
    "          'Estamos processando seu pedido anterior. Aguarde alguns segundos e tente de novo.',\n"
    "        );\n"
    "      }\n"
    "    }\n"
    "  }\n"
    "\n"
    "  // Wrapper de compatibilidade pra qualquer chamador antigo que ainda\n",
    'insercao do metodo lockPromotionsForOrder',
)

# ---------------------------------------------------------------- orders.service.ts
orders = rep(
    orders,
    "    if (order.status === 'cancelado') return;\n"
    "    order.status = 'cancelado';\n"
    "    // Análise de cancelamento (aba Análise): motivo, instante e operador.\n"
    "    order.cancelReason = reason?.trim() ? reason.trim().slice(0, 300) : null;\n"
    "    order.canceledAt = new Date();\n"
    "    order.canceledByUserId = canceledByUserId ?? null;\n"
    "    const promotionIds = order.promotionIds ?? (order.promotionId ? [order.promotionId] : []);\n"
    "    await Promise.all(\n"
    "      promotionIds.map((id) => this.promotionsService.releaseRedemption(this.orderRepo.manager, id)),\n"
    "    );\n",
    "    if (order.status === 'cancelado') return;\n"
    "    // Análise de cancelamento (aba Análise): motivo, instante e operador.\n"
    "    const cancelReason = reason?.trim() ? reason.trim().slice(0, 300) : null;\n"
    "    const canceledAt = new Date();\n"
    "    const promotionIds = order.promotionIds ?? (order.promotionId ? [order.promotionId] : []);\n"
    "    // CLAIM ATÔMICO (auditoria P-03). Poll do cliente, poll do painel e webhook\n"
    "    // podem cancelar o MESMO pedido ao mesmo tempo, cada um com a sua cópia em\n"
    "    // memória ainda 'aguardando_pagamento'. A guarda acima não vê isso. O UPDATE\n"
    "    // condicional abaixo só dá certo para UM concorrente (os outros esperam o\n"
    "    // commit e veem affected=0); só quem ganha devolve promoção e cashback, tudo\n"
    "    // na MESMA transação: se algo falhar, o pedido continua não cancelado e o\n"
    "    // próximo caminho tenta de novo (mesmo comportamento de antes). Estorno no\n"
    "    // gateway (rede) fica fora da transação, como sempre.\n"
    "    const claimed = await this.dataSource.transaction(async (manager) => {\n"
    "      const result = await manager\n"
    "        .createQueryBuilder()\n"
    "        .update(Order)\n"
    "        .set({\n"
    "          status: 'cancelado',\n"
    "          cancelReason,\n"
    "          canceledAt,\n"
    "          canceledByUserId: canceledByUserId ?? null,\n"
    "        })\n"
    "        .where('id = :id AND tenant_id = :tenantId AND status <> :cancelled', {\n"
    "          id: order.id,\n"
    "          tenantId: order.tenantId,\n"
    "          cancelled: 'cancelado',\n"
    "        })\n"
    "        .execute();\n"
    "      if ((result.affected ?? 0) !== 1) return false;\n"
    "      // ORDEM DE LOCKS = a de create(): cashback (ledger) antes da linha da\n"
    "      // promoção. Inverter isso criaria deadlock entre criar e cancelar pedidos.\n"
    "      // Cashback: se o pedido tinha usado saldo (cashbackUsed > 0), devolve; se já\n"
    "      // tinha GERADO cashback (cashbackEarned > 0), zera o que sobrou. Só se\n"
    "      // `cashbackLocked` ainda for false (ver comentário abaixo).\n"
    "      if (!order.cashbackLocked) {\n"
    "        await this.cashbackService.reverseConsumptionForOrder(manager, order.tenantId, order.id);\n"
    "        await this.cashbackService.reverseCreditForOrder(manager, order.tenantId, order.id);\n"
    "      }\n"
    "      // Promoções em ordem fixa (ids ordenados).\n"
    "      for (const promotionId of [...promotionIds].sort()) {\n"
    "        await this.promotionsService.releaseRedemption(manager, promotionId);\n"
    "      }\n"
    "      return true;\n"
    "    });\n"
    "    if (!claimed) {\n"
    "      // Outro caminho já cancelou e cuidou das devoluções. Só alinha a cópia em\n"
    "      // memória para o save() do chamador não regredir o estado.\n"
    "      const fresh = await this.orderRepo.findOne({ where: { id: order.id, tenantId: order.tenantId } });\n"
    "      if (fresh?.status === 'cancelado') {\n"
    "        order.status = fresh.status;\n"
    "        order.cancelReason = fresh.cancelReason;\n"
    "        order.canceledAt = fresh.canceledAt;\n"
    "        order.canceledByUserId = fresh.canceledByUserId;\n"
    "      }\n"
    "      return;\n"
    "    }\n"
    "    order.status = 'cancelado';\n"
    "    order.cancelReason = cancelReason;\n"
    "    order.canceledAt = canceledAt;\n"
    "    order.canceledByUserId = canceledByUserId ?? null;\n",
    'inicio de markCancelled',
)

orders = rep(
    orders,
    "    if (!order.cashbackLocked) {\n"
    "      await this.cashbackService.reverseConsumptionForOrder(this.orderRepo.manager, order.tenantId, order.id);\n"
    "      await this.cashbackService.reverseCreditForOrder(this.orderRepo.manager, order.tenantId, order.id);\n"
    "    }\n"
    "    // Estorno AUTOMÁTICO (Fase C)",
    "    // (devolução de cashback feita dentro da transação do claim, acima)\n"
    "    // Estorno AUTOMÁTICO (Fase C)",
    'bloco antigo de cashback em markCancelled',
)


orders = rep(
    orders,
    "        await Promise.all(\n"
    "          appliedDiscounts.map((d) => this.promotionsService.recordRedemption(manager, d.promotionId)),\n"
    "        );\n",
    "        // Ordem fixa por id (auditoria P-17): [A,B] e [B,A] concorrentes travavam as\n"
    "        // linhas das promoções em ordem oposta e davam deadlock (40P01).\n"
    "        for (const promotionId of [...new Set(appliedDiscounts.map((d) => d.promotionId))].sort()) {\n"
    "          await this.promotionsService.recordRedemption(manager, promotionId);\n"
    "        }\n",
    'recordRedemption em create()',
)

# tudo validado: agora escreve
for path, content in ((PROMO, promo), (ORDERS, orders)):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
print('OK: patch 1 v2 aplicado em promotions.service.ts e orders.service.ts')
