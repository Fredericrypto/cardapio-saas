// Contratos de dados da Calculadora de Gestão (módulo financeiro do painel).
// Tudo que é guardado (sessão, rascunhos, cenários) usa SOMENTE estes tipos.

export type CalculatorCategory =
  | 'PRICING_MARKUP' // Precificação & Engenharia de Cardápio
  | 'CMV' // Custo de Mercadoria Vendida (geral)
  | 'BREAK_EVEN' // Ponto de Equilíbrio Financeiro
  | 'DELIVERY_MARGIN' // Simulação de margem em apps de delivery (iFood etc.)
  | 'RECIPE_COST'; // Ficha técnica & rendimento de porção

// Dados vindos da aba Análise para o preenchimento automático (1 clique).
// Percentuais em "pontos percentuais" (12 = 12%), dinheiro em reais.
export interface AnalyticsDataPayload {
  productId?: string;
  productName?: string;
  currentPrice?: number;
  costPrice?: number;
  monthlyUnitsSold?: number;
  monthlyRevenue?: number;
  fixedCostsEstimate?: number;
  platformCommissionRate?: number; // ex.: 12 ou 27 (comissão do app de delivery)
  cardFeeRate?: number; // ex.: 2,5 (maquininha)
  taxRate?: number; // ex.: 6 (Simples Nacional)
  cmvPercent?: number; // CMV do período (usado no resumo de faturamento)
}

// Linha da ficha técnica: custo = (quantidade usada ÷ quantidade da embalagem) × preço da embalagem.
export interface RecipeIngredient {
  id: string;
  name: string;
  usedQty: string; // texto com ponto decimal (g, ml ou un)
  packQty: string;
  packPrice: string; // R$
}

// Rascunho / estado salvo do "bloco de notas" financeiro.
export interface CalculatorDraft {
  id: string;
  title: string;
  category: CalculatorCategory;
  inputs: Record<string, number | string>;
  results: Record<string, number | object>;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  linkedProductId?: string;
  ingredients?: RecipeIngredient[]; // só na ficha técnica
}

// Comparação de cenários salvos.
export interface ComparisonScenario {
  id: string;
  name: string;
  drafts: CalculatorDraft[];
  createdAt: string;
}

// Visor + teclado numérico (persistido junto da sessão).
export interface KeypadHistoryEntry {
  expression: string;
  result: string;
}

export interface KeypadState {
  expression: string;
  result: string | null; // resultado do último "=" (null = ainda digitando)
  history: KeypadHistoryEntry[];
}

// Sessão inteira, restaurada ao reabrir (como o Bloco de Notas do Windows 11).
export interface CalculatorSession {
  version: 1;
  drafts: CalculatorDraft[];
  activeDraftId: string;
  keypad: KeypadState;
  notices: Record<string, string>; // draftId → aviso "dados importados da análise…"
}

// Métricas comparáveis entre cenários (null = não se aplica à categoria).
export interface ComparableMetrics {
  salePrice: number | null;
  netProfit: number | null;
  marginPercent: number | null;
  breakEven: number | null;
}
