// Matemática da Calculadora de Gestão — funções PURAS (sem efeitos colaterais).
//
// Regra de ouro: nenhum cálculo financeiro usa ponto flutuante. Texto digitado
// vira inteiro exato (centavos para dinheiro, "pontos-base" para percentuais:
// 25,5% = 2550) e todas as contas são feitas em BigInt, com arredondamento
// "meio para cima" só na divisão final. Por isso 0,1 + 0,2 é exatamente 0,3,
// nunca aparece NaN/Infinity e cada centavo é rastreável.
import type {
  CalculatorCategory,
  CalculatorDraft,
  ComparableMetrics,
  RecipeIngredient,
} from '../../types/managerCalculator';

export class CalculatorInputError extends Error {}
// Faltam dados para calcular (não é erro do usuário: só ainda não terminou de preencher).
export class CalculatorIncompleteError extends Error {}

const BP = BigInt(10000); // 100% em pontos-base
const MAX_MONEY_CENTS = BigInt(100_000_000_000); // R$ 1 bilhão
const MAX_QTY_MILLI = BigInt(1_000_000_000_000); // 1 bilhão de unidades (3 casas)

export const SUM_OVER_100_MESSAGE =
  'A soma das porcentagens de taxas e margem não pode igualar ou ultrapassar 100%';

// ---------------------------------------------------------------------------
// Texto → inteiro exato
// ---------------------------------------------------------------------------

// "12,5" / "12.5" / 12.5 → inteiro com `scale` casas (12,5 com scale 2 = 1250).
// Arredonda meio-para-cima olhando o dígito seguinte (sem float). Inválido/vazio = null.
export function parseScaled(raw: string | number | null | undefined, scale: number): bigint | null {
  if (raw === null || raw === undefined) return null;
  let text: string;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    text = raw.toFixed(Math.min(scale + 4, 20));
  } else {
    text = raw.trim().replace(',', '.');
  }
  if (text === '' || text === '.') return null;
  if (!/^\d*\.?\d*$/.test(text)) return null;
  const [intPart = '', fracPart = ''] = text.split('.');
  const frac = (fracPart + '0'.repeat(scale + 1)).slice(0, scale + 1);
  const kept = frac.slice(0, scale);
  const roundDigit = Number(frac.charAt(scale));
  const base = BigInt((intPart === '' ? '0' : intPart) + kept);
  return roundDigit >= 5 ? base + BigInt(1) : base;
}

// Divisão inteira com arredondamento meio-para-cima (afastando de zero).
export function divRound(a: bigint, b: bigint): bigint {
  if (b === BigInt(0)) throw new CalculatorInputError('Divisão por zero.');
  const negative = a < BigInt(0) !== b < BigInt(0);
  const absA = a < BigInt(0) ? -a : a;
  const absB = b < BigInt(0) ? -b : b;
  const q = (BigInt(2) * absA + absB) / (BigInt(2) * absB);
  return negative ? -q : q;
}

export const centsToNumber = (cents: bigint): number => Number(cents) / 100;
export const bpToPercent = (bp: bigint): number => Number(bp) / 100;

// Arredonda um número já calculado para `decimals` casas (só para exibir/guardar razões).
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

// Soma/diminui pontos percentuais num texto de percentual ("12,5" + 5 → "17.5"), limitado a 0–100.
export function addPercentPoints(raw: string, points: number): string {
  const currentBp = parseScaled(raw, 2) ?? BigInt(0);
  const next = currentBp + BigInt(Math.round(points * 100));
  const clamped = next < BigInt(0) ? BigInt(0) : next > BP ? BP : next;
  return bpToText(clamped);
}

export function bpToText(bp: bigint): string {
  const whole = bp / BigInt(100);
  const frac = (bp % BigInt(100)).toString().padStart(2, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// ---------------------------------------------------------------------------
// Leitura validada dos campos
// ---------------------------------------------------------------------------
type Inputs = Record<string, number | string>;

function rawOf(inputs: Inputs, key: string): string | number | undefined {
  const v = inputs[key];
  return typeof v === 'string' ? v.trim() : v;
}

function isBlank(v: string | number | undefined): boolean {
  return v === undefined || v === '';
}

function readMoney(inputs: Inputs, key: string, label: string, required = false): bigint {
  const raw = rawOf(inputs, key);
  if (isBlank(raw)) {
    if (required) throw new CalculatorIncompleteError(`Informe ${label}.`);
    return BigInt(0);
  }
  const cents = parseScaled(raw, 2);
  if (cents === null) throw new CalculatorInputError(`Valor inválido em "${label}".`);
  if (cents > MAX_MONEY_CENTS) throw new CalculatorInputError(`"${label}" está grande demais.`);
  if (required && cents === BigInt(0)) throw new CalculatorIncompleteError(`Informe ${label}.`);
  return cents;
}

function readPercentBp(inputs: Inputs, key: string, label: string): bigint {
  const raw = rawOf(inputs, key);
  if (isBlank(raw)) return BigInt(0);
  const bp = parseScaled(raw, 2);
  if (bp === null) throw new CalculatorInputError(`Valor inválido em "${label}".`);
  if (bp > BP) throw new CalculatorInputError(`"${label}" não pode passar de 100%.`);
  return bp;
}

function readInteger(inputs: Inputs, key: string, label: string, min: number, max: number, fallback: number): bigint {
  const raw = rawOf(inputs, key);
  if (isBlank(raw)) return BigInt(fallback);
  const n = parseScaled(raw, 0);
  if (n === null) throw new CalculatorInputError(`Valor inválido em "${label}".`);
  if (n < BigInt(min) || n > BigInt(max)) {
    throw new CalculatorInputError(`"${label}" deve estar entre ${min} e ${max}.`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// 1) Precificação recomendada
//    Preço = Custo ÷ (1 − (Impostos% + Cartão% + Delivery% + Margem%) ÷ 100)
// ---------------------------------------------------------------------------
export interface PricingCalc {
  category: 'PRICING_MARKUP';
  suggestedPrice: number;
  cost: number;
  taxAmount: number;
  cardAmount: number;
  deliveryAmount: number;
  grossProfit: number; // lucro bruto em R$ (o que sobra de verdade)
  effectiveMarginPercent: number;
  totalRatesPercent: number; // impostos + taxas + margem
  markup: number; // preço ÷ custo
  naiveDoublePrice: number; // o erro comum: custo × 2
  naiveDoubleProfit: number;
  currentPrice?: number;
  currentProfit?: number;
  currentMarginPercent?: number;
}

interface PricingCents {
  price: bigint;
  tax: bigint;
  card: bigint;
  delivery: bigint;
  profit: bigint;
}

// Núcleo exato reutilizado pela precificação e pela simulação de delivery.
export function priceFor(costCents: bigint, taxBp: bigint, cardBp: bigint, deliveryBp: bigint, marginBp: bigint): PricingCents {
  const sumBp = taxBp + cardBp + deliveryBp + marginBp;
  if (sumBp >= BP) throw new CalculatorInputError(SUM_OVER_100_MESSAGE);
  const price = divRound(costCents * BP, BP - sumBp);
  const tax = divRound(price * taxBp, BP);
  const card = divRound(price * cardBp, BP);
  const delivery = divRound(price * deliveryBp, BP);
  // O lucro é o RESÍDUO: preço − custo − tudo que foi descontado. Assim as
  // parcelas sempre fecham no centavo com o preço.
  return { price, tax, card, delivery, profit: price - costCents - tax - card - delivery };
}

export function calcPricing(inputs: Inputs): PricingCalc {
  const cost = readMoney(inputs, 'cost', 'o custo de produção', true);
  const taxBp = readPercentBp(inputs, 'tax', 'Impostos');
  const cardBp = readPercentBp(inputs, 'card', 'Taxa do cartão');
  const deliveryBp = readPercentBp(inputs, 'delivery', 'Taxa de delivery');
  const marginBp = readPercentBp(inputs, 'margin', 'Margem de lucro');
  const r = priceFor(cost, taxBp, cardBp, deliveryBp, marginBp);

  const double = cost * BigInt(2);
  const doubleProfit = double - cost - divRound(double * taxBp, BP) - divRound(double * cardBp, BP) - divRound(double * deliveryBp, BP);

  const out: PricingCalc = {
    category: 'PRICING_MARKUP',
    suggestedPrice: centsToNumber(r.price),
    cost: centsToNumber(cost),
    taxAmount: centsToNumber(r.tax),
    cardAmount: centsToNumber(r.card),
    deliveryAmount: centsToNumber(r.delivery),
    grossProfit: centsToNumber(r.profit),
    effectiveMarginPercent: bpToPercent(divRound(r.profit * BP, r.price)),
    totalRatesPercent: bpToPercent(taxBp + cardBp + deliveryBp + marginBp),
    markup: roundTo(Number(divRound(r.price * BigInt(10000), cost)) / 10000, 4),
    naiveDoublePrice: centsToNumber(double),
    naiveDoubleProfit: centsToNumber(doubleProfit),
  };

  // Comparação com o preço praticado hoje (vem da Análise ou digitado).
  const current = readMoney(inputs, 'currentPrice', 'o preço atual');
  if (current > BigInt(0)) {
    const profit =
      current - cost - divRound(current * taxBp, BP) - divRound(current * cardBp, BP) - divRound(current * deliveryBp, BP);
    out.currentPrice = centsToNumber(current);
    out.currentProfit = centsToNumber(profit);
    out.currentMarginPercent = bpToPercent(divRound(profit * BP, current));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2) CMV% = (Estoque inicial + Compras − Estoque final) ÷ Faturamento × 100
// ---------------------------------------------------------------------------
export type CmvStatus = 'baixo' | 'ideal' | 'atencao' | 'alto';

export interface CmvCalc {
  category: 'CMV';
  cmvAmount: number;
  revenue: number;
  cmvPercent: number;
  grossMarginPercent: number; // 100 − CMV%
}

// Faixas: ideal 28–32 %; acima de 35 % é alerta (custo dos ingredientes alto).
export function cmvStatus(percent: number): CmvStatus {
  if (percent > 35) return 'alto';
  if (percent > 32) return 'atencao';
  if (percent >= 28) return 'ideal';
  return 'baixo';
}

export function calcCmv(inputs: Inputs): CmvCalc {
  const start = readMoney(inputs, 'stockStart', 'o estoque inicial');
  const purchases = readMoney(inputs, 'purchases', 'as compras do período');
  const end = readMoney(inputs, 'stockEnd', 'o estoque final');
  const revenue = readMoney(inputs, 'revenue', 'o faturamento bruto em vendas', true);
  const cmv = start + purchases - end;
  if (cmv < BigInt(0)) {
    throw new CalculatorInputError('O estoque final não pode ser maior que o estoque inicial somado às compras.');
  }
  const bp = divRound(cmv * BP, revenue);
  return {
    category: 'CMV',
    cmvAmount: centsToNumber(cmv),
    revenue: centsToNumber(revenue),
    cmvPercent: bpToPercent(bp),
    grossMarginPercent: bpToPercent(BP - bp),
  };
}

// ---------------------------------------------------------------------------
// 3) Ponto de equilíbrio
//    MC% = 100 − Custos variáveis%   ·   Faturamento mínimo = Custos fixos ÷ MC
//    Meta diária = Faturamento mínimo ÷ dias de funcionamento
// ---------------------------------------------------------------------------
export interface BreakEvenCalc {
  category: 'BREAK_EVEN';
  fixedCosts: number;
  variablePercent: number;
  contributionMarginPercent: number;
  requiredRevenue: number;
  dailyTarget: number;
  days: number;
  ordersPerDay?: number; // só se o ticket médio foi informado
}

export function calcBreakEven(inputs: Inputs): BreakEvenCalc {
  const fixed = readMoney(inputs, 'fixedCosts', 'os custos fixos totais', true);
  const variableBp = readPercentBp(inputs, 'variablePct', 'Custos variáveis');
  const days = readInteger(inputs, 'days', 'Dias de funcionamento', 1, 31, 30);
  const ticket = readMoney(inputs, 'avgTicket', 'o ticket médio');
  if (variableBp >= BP) {
    throw new CalculatorInputError(
      'Os custos variáveis não podem ser 100% ou mais da receita: nesse cenário não existe ponto de equilíbrio.',
    );
  }
  const cmBp = BP - variableBp;
  const required = divRound(fixed * BP, cmBp);
  const daily = divRound(required, days);
  const out: BreakEvenCalc = {
    category: 'BREAK_EVEN',
    fixedCosts: centsToNumber(fixed),
    variablePercent: bpToPercent(variableBp),
    contributionMarginPercent: bpToPercent(cmBp),
    requiredRevenue: centsToNumber(required),
    dailyTarget: centsToNumber(daily),
    days: Number(days),
  };
  if (ticket > BigInt(0)) {
    // Pedidos/dia arredondados PARA CIMA (meio pedido não paga a conta).
    out.ordersPerDay = Number((daily + ticket - BigInt(1)) / ticket);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4) Margem líquida real em apps de delivery
//    Recebido = Preço × (1 − (Comissão% + Transação%) ÷ 100)
//    Lucro = Recebido − Custo − Preço × Imposto%      Margem = Lucro ÷ Preço
// ---------------------------------------------------------------------------
export interface DeliveryCalc {
  category: 'DELIVERY_MARGIN';
  price: number;
  commissionAmount: number;
  transactionAmount: number;
  receivedFromApp: number;
  taxAmount: number;
  cost: number;
  netProfit: number;
  netMarginPercent: number;
  suggestedPrice?: number; // preço para atingir a margem-alvo (se informada)
}

export function calcDelivery(inputs: Inputs): DeliveryCalc {
  const price = readMoney(inputs, 'price', 'o preço do prato', true);
  const commissionBp = readPercentBp(inputs, 'commission', 'Comissão do app');
  const transactionBp = readPercentBp(inputs, 'transaction', 'Taxa de transação');
  const taxBp = readPercentBp(inputs, 'tax', 'Imposto');
  const cost = readMoney(inputs, 'cost', 'o custo do prato');
  if (commissionBp + transactionBp >= BP) {
    throw new CalculatorInputError('A comissão somada à taxa de transação não pode chegar a 100%.');
  }
  const commission = divRound(price * commissionBp, BP);
  const transaction = divRound(price * transactionBp, BP);
  const received = price - commission - transaction;
  const tax = divRound(price * taxBp, BP);
  const profit = received - cost - tax;
  const out: DeliveryCalc = {
    category: 'DELIVERY_MARGIN',
    price: centsToNumber(price),
    commissionAmount: centsToNumber(commission),
    transactionAmount: centsToNumber(transaction),
    receivedFromApp: centsToNumber(received),
    taxAmount: centsToNumber(tax),
    cost: centsToNumber(cost),
    netProfit: centsToNumber(profit),
    netMarginPercent: bpToPercent(divRound(profit * BP, price)),
  };
  const targetRaw = rawOf(inputs, 'targetMargin');
  if (!isBlank(targetRaw) && cost > BigInt(0)) {
    const targetBp = readPercentBp(inputs, 'targetMargin', 'Margem desejada');
    // Mesmo núcleo da precificação: comissão + transação entram como "taxa de delivery".
    out.suggestedPrice = centsToNumber(priceFor(cost, taxBp, BigInt(0), commissionBp + transactionBp, targetBp).price);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5) Ficha técnica: custo da linha = usado ÷ embalagem × preço da embalagem
// ---------------------------------------------------------------------------
export interface RecipeCalc {
  category: 'RECIPE_COST';
  lines: number[];
  totalCost: number;
  portions: number;
  costPerPortion: number;
}

export function isIngredientBlank(i: RecipeIngredient): boolean {
  return i.name.trim() === '' && i.usedQty.trim() === '' && i.packQty.trim() === '' && i.packPrice.trim() === '';
}

export function calcRecipe(inputs: Inputs, ingredients: readonly RecipeIngredient[]): RecipeCalc {
  const portions = readInteger(inputs, 'portions', 'Rendimento (porções)', 1, 100000, 1);
  const filled = ingredients.filter((i) => !isIngredientBlank(i));
  if (filled.length === 0) throw new CalculatorIncompleteError('Adicione ao menos um ingrediente.');
  const lines: bigint[] = filled.map((i, idx) => {
    const label = i.name.trim() || `Ingrediente ${idx + 1}`;
    const used = parseScaled(i.usedQty, 3);
    const pack = parseScaled(i.packQty, 3);
    const price = parseScaled(i.packPrice, 2);
    if (used === null || pack === null || price === null) {
      throw new CalculatorIncompleteError(`Complete os dados de "${label}".`);
    }
    if (pack === BigInt(0)) throw new CalculatorInputError(`A quantidade da embalagem de "${label}" não pode ser zero.`);
    if (used > MAX_QTY_MILLI || pack > MAX_QTY_MILLI || price > MAX_MONEY_CENTS) {
      throw new CalculatorInputError(`Valor grande demais em "${label}".`);
    }
    return divRound(used * price, pack); // arredonda POR LINHA, em centavos
  });
  const total = lines.reduce((acc, v) => acc + v, BigInt(0));
  return {
    category: 'RECIPE_COST',
    lines: lines.map(centsToNumber),
    totalCost: centsToNumber(total),
    portions: Number(portions),
    costPerPortion: centsToNumber(divRound(total, portions)),
  };
}

// ---------------------------------------------------------------------------
// Avaliação de um rascunho (o que a interface e a exportação usam)
// ---------------------------------------------------------------------------
export type CalculationResult = PricingCalc | CmvCalc | BreakEvenCalc | DeliveryCalc | RecipeCalc;

export type Evaluation =
  | { status: 'ok'; result: CalculationResult }
  | { status: 'incomplete'; message: string }
  | { status: 'error'; message: string };

export function evaluateDraft(draft: Pick<CalculatorDraft, 'category' | 'inputs' | 'ingredients'>): Evaluation {
  try {
    const { category, inputs } = draft;
    let result: CalculationResult;
    switch (category) {
      case 'PRICING_MARKUP':
        result = calcPricing(inputs);
        break;
      case 'CMV':
        result = calcCmv(inputs);
        break;
      case 'BREAK_EVEN':
        result = calcBreakEven(inputs);
        break;
      case 'DELIVERY_MARGIN':
        result = calcDelivery(inputs);
        break;
      case 'RECIPE_COST':
        result = calcRecipe(inputs, draft.ingredients ?? []);
        break;
    }
    return { status: 'ok', result };
  } catch (err) {
    if (err instanceof CalculatorIncompleteError) return { status: 'incomplete', message: err.message };
    if (err instanceof CalculatorInputError) return { status: 'error', message: err.message };
    return { status: 'error', message: 'Não foi possível calcular com esses valores.' };
  }
}

// Resultado "achatado" para guardar no rascunho (CalculatorDraft.results).
export function flattenResult(evaluation: Evaluation): Record<string, number | object> {
  if (evaluation.status !== 'ok') return {};
  const { category: _category, ...rest } = evaluation.result;
  void _category;
  return rest as Record<string, number | object>;
}

export function comparableMetrics(draft: CalculatorDraft): ComparableMetrics | null {
  const ev = evaluateDraft(draft);
  if (ev.status !== 'ok') return null;
  const r = ev.result;
  switch (r.category) {
    case 'PRICING_MARKUP':
      return { salePrice: r.suggestedPrice, netProfit: r.grossProfit, marginPercent: r.effectiveMarginPercent, breakEven: null };
    case 'DELIVERY_MARGIN':
      return { salePrice: r.price, netProfit: r.netProfit, marginPercent: r.netMarginPercent, breakEven: null };
    case 'BREAK_EVEN':
      return { salePrice: null, netProfit: null, marginPercent: r.contributionMarginPercent, breakEven: r.requiredRevenue };
    case 'CMV':
    case 'RECIPE_COST':
      return { salePrice: null, netProfit: null, marginPercent: null, breakEven: null };
  }
}

export const CATEGORIES: readonly CalculatorCategory[] = [
  'PRICING_MARKUP',
  'CMV',
  'BREAK_EVEN',
  'DELIVERY_MARGIN',
  'RECIPE_COST',
];
