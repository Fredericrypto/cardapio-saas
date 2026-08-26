import { useState } from 'react';
import { Star, X, EyeOff } from 'lucide-react';
import { createReview } from '../lib/customer-api';
import type { MyReview } from '../lib/customer-api';

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-1"
          >
            <Star
              size={32}
              fill={filled ? '#F59E0B' : 'transparent'}
              className={filled ? 'text-amber-500' : 'text-gray-300'}
            />
          </button>
        );
      })}
    </div>
  );
}

type Step = 'form' | 'confirm-cancel' | 'confirm-submit';

// Modal de avaliação — pensado como notificação, não como formulário
// escondido numa tela. Duas confirmações de propósito, as duas
// deliberadas (decisão de produto, não fricção por fricção):
//   1. Cancelar pede confirmação — evita perder o prompt sem querer
//      num toque errado, já que ele não vai reaparecer sozinho depois
//      (fica só acessível manualmente pelo cupom).
//   2. Enviar pede confirmação avisando que NÃO dá pra editar depois —
//      o cliente precisa saber disso ANTES de mandar, não descobrir
//      depois tentando editar e não conseguindo.
export function ReviewModal({
  tenantId,
  token,
  orderId,
  orderLabel,
  onClose,
  onSubmitted,
}: {
  tenantId: string;
  token: string;
  orderId: string;
  orderLabel: string;
  onClose: () => void;
  onSubmitted: (review: MyReview) => void;
}) {
  const [step, setStep] = useState<Step>('form');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCancelClick() {
    setStep('confirm-cancel');
  }

  function handleSubmitClick() {
    setError(null);
    if (rating === 0) {
      setError('Escolhe de 1 a 5 estrelas primeiro.');
      return;
    }
    setStep('confirm-submit');
  }

  async function handleConfirmSubmit() {
    setIsSaving(true);
    setError(null);
    try {
      const created = await createReview(tenantId, token, {
        orderId,
        rating,
        comment: comment.trim() || undefined,
        isAnonymous,
      });
      onSubmitted(created);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível enviar. Tenta de novo.');
      setStep('form');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 animate-in slide-in-from-bottom sm:zoom-in duration-200">
        {step === 'form' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {orderLabel}
              </p>
              <button onClick={handleCancelClick} className="text-gray-400 p-1 -mr-1">
                <X size={18} />
              </button>
            </div>
            <div className="text-center">
              <p className="text-lg font-display font-bold text-gray-900">Como foi o seu pedido?</p>
              <p className="text-sm text-gray-400 mt-0.5">Sua opinião ajuda todo mundo.</p>
            </div>
            <StarPicker value={rating} onChange={setRating} />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte como foi (opcional)"
              maxLength={1000}
              rows={3}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none w-full"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4"
              />
              <EyeOff size={14} className="text-gray-400" />
              Publicar como anônimo
            </label>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCancelClick}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Agora não
              </button>
              <button
                onClick={handleSubmitClick}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold"
              >
                Enviar
              </button>
            </div>
          </>
        )}

        {step === 'confirm-cancel' && (
          <>
            <p className="text-lg font-display font-bold text-gray-900 text-center">
              Não quer avaliar agora?
            </p>
            <p className="text-sm text-gray-500 text-center">
              Sem problema — se mudar de ideia, esse pedido continua no seu histórico e você pode
              avaliar por lá quando quiser.
            </p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setStep('form')}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Voltar
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold"
              >
                Fechar
              </button>
            </div>
          </>
        )}

        {step === 'confirm-submit' && (
          <>
            <div className="flex justify-center">
              <StarPicker value={rating} onChange={() => {}} />
            </div>
            <p className="text-lg font-display font-bold text-gray-900 text-center">Confirmar envio?</p>
            <p className="text-sm text-gray-500 text-center">
              Depois de enviada, sua avaliação{' '}
              <span className="font-semibold text-gray-700">não pode mais ser editada</span> — só
              apagada, se você quiser. Confirma o envio?
            </p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setStep('form')}
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-50"
              >
                Revisar
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
              >
                {isSaving ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
