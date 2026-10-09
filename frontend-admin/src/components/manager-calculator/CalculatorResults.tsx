import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { CalculationResult, Evaluation, PricingCalc } from '../../lib/calculator/calculatorMath';
import { cmvStatus } from '../../lib/calculator/calculatorMath';
import { formatBRL, formatPercent } from '../../lib/calculator/calculatorFormat';
import { CMV_STATUS_TEXT, describeResult, viabilityLine } from '../../lib/calculator/calculatorReport';
import type { ResultRow } from '../../lib/calculator/calculatorReport';

const TONE: Record<NonNullable<ResultRow['tone']> | 'plain', string> = {
  plain: 'text-gray-900',
  strong: 'text-gray-900 font-bold',
  good: 'text-emerald-600 dark:text-emerald-400 font-bold',
  bad: 'text-red-600 dark:text-red-400 font-bold',
};

// Barra empilhada: para onde vai cada real do preço de venda (custo, impostos, taxas, lucro).
function CostBreakdown({ r }: { r: PricingCalc }) {
  const price = r.suggestedPrice;
  const parts = [
    { label: 'Custo', value: r.cost, color: '#71717a' },
    { label: 'Impostos', value: r.taxAmount, color: '#d97706' },
    { label: 'Taxa cartão', value: r.cardAmount, color: '#2563eb' },
    { label: 'Taxa delivery', value: r.deliveryAmount, color: '#7c3aed' },
    { label: 'Lucro', value: Math.max(0, r.grossProfit), color: '#16a34a' },
  ].filter((p) => p.value > 0);
  return (
    <div className="flex flex-col gap-2" aria-label="Para onde vai cada real do preço de venda">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / price) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${formatBRL(p.value)}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.label} {formatBRL(p.value)} ({formatPercent((p.value / price) * 100)})
          </li>
        ))}
      </ul>
    </div>
  );
}

function Alert({ tone, children }: { tone: 'good' | 'warn' | 'bad'; children: React.ReactNode }) {
  const styles = {
    good: 'bg-green-50 border-green-200 text-green-700',
    warn: 'bg-amber-50 border-amber-200 text-amber-700',
    bad: 'bg-red-50 border-red-200 text-red-700',
  }[tone];
  const Icon = tone === 'good' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-snug ${styles}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon size={16} strokeWidth={1.5} className="shrink-0 mt-px" />
      <span>{children}</span>
    </div>
  );
}

function extra(result: CalculationResult) {
  if (result.category === 'CMV') {
    const status = cmvStatus(result.cmvPercent);
    return <Alert tone={status === 'ideal' ? 'good' : status === 'alto' ? 'bad' : 'warn'}>{CMV_STATUS_TEXT[status]}</Alert>;
  }
  if (result.category === 'PRICING_MARKUP') {
    return (
      <>
        <CostBreakdown r={result} />
        {result.naiveDoubleProfit < result.grossProfit && (
          <Alert tone="warn">
            Dobrar o custo daria {formatBRL(result.naiveDoublePrice)} e deixaria só {formatBRL(result.naiveDoubleProfit)} de lucro. O preço sugerido considera impostos e taxas de verdade.
          </Alert>
        )}
        {result.currentProfit !== undefined && result.currentProfit < 0 && (
          <Alert tone="bad">No preço atual ({formatBRL(result.currentPrice)}) este item dá prejuízo de {formatBRL(Math.abs(result.currentProfit))} por unidade.</Alert>
        )}
      </>
    );
  }
  if (result.category === 'DELIVERY_MARGIN') {
    return result.netProfit < 0 ? (
      <Alert tone="bad">Prejuízo: cada venda neste app perde {formatBRL(Math.abs(result.netProfit))}. {viabilityLine(result).replace(/^PREJUÍZO: /, '')}</Alert>
    ) : result.netMarginPercent < 10 ? (
      <Alert tone="warn">Margem líquida baixa (abaixo de 10%): pouca folga para promoções e cupons do app.</Alert>
    ) : null;
  }
  return null;
}

export function CalculatorResults({ evaluation }: { evaluation: Evaluation }) {
  if (evaluation.status === 'incomplete') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-gray-200 px-4 py-4 text-xs text-gray-500">
        <Info size={16} strokeWidth={1.5} className="shrink-0 mt-px" />
        <span>{evaluation.message} O resultado aparece aqui assim que os dados estiverem completos.</span>
      </div>
    );
  }
  if (evaluation.status === 'error') {
    return <Alert tone="bad">{evaluation.message}</Alert>;
  }
  const rows = describeResult(evaluation.result);
  return (
    <div className="flex flex-col gap-4" data-testid="calc-results">
      <dl className="flex flex-col divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-xs text-gray-500">{row.label}</dt>
            <dd className={`text-sm font-mono text-right ${TONE[row.tone ?? 'plain']}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {extra(evaluation.result)}
    </div>
  );
}
