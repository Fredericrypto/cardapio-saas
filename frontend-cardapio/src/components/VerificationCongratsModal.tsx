import { VerifiedBadge } from './VerifiedBadge';

interface VerificationCongratsModalProps {
  primaryColor: string;
  onClose: () => void;
}

// Mostrado UMA vez, na próxima abertura do app depois da aprovação —
// controlado pelo campo `verificationCongratsPending` do perfil (some
// pra sempre assim que `onClose` chama o endpoint de "já vi").
export function VerificationCongratsModal({ primaryColor, onClose }: VerificationCongratsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
        <div className="flex justify-center mb-4">
          <VerifiedBadge variant="icon" size={56} />
        </div>
        <h2 className="font-display font-bold text-lg text-gray-900 mb-1.5">
          Você foi verificado!
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Seu perfil agora tem o selo de cliente verificado. Ele aparece pro estabelecimento
          sempre que você fizer um pedido.
        </p>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: primaryColor }}
        >
          Legal!
        </button>
      </div>
    </div>
  );
}
