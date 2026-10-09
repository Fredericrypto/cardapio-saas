# Calculadora de Gestão (Z6-04, 08/10/2026)

Aplicar POR CIMA do Z6-03 (ajustes-sidebar-config-mesas-patch-2026-10-08-0743).

## Onde ficou e por quê
Implementada no **frontend-admin** (rota `/calculadora`, item "Calculadora" no menu), não no frontend-cardapio:
o cardápio é o app PÚBLICO do cliente e não tem login nem acesso a custo (regra 26 do handoff: custo nunca vai ao cliente).
A aba Análise, os custos, o RBAC e o painel do gerente estão todos no admin. Permissão: reaproveita `analytics:view`
(mesmos dados financeiros) — sem migration, sem cargo novo, sem mudança no backend. Nenhuma dependência nova (sem npm install).

Pastas seguem o padrão REAL do projeto: `lib/calculator/` (no lugar de `utils/`) e `contexts/` (no lugar de `context/`).

## Estrutura
- `types/managerCalculator.ts` — contratos (CalculatorCategory, AnalyticsDataPayload, CalculatorDraft, ComparisonScenario...).
- `lib/calculator/calculatorMath.ts` — contas em BigInt (centavos e centésimos de %), sem float; arredondamento só no fim.
- `lib/calculator/calculatorExpression.ts` — visor: avaliador sem eval(), ponto fixo; regras do teclado (tela e físico).
- `lib/calculator/calculatorStorage.ts` — sessão em localStorage (`frontend_cardapio_calc_session:<restaurante>`), histórico em IndexedDB (fallback localStorage).
- `lib/calculator/calculatorReport.ts` — resumo WhatsApp, CSV, JSON, relatório para PDF (impressão).
- `lib/calculator/calculatorAnalytics.ts` — ponte Análise → calculadora.
- `lib/calculator/calculatorMeta.ts` / `calculatorFormat.ts` — textos/campos e formatação (Intl pt-BR, nunca NaN).
- `contexts/ManagerCalculatorContext.tsx` — estado global (provider no AdminLayout: o estado sobrevive à troca de página).
- `components/manager-calculator/` — ManagerCalculatorModal (área de trabalho), DisplayAndKeypad, QuickFillFromAnalytics,
  CompareCalculationsModal, ManualAndFormulasModal, SaveAndExportMenu, CalculatorFields, CalculatorResults, ConfirmDialog.
- `pages/ManagerCalculatorPage.tsx` — a rota.

## Integração com a Análise (1 clique)
- Aba Análise: ícone de calculadora em cada item dos rankings (Top 10 / 10 menos vendidos) e botão "Simular na Calculadora" (resumo).
- Dentro da calculadora: "Importar da Análise" lista os itens do mês e o resumo.
- Preenche com dados REAIS: preço (receita ÷ unidades), custo (real ou CMV estimado), imposto e taxa de cartão da loja.
  O que a Análise não sabe (comissão do app, custos fixos) NÃO é inventado: fica em branco para o gerente.
- A margem desejada nasce igual à margem real do preço atual: simular sem mexer devolve o preço de hoje.
- Aviso no topo: `Dados importados da análise do item "X". Modifique os valores para simular novos cenários.`

## Persistência
Auto-save a cada mudança. Reabrir (ou trocar de página, ou fechar o navegador) restaura abas, campos, visor e histórico de contas.
Chave por restaurante: dois restaurantes no mesmo navegador não veem os rascunhos um do outro. Outra aba do navegador acompanha
(a última gravação vale). Dado corrompido no disco é descartado/sanitizado, nunca derruba a tela.

## Decisões a conhecer
- Botão "AC" (vermelho) pede confirmação; "C" e Esc limpam só a conta atual, na hora. "Limpar tudo" (área da simulação) pede confirmação.
- `%` no visor: `200 + 10% = 220` (10% do valor à esquerda), como calculadora comum.
- PDF: abre o diálogo de impressão com relatório limpo (logo, loja, parâmetros, resultados, viabilidade); escolher "Salvar como PDF".
  Não adicionei biblioteca de PDF para não criar dependência.
- Teclado físico vale só com o foco no painel da calculadora; teclas tratadas não sobem para o resto do app.
- Ícones: Lucide com strokeWidth 1.25–1.5; nenhum emoji.

BUILD_VERSION (admin): `2026-10-08-sessao-z6-04`. O frontend-cardapio não mudou.
