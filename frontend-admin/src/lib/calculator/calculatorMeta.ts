// Metadados (textos e campos) de cada categoria. Fonte única usada pela tela,
// pelo manual, pela exportação e pelo comparador.
import type { CalculatorCategory } from '../../types/managerCalculator';

export type FieldKind = 'money' | 'percent' | 'integer';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  required?: boolean;
}

export interface CategoryMeta {
  label: string;
  short: string;
  description: string;
}

export const CATEGORY_META: Record<CalculatorCategory, CategoryMeta> = {
  PRICING_MARKUP: {
    label: 'Precificação & Markup',
    short: 'Precificação',
    description: 'Descubra o preço de venda que cobre custo, impostos, taxas e ainda deixa a margem de lucro desejada.',
  },
  CMV: {
    label: 'CMV',
    short: 'CMV',
    description: 'Veja quanto da sua receita é gasto só com ingredientes e mercadorias no período.',
  },
  BREAK_EVEN: {
    label: 'Ponto de equilíbrio',
    short: 'Equilíbrio',
    description: 'Quanto o restaurante precisa faturar no mês (e por dia) para não ter prejuízo.',
  },
  DELIVERY_MARGIN: {
    label: 'Margem em apps de delivery',
    short: 'Delivery',
    description: 'Quanto sobra de verdade de um prato vendido em app, depois da comissão, da taxa e do imposto.',
  },
  RECIPE_COST: {
    label: 'Ficha técnica',
    short: 'Ficha técnica',
    description: 'Calcule o custo de uma receita ingrediente por ingrediente e o custo de cada porção.',
  },
};

export const FIELD_SPECS: Record<CalculatorCategory, FieldSpec[]> = {
  PRICING_MARKUP: [
    { key: 'cost', label: 'Custo de produção (R$)', kind: 'money', required: true, hint: 'Tudo que o prato custa para ser feito (ficha técnica).' },
    { key: 'tax', label: 'Impostos (%)', kind: 'percent', hint: 'Ex.: 6% do Simples Nacional.' },
    { key: 'card', label: 'Taxa do cartão (%)', kind: 'percent', hint: 'Cobrada pela maquininha.' },
    { key: 'delivery', label: 'Taxa de delivery (%)', kind: 'percent', hint: 'Comissão do app, se vender por ele. Zero se não vende.' },
    { key: 'margin', label: 'Margem de lucro desejada (%)', kind: 'percent', hint: 'O lucro limpo que você quer em cima do preço de venda.' },
    { key: 'currentPrice', label: 'Preço atual (opcional)', kind: 'money', hint: 'Para comparar quanto o preço de hoje realmente rende.' },
  ],
  CMV: [
    { key: 'stockStart', label: 'Estoque inicial (R$)', kind: 'money' },
    { key: 'purchases', label: 'Compras no período (R$)', kind: 'money' },
    { key: 'stockEnd', label: 'Estoque final (R$)', kind: 'money' },
    { key: 'revenue', label: 'Faturamento bruto em vendas (R$)', kind: 'money', required: true },
  ],
  BREAK_EVEN: [
    { key: 'fixedCosts', label: 'Custos fixos totais do mês (R$)', kind: 'money', required: true, hint: 'Aluguel, salários, energia, contador... o que você paga vendendo ou não.' },
    { key: 'variablePct', label: 'Custos variáveis médios (%)', kind: 'percent', hint: 'Ingredientes + impostos + taxas + comissões, como % da venda.' },
    { key: 'days', label: 'Dias de funcionamento no mês', kind: 'integer', hint: 'Entre 1 e 31. Se deixar vazio, usa 30.' },
    { key: 'avgTicket', label: 'Ticket médio (opcional, R$)', kind: 'money', hint: 'Com ele, mostramos quantos pedidos por dia são necessários.' },
  ],
  DELIVERY_MARGIN: [
    { key: 'price', label: 'Preço do prato no app (R$)', kind: 'money', required: true },
    { key: 'commission', label: 'Comissão do app (%)', kind: 'percent', hint: 'Ex.: 12% (plano básico) até 27% (com entrega do app).' },
    { key: 'transaction', label: 'Taxa de transação (%)', kind: 'percent', hint: 'Taxa de pagamento online cobrada pelo app.' },
    { key: 'tax', label: 'Imposto (%)', kind: 'percent' },
    { key: 'cost', label: 'Custo do prato (R$)', kind: 'money' },
    { key: 'targetMargin', label: 'Margem desejada (opcional, %)', kind: 'percent', hint: 'Com ela, calculamos o preço que você deveria cobrar no app.' },
  ],
  RECIPE_COST: [
    { key: 'portions', label: 'Rendimento (porções)', kind: 'integer', hint: 'Quantas porções a receita rende. Vazio = 1.' },
  ],
};

export const MAX_TITLE_LENGTH = 60;
