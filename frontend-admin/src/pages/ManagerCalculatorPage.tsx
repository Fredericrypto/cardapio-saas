import { ManagerCalculatorModal } from '../components/manager-calculator/ManagerCalculatorModal';

// Rota /calculadora. O estado vive no ManagerCalculatorProvider (AdminLayout), por isso
// trocar de aba do painel e voltar encontra tudo exatamente onde estava.
export function ManagerCalculatorPage() {
  return (
    <div className="p-6 max-w-6xl">
      <ManagerCalculatorModal />
    </div>
  );
}
