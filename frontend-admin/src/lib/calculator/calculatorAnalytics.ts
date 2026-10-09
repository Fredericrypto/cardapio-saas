// Ponte Análise → Calculadora: transforma os dados REAIS da aba Análise no payload
// do preenchimento automático. Nada é inventado: o que a Análise não sabe (ex.: a
// comissão do app de delivery, os custos fixos) fica de fora e o gerente preenche.
import type { Analytics, MenuItemStat } from '../../types/analytics';
import type { AnalyticsDataPayload } from '../../types/managerCalculator';
import { roundTo } from './calculatorMath';

// Item do cardápio. Preço = receita ÷ unidades; custo = custo real (ou o CMV estimado, quando
// o produto não tem custo cadastrado — a própria Análise já sinaliza isso).
export function payloadFromProduct(item: MenuItemStat, params: Analytics['params']): AnalyticsDataPayload {
  return {
    productId: item.productId,
    productName: item.name,
    currentPrice: item.unitPrice,
    costPrice: item.unitCost,
    monthlyUnitsSold: item.units,
    monthlyRevenue: item.revenue,
    taxRate: params.taxPercent,
    cardFeeRate: params.cardFeePercent,
  };
}

// Resumo do período: usa as taxas/impostos EFETIVOS (valor ÷ faturamento bruto).
export function payloadFromSummary(data: Analytics): AnalyticsDataPayload {
  const { kpis } = data;
  const gross = kpis.grossRevenue;
  const effective = (value: number): number | undefined => (gross > 0 ? roundTo((value / gross) * 100, 2) : undefined);
  return {
    monthlyRevenue: gross > 0 ? gross : undefined,
    cmvPercent: kpis.cmvPercent ?? undefined,
    taxRate: effective(kpis.taxes),
    cardFeeRate: effective(kpis.paymentFees),
  };
}

// Lista única de itens (matriz + rankings), sem repetição, mais vendidos primeiro.
export function uniqueProducts(data: Analytics): MenuItemStat[] {
  const map = new Map<string, MenuItemStat>();
  [...data.matrix.items, ...data.topProducts, ...data.bottomProducts].forEach((i) => {
    if (!map.has(i.productId)) map.set(i.productId, i);
  });
  return [...map.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, 'pt-BR'));
}
