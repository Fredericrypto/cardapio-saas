import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, X } from 'lucide-react';
import { calcBreakEven, calcCmv, calcDelivery, calcPricing, calcRecipe, cmvStatus } from '../../lib/calculator/calculatorMath';
import { formatBRL, formatPercent } from '../../lib/calculator/calculatorFormat';

type TabId = 'inicio' | 'preco' | 'cmv' | 'equilibrio' | 'delivery' | 'formulas';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'inicio', label: 'Como usar' },
  { id: 'preco', label: 'Precificação & Markup' },
  { id: 'cmv', label: 'CMV' },
  { id: 'equilibrio', label: 'Ponto de equilíbrio' },
  { id: 'delivery', label: 'Apps de delivery' },
  { id: 'formulas', label: 'Todas as fórmulas' },
];

function Formula({ title, formula, legend, example }: { title: string; formula: string; legend: Array<[string, string]>; example?: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
      <h4 className="text-xs font-bold text-gray-900">{title}</h4>
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[13px] font-mono text-sky-700 dark:text-sky-300">{formula}</pre>
      <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {legend.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[11px] font-mono font-semibold text-violet-600 dark:text-violet-300">{k}</dt>
            <dd className="text-[11px] text-gray-500">{v}</dd>
          </div>
        ))}
      </dl>
      {example && <div className="rounded-lg bg-gray-50 px-3.5 py-3 text-xs text-gray-600 leading-relaxed"><span className="font-semibold text-gray-800">Exemplo: </span>{example}</div>}
    </section>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="text-sm text-gray-600 leading-relaxed">{children}</p>;
const H = ({ children }: { children: ReactNode }) => <h3 className="text-sm font-bold text-gray-900">{children}</h3>;

export function ManualAndFormulasModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('inicio');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Os exemplos usam AS MESMAS funções da calculadora: o manual nunca contradiz a tela.
  const ex = useMemo(() => {
    const pricing = calcPricing({ cost: '10', tax: '6', card: '2.5', margin: '25', currentPrice: '13.35' });
    const cmv = calcCmv({ stockStart: '5000', purchases: '12000', stockEnd: '4000', revenue: '40000' });
    const be = calcBreakEven({ fixedCosts: '30000', variablePct: '40', days: '30', avgTicket: '50' });
    const del = calcDelivery({ price: '50', commission: '27', transaction: '3.2', tax: '6', cost: '15' });
    const del2 = calcDelivery({ price: '30', commission: '27', transaction: '3.2', tax: '6', cost: '25' });
    const recipe = calcRecipe(
      { portions: '4' },
      [
        { id: 'a', name: 'Queijo', usedQty: '250', packQty: '1000', packPrice: '42' },
        { id: 'b', name: 'Cebola', usedQty: '0.5', packQty: '3', packPrice: '4.5' },
      ],
    );
    return { pricing, cmv, be, del, del2, recipe };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Manual do Gestor" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <BookOpen size={16} strokeWidth={1.5} />
              Manual do Gestor & Fórmulas
            </h2>
            <p className="text-xs text-gray-400 mt-1">Explicações simples e todas as contas que a calculadora faz.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div role="tablist" aria-label="Capítulos do manual" className="flex w-full shrink-0 gap-1.5 overflow-x-auto whitespace-nowrap px-5 py-3 border-b border-gray-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold leading-4 border ${tab === t.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 p-5 flex flex-col gap-4 overflow-y-auto" role="tabpanel">
          {tab === 'inicio' && (
            <>
              <H>Bem-vindo à Calculadora de Gestão</H>
              <P>
                Esta calculadora foi feita sob medida para a sua plataforma de cardápio digital e calibrada para a realidade de restaurante: impostos,
                taxa de cartão, comissão de aplicativo e custo de ingrediente entram na conta desde o início. O objetivo é um só: que cada prato vendido
                deixe dinheiro de verdade no caixa.
              </P>
              <H>O que dá para fazer</H>
              <ul className="list-disc pl-5 text-sm text-gray-600 flex flex-col gap-1.5 leading-relaxed">
                <li><strong>Importar da Análise:</strong> na aba Análise, o botão de simular abre a calculadora já com custo, preço e taxas reais do item.</li>
                <li><strong>Várias simulações ao mesmo tempo:</strong> cada aba é um rascunho (ex.: "Burguer", "Promoção iFood", "Meta do mês").</li>
                <li><strong>Nada se perde:</strong> tudo é salvo sozinho. Pode trocar de página ou fechar o navegador: ao voltar, está tudo como você deixou.</li>
                <li><strong>Comparar cenários:</strong> escolha 2 ou 3 simulações e veja lado a lado qual rende mais e qual é mais arriscada.</li>
                <li><strong>Exportar:</strong> PDF (pela impressão do navegador), CSV para planilha, JSON, ou um resumo pronto para mandar no WhatsApp.</li>
              </ul>
              <H>Teclado</H>
              <P>
                Clique no painel da calculadora e use o teclado do computador: números, + − * /, vírgula, Enter para calcular, Backspace para apagar e Esc
                para limpar a conta. O símbolo % funciona como em calculadora comum: <strong>200 + 10% = 220</strong> (10% do valor à esquerda).
              </P>
            </>
          )}

          {tab === 'preco' && (
            <>
              <H>Precificação & Markup</H>
              <P>
                Markup é o número pelo qual você multiplica o custo para chegar ao preço. O erro mais comum é dobrar o custo (custo × 2) ou somar as
                porcentagens em cima do custo. Só que impostos, taxa de cartão e lucro são porcentagens <strong>do preço de venda</strong>, não do custo.
                Por isso a conta certa divide o custo por "1 menos as porcentagens".
              </P>
              <Formula
                title="Preço de venda sugerido"
                formula={'Preço = Custo ÷ (1 − (Impostos% + Cartão% + Delivery% + Margem%) ÷ 100)'}
                legend={[
                  ['Custo', 'quanto custa fazer o prato (ficha técnica), em R$'],
                  ['Impostos%', 'ex.: 6% do Simples Nacional'],
                  ['Cartão%', 'taxa da maquininha, ex.: 2,5%'],
                  ['Delivery%', 'comissão do app, se vender por ele'],
                  ['Margem%', 'lucro limpo que você quer em cima do preço'],
                ]}
                example={
                  <>
                    Hambúrguer que custa R$ 10,00, Simples de 6%, cartão de 2,5% e 25% de lucro limpo: o preço correto é{' '}
                    <strong>{formatBRL(ex.pricing.suggestedPrice)}</strong>, e não {formatBRL(13.35)} (o que sai de somar 33,5% ao custo). A R$ 13,35 o lucro
                    real seria só {formatBRL(ex.pricing.currentProfit)} ({formatPercent(ex.pricing.currentMarginPercent)}), bem longe dos 25% sonhados.
                  </>
                }
              />
              <P>
                A calculadora avisa se a soma de impostos, taxas e margem chegar a 100% ou mais: nesse caso não existe preço possível, porque toda a venda
                já estaria comprometida.
              </P>
            </>
          )}

          {tab === 'cmv' && (
            <>
              <H>CMV: Custo de Mercadoria Vendida</H>
              <P>
                É quanto da sua receita foi gasto só com ingredientes e mercadorias. Quanto menor, mais sobra para pagar equipe, aluguel e ter lucro. Faixas
                de referência para o setor: <strong>entre 28% e 32% é o ideal</strong>; acima de 35% acende o alerta. Hamburguerias e pizzarias costumam
                trabalhar perto de 28% a 33%; restaurantes a quilo, 30% a 38%; bares, por causa das bebidas, às vezes ficam abaixo de 30%. Use como
                referência, não como lei: o seu cardápio e o seu preço mandam.
              </P>
              <Formula
                title="CMV %"
                formula={'CMV% = ((Estoque inicial + Compras − Estoque final) ÷ Faturamento bruto) × 100'}
                legend={[
                  ['Estoque inicial', 'valor em R$ do estoque no começo do período'],
                  ['Compras', 'tudo o que foi comprado no período'],
                  ['Estoque final', 'valor em R$ do estoque no fim do período'],
                  ['Faturamento bruto', 'total vendido no período, antes de descontos'],
                ]}
                example={
                  <>
                    Estoque inicial R$ 5.000, compras R$ 12.000, estoque final R$ 4.000 e vendas de R$ 40.000: gastou {formatBRL(ex.cmv.cmvAmount)} em
                    mercadoria, CMV de <strong>{formatPercent(ex.cmv.cmvPercent)}</strong> ({cmvStatus(ex.cmv.cmvPercent) === 'atencao' ? 'um pouco acima do ideal' : 'dentro do esperado'}).
                  </>
                }
              />
            </>
          )}

          {tab === 'equilibrio' && (
            <>
              <H>Ponto de equilíbrio</H>
              <P>
                É o faturamento mínimo para o mês fechar no zero a zero: sem lucro, mas sem prejuízo. Abaixo dele você está pagando para trabalhar. Os custos
                fixos são os que você paga vendendo ou não (aluguel, salários, energia). Os variáveis crescem com a venda (ingredientes, impostos, taxas).
              </P>
              <Formula
                title="Margem de contribuição, faturamento mínimo e meta diária"
                formula={'MC% = 100 − Custos variáveis%\nFaturamento mínimo = Custos fixos ÷ (MC% ÷ 100)\nMeta diária = Faturamento mínimo ÷ Dias de funcionamento'}
                legend={[
                  ['MC%', 'quanto de cada R$ 100 vendidos sobra para pagar os custos fixos'],
                  ['Custos fixos', 'total do mês, em R$'],
                  ['Custos variáveis%', 'ingredientes + impostos + taxas, como % da venda'],
                  ['Dias', 'quantos dias o restaurante abre no mês'],
                ]}
                example={
                  <>
                    Custos fixos de R$ 30.000 e variáveis de 40%: sobram {formatPercent(ex.be.contributionMarginPercent)} de cada venda, então é preciso
                    faturar <strong>{formatBRL(ex.be.requiredRevenue)}</strong> por mês: {formatBRL(ex.be.dailyTarget)} por dia em {ex.be.days} dias, ou
                    cerca de {ex.be.ordersPerDay} pedidos por dia com ticket médio de R$ 50,00.
                  </>
                }
              />
            </>
          )}

          {tab === 'delivery' && (
            <>
              <H>Apps de delivery: a ilusão do faturamento bruto</H>
              <P>
                O app mostra o valor da venda, mas você não recebe tudo isso: a comissão (por exemplo, de 12% a 27%) e a taxa de pagamento online saem antes,
                e o imposto ainda é calculado sobre o preço cheio. Quando se olha só o faturamento bruto, parece que o app vai bem, mas a margem real pode
                ser muito menor, ou até negativa.
              </P>
              <Formula
                title="Margem líquida real em apps"
                formula={'Recebido = Preço × (1 − (Comissão% + Transação%) ÷ 100)\nLucro real = Recebido − Custo do prato − (Preço × Imposto% ÷ 100)\nMargem real% = (Lucro real ÷ Preço) × 100'}
                legend={[
                  ['Preço', 'valor do prato no app'],
                  ['Comissão%', 'percentual cobrado pelo app'],
                  ['Transação%', 'taxa do pagamento online'],
                  ['Custo do prato', 'custo de produção, em R$'],
                ]}
                example={
                  <>
                    Prato de R$ 50,00 no app (comissão 27%, transação 3,2%, imposto 6%, custo R$ 15,00): você recebe {formatBRL(ex.del.receivedFromApp)}
                    {' '}e o lucro real é <strong>{formatBRL(ex.del.netProfit)}</strong> ({formatPercent(ex.del.netMarginPercent)}). Já um prato de R$ 30,00
                    com custo de R$ 25,00 dá {formatBRL(ex.del2.netProfit)} por venda: prejuízo.
                  </>
                }
              />
            </>
          )}

          {tab === 'formulas' && (
            <>
              <H>Todas as fórmulas da calculadora</H>
              <Formula
                title="1. Preço sugerido"
                formula={'Preço = Custo ÷ (1 − (Impostos% + Cartão% + Delivery% + Margem%) ÷ 100)\nLucro bruto = Preço − Custo − Impostos − Cartão − Delivery'}
                legend={[['Regra', 'a soma de impostos, taxas e margem deve ser menor que 100%']]}
              />
              <Formula
                title="2. CMV"
                formula={'CMV% = ((Estoque inicial + Compras − Estoque final) ÷ Faturamento bruto) × 100'}
                legend={[['Alerta', 'acima de 35%; ideal entre 28% e 32%']]}
              />
              <Formula
                title="3. Ponto de equilíbrio"
                formula={'MC% = 100 − Custos variáveis%\nFaturamento mínimo = Custos fixos ÷ (MC% ÷ 100)\nMeta diária = Faturamento mínimo ÷ Dias\nPedidos/dia = Meta diária ÷ Ticket médio (arredondado para cima)'}
                legend={[['Regra', 'custos variáveis devem ser menores que 100%']]}
              />
              <Formula
                title="4. Delivery"
                formula={'Recebido = Preço × (1 − (Comissão% + Transação%) ÷ 100)\nLucro real = Recebido − Custo − (Preço × Imposto% ÷ 100)\nMargem real% = (Lucro real ÷ Preço) × 100\nPreço para a margem desejada = Custo ÷ (1 − (Comissão% + Transação% + Imposto% + Margem%) ÷ 100)'}
                legend={[['Regra', 'comissão + transação devem ser menores que 100%']]}
              />
              <Formula
                title="5. Ficha técnica"
                formula={'Custo da linha = (Qtd. usada ÷ Qtd. da embalagem) × Preço da embalagem\nCusto total = soma das linhas\nCusto por porção = Custo total ÷ Porções'}
                legend={[['Atenção', 'use a mesma unidade (g, ml, un) na quantidade usada e na da embalagem']]}
                example={
                  <>
                    250 g de queijo (pacote de 1 kg por R$ 42,00) + meia cebola (3 por R$ 4,50) = {formatBRL(ex.recipe.totalCost)}; rendendo 4
                    porções, cada uma custa <strong>{formatBRL(ex.recipe.costPerPortion)}</strong>.
                  </>
                }
              />
              <Formula
                title="6. Visor (calculadora comum)"
                formula={'a + b%  →  a + (a × b ÷ 100)\na − b%  →  a − (a × b ÷ 100)\nb%      →  b ÷ 100'}
                legend={[['Precisão', 'as contas do visor são exatas (0,1 + 0,2 = 0,3), sem erros de arredondamento']]}
              />
              <P>
                Precisão: todo valor em reais é calculado em centavos inteiros e as porcentagens em centésimos de ponto, com arredondamento só no final. Por
                isso as parcelas sempre fecham no centavo com o total.
              </P>
            </>
          )}
        </div>
      </div>
    </div>
  );
}