import { ShieldCheck } from 'lucide-react';

interface VerificationExplainerModalProps {
  primaryColor: string;
  onCancel: () => void;
  onContinue: () => void;
}

// Texto curto, direto, sem jargão — pedido explícito do Felipe: já deixa
// claro ANTES de tirar a foto que (1) a decisão é do estabelecimento,
// (2) pode ser recusada por motivos específicos, e (3) a foto precisa
// ser honesta e clara ("sem gracinhas", nas palavras dele).
export function VerificationExplainerModal({
  primaryColor,
  onCancel,
  onContinue,
}: VerificationExplainerModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: `${primaryColor}1A` }}
        >
          <ShieldCheck size={22} style={{ color: primaryColor }} />
        </div>
        <h2 className="font-display font-bold text-lg text-gray-900 mb-2">
          Como funciona a verificação
        </h2>
        <ul className="flex flex-col gap-2.5 text-sm text-gray-600 mb-5">
          <li>- Você vai tirar uma foto do seu rosto, na hora, pela câmera.</li>
          <li>
            - A decisão de aprovar é do <strong>estabelecimento</strong> — ele pode recusar por
            motivos específicos, como foto de baixa qualidade ou que não mostre seu rosto
            claramente.
          </li>
          <li>- Se for recusada, você vê o motivo e pode tentar de novo.</li>
          <li>- A foto enviada é excluída assim que a decisão sair (aprovada ou recusada).</li>
          <li className="font-medium text-gray-800">
            - Tire uma foto sua de verdade, com boa luz — fotos falsas ou de outra pessoa são
            recusadas.
          </li>
        </ul>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Agora não
          </button>
          <button
            onClick={onContinue}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: primaryColor }}
          >
            Entendi, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
