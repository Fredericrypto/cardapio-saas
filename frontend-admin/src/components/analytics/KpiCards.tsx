import type { ReactNode } from 'react';
import type { Analytics } from '../../types/analytics';
import { NO_DATA, brl, int, pct } from './format';

function Card({
  title,
  value,
  sub,
  tone = 'light',
  className = '',
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const dark = tone === 'dark';
  return (
    <div
      className={`rounded-2xl p-4 flex flex-col gap-1 ${
        dark ? 'bg-zinc-900 text-white' : 'bg-white border border-gray-100 text-gray-900'
      } ${className}`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${dark ? 'text-zinc-400' : 'text-gray-400'}`}>
        {title}
      </p>
      <p className="font-display text-xl font-bold leading-tight">{value}</p>
      {sub && <div className={`text-xs ${dark ? 'text-zinc-400' : 'text-gray-500'}`}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
    </section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <span className="text-gray-400">{children}</span>;

export function KpiCards({ data }: { data: Analytics }) {
  const { kpis, losses, cash, crm, params } = data;
  return (
    <div className="flex flex-col gap-6">
      <Section title="Resultado">
        <Card title="Faturamento bruto" tone="dark" value={brl(kpis.grossRevenue)} sub={`${int(kpis.orders)} pedidos válidos`} />
        <Card
          title="Faturamento líquido"
          tone="dark"
          value={brl(kpis.netRevenue)}
          sub={`− cupons ${brl(kpis.discounts)} · − cancel. ${brl(kpis.cancellations)}`}
        />
        <Card
          title="Margem bruta estimada"
          tone="dark"
          value={pct(kpis.grossMarginPercent)}
          sub={`Lucro bruto ${brl(kpis.grossProfit)}`}
        />
        <Card
          title="CMV"
          tone="dark"
          value={brl(kpis.cogs)}
          sub={`${pct(kpis.cmvPercent)} da receita · custo real em ${pct(kpis.cmvRealCoveragePercent)} das vendas (resto: ${params.defaultCmvPercent}% estimado)`}
        />
        <Card title="Ticket médio / pedido" value={brl(kpis.averageTicketPerOrder)} />
        <Card title="Ticket médio / cliente" value={brl(kpis.averageTicketPerCustomer)} />
        <Card title="Taxas de pagamento" value={brl(kpis.paymentFees)} sub={`Cartão ${params.cardFeePercent}% · Pix ${params.pixFeePercent}%`} />
        <Card title="Impostos estimados" value={brl(kpis.taxes)} sub={`${params.taxPercent}% do faturamento`} />
      </Section>

      <Section title="Perdas e desperdício">
        <Card
          title="Pedidos cancelados"
          value={brl(losses.cancelledValue)}
          sub={`${int(losses.cancelledOrders)} pedidos${losses.abandonedUnpaidOrders > 0 ? ` · +${losses.abandonedUnpaidOrders} sem pagamento (não é perda)` : ''}`}
        />
        <Card title="Pratos estornados" value={<Muted>{NO_DATA}</Muted>} sub="Ainda não há registro de estorno por prato" />
        <div className="col-span-2 rounded-2xl bg-white border border-gray-100 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Motivos de cancelamento</p>
          {losses.byReason.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum cancelamento no período.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {losses.byReason.slice(0, 5).map((r) => (
                <li key={r.reason} className="flex items-center justify-between text-xs">
                  <span className={r.reason === 'Sem motivo registrado' ? 'text-gray-400' : 'text-gray-700'}>{r.reason}</span>
                  <span className="font-semibold text-gray-800">
                    {r.orders}× · {brl(r.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title="Conciliação e caixa">
        <Card title="Troco fornecido" value={brl(cash.changeGiven)} />
        <Card
          title="Sangrias de caixa"
          value={cash.bleedTotal == null ? <Muted>{NO_DATA}</Muted> : brl(cash.bleedTotal)}
          sub={cash.bleedTotal == null ? 'Sem lançamentos de caixa ainda' : cash.supplyTotal ? `Suprimentos ${brl(cash.supplyTotal)}` : undefined}
        />
        <Card title="Cashback emitido" value={brl(cash.cashbackIssued)} sub={`Venceu sem uso: ${brl(cash.cashbackExpiredUnused)}`} />
        <Card
          title="Cashback resgatado"
          value={brl(cash.cashbackRedeemed)}
          sub={`Taxa de resgate ${pct(cash.cashbackRedemptionRatePercent)}`}
        />
      </Section>

      <Section title="Clientes (CRM)">
        <Card title="Clientes atendidos" value={int(crm.customersServed)} sub={`${int(crm.identifiedCustomers)} com conta`} />
        <Card
          title="Novos vs. recorrentes"
          value={`${int(crm.newCustomers)} / ${int(crm.returningCustomers)}`}
          sub={`Retenção ${pct(crm.retentionRatePercent)}`}
        />
        <Card title="LTV médio" value={brl(crm.averageLtv)} sub="Gasto total médio por cliente com conta" />
        <Card title="Verificados (selo azul)" value={pct(crm.verifiedPercent)} sub={`${int(crm.verifiedCustomers)} de ${int(crm.identifiedCustomers)}`} />
      </Section>
    </div>
  );
}
