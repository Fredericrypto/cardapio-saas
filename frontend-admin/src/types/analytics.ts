// Contrato da API de Analytics (aba "Análise"). Todos os valores monetários
// já vêm arredondados em 2 casas; `null` significa "Sem dados" (o schema ainda
// não tem registro daquilo) — o frontend mostra "Sem dados" / "N/A".

export type AnalyticsPeriod = 'hora' | 'dia' | 'semana' | 'mes' | 'ano' | '5anos' | 'custom';
export type Granularity = 'hour' | 'day' | 'month';

export interface AnalyticsRange {
  period: AnalyticsPeriod;
  from: string; // ISO
  to: string; // ISO (exclusivo)
  granularity: Granularity;
  timezone: string;
}

export interface FinancialParams {
  defaultCmvPercent: number;
  cardFeePercent: number;
  pixFeePercent: number;
  taxPercent: number;
}

export interface Kpis {
  // Bruto = soma dos itens dos pedidos VÁLIDOS (não cancelados, não aguardando
  // pagamento), antes de cupons. Pedido cancelado NUNCA entra aqui: ele é
  // perda operacional e aparece só em `losses`.
  grossRevenue: number;
  discounts: number; // cupons de desconto (pedidos válidos)
  cashbackRedeemed: number; // cashback usado como forma de pagamento (informativo)
  paymentFees: number; // taxas de cartão/Pix
  taxes: number; // impostos estimados
  // Líquido = bruto − cupons − taxas de pagamento − impostos (sem cancelamentos).
  netRevenue: number;
  cogs: number; // CMV
  grossProfit: number; // receita líquida - CMV
  grossMarginPercent: number | null;
  cmvPercent: number | null;
  cmvRealCoveragePercent: number; // % das vendas com custo real (restante estimado)
  orders: number; // pedidos válidos
  averageTicketPerOrder: number | null; // bruto ÷ pedidos válidos
  averageTicketPerCustomer: number | null; // bruto ÷ clientes únicos atendidos
}

export interface Losses {
  cancelledOrders: number;
  cancelledValue: number;
  abandonedUnpaidOrders: number; // Pix/pagamento não concluído (não é perda de venda)
  refundedDishes: null; // sem registro de estorno por prato no schema
  byReason: { reason: string; orders: number; value: number }[];
}

export interface CashOps {
  changeGiven: number;
  bleedTotal: number | null; // sangrias — null = sem lançamentos
  supplyTotal: number | null;
  cashbackIssued: number;
  cashbackRedeemed: number;
  cashbackExpiredUnused: number;
  cashbackRedemptionRatePercent: number | null;
}

export interface Crm {
  customersServed: number;
  identifiedCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  retentionRatePercent: number | null;
  averageLtv: number | null;
  verifiedCustomers: number;
  verifiedPercent: number | null;
}

export interface SeriesPoint {
  bucket: string; // ISO do início do bucket (America/Sao_Paulo)
  label: string;
  revenue: number;
  profit: number;
  forecast?: boolean;
}

export interface Forecast {
  method: 'linear-regression';
  horizon: number;
  nextPeriodRevenue: number;
  nextPeriodProfit: number;
  trend: 'alta' | 'queda' | 'estavel';
  r2: number;
  lowConfidence: boolean;
}

export interface MenuItemStat {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  unitPrice: number;
  unitCost: number;
  unitMargin: number;
  marginPercent: number | null;
  costSource: 'real' | 'estimada';
}

export type MatrixClass = 'estrela' | 'burro_de_carga' | 'puzzle' | 'cao';

export interface MatrixItem extends MenuItemStat {
  classification: MatrixClass;
}

export interface Analytics {
  range: AnalyticsRange;
  params: FinancialParams;
  kpis: Kpis;
  losses: Losses;
  cash: CashOps;
  crm: Crm;
  series: SeriesPoint[];
  forecast: Forecast | null;
  topProducts: MenuItemStat[];
  bottomProducts: MenuItemStat[];
  matrix: {
    items: MatrixItem[];
    // V̄ = unidades vendidas ÷ itens com venda · M̄ = lucro de cardápio ÷
    // unidades vendidas (média da loja, ponderada pelo volume).
    averageVolume: number;
    averageMargin: number;
  };
  heatmap: { weekday: number; hour: number; orders: number; revenue: number }[];
  channels: { channel: 'mesa' | 'balcao' | 'entrega'; label: string; orders: number; revenue: number }[];
  notes: string[];
}
