import { useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { setProductImages, uploadProductImages } from '../lib/admin-api';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_PRODUCT_IMAGES,
  getProductImages,
  moveItem,
  planAddition,
  removeAt,
  validateImageFile,
} from '../lib/productImages';
import type { Product } from '../types';

// Seção "Fotos do item" da edição do produto: até 5 fotos, a primeira é a CAPA
// (a que aparece no card do cardápio). Cada ação é salva NA HORA (não depende do
// botão "Salvar alterações" do formulário): enviar, reordenar e remover. A tela
// responde de imediato (otimista) e volta ao estado anterior se o servidor recusar.

function apiMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const message = (err as { response?: { data?: { message?: unknown } } }).response?.data?.message;
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message)) {
      const first = message.find((m): m is string => typeof m === 'string' && m.length > 0);
      if (first) return first;
    }
  }
  return fallback;
}

const LIMIT_MESSAGE = `Limite de ${MAX_PRODUCT_IMAGES} fotos por item. Remova uma foto para adicionar outra.`;

export function ProductImagesEditor({
  product,
  onChange,
}: {
  product: Product;
  onChange: (updated: Product) => void;
}) {
  const [images, setImages] = useState<string[]>(() => getProductImages(product));
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const atLimit = images.length >= MAX_PRODUCT_IMAGES;

  // Grava a nova ordem/lista (reordenar ou remover).
  async function persist(next: string[]) {
    const previous = images;
    setImages(next);
    setBusy(true);
    setWarning(null);
    setConfirmRemove(null);
    try {
      const updated = await setProductImages(product.id, next);
      setImages(getProductImages(updated));
      onChange(updated);
    } catch (err) {
      setImages(previous);
      setWarning(apiMessage(err, 'Não foi possível salvar as fotos. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (picked.length === 0 || busy) return;

    const messages: string[] = [];
    const valid: File[] = [];
    for (const file of picked) {
      const problem = validateImageFile(file);
      if (problem) messages.push(`"${file.name}": ${problem}.`);
      else valid.push(file);
    }

    const { accepted, ignored } = planAddition(images.length, valid.length);
    if (ignored > 0) {
      messages.unshift(
        accepted === 0
          ? LIMIT_MESSAGE
          : `Limite de ${MAX_PRODUCT_IMAGES} fotos por item: ${accepted === 1 ? 'só 1 foi adicionada' : `só ${accepted} foram adicionadas`} e ${ignored === 1 ? '1 foi ignorada' : `${ignored} foram ignoradas`}.`,
      );
    }
    const toUpload = valid.slice(0, accepted);
    if (toUpload.length === 0) {
      setWarning(messages.join(' ') || null);
      return;
    }

    setBusy(true);
    setWarning(null);
    setConfirmRemove(null);
    try {
      const updated = await uploadProductImages(product.id, toUpload);
      setImages(getProductImages(updated));
      onChange(updated);
      setWarning(messages.length > 0 ? messages.join(' ') : null);
    } catch (err) {
      setWarning(apiMessage(err, 'Não foi possível enviar as fotos. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  function resetDrag() {
    setDragFrom(null);
    setDragOver(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, target: number) {
    event.preventDefault();
    const from = dragFrom;
    resetDrag();
    if (from === null || from === target || busy) return;
    void persist(moveItem(images, from, target));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Fotos do item</p>
        <span className={`text-xs font-semibold ${atLimit ? 'text-amber-700' : 'text-gray-400'}`}>
          {images.length}/{MAX_PRODUCT_IMAGES}
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        A primeira foto é a capa. Arraste as miniaturas ou use as setas para reordenar. As alterações de fotos são
        salvas na hora.
      </p>

      {warning && (
        <div
          role="alert"
          className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs leading-relaxed"
        >
          <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <p className="flex-1">{warning}</p>
          <button type="button" onClick={() => setWarning(null)} aria-label="Fechar aviso" title="Fechar aviso" className="shrink-0">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {images.map((url, index) => {
          const isCover = index === 0;
          const isDropTarget = dragOver === index && dragFrom !== null && dragFrom !== index;
          return (
            <div
              key={url}
              data-photo={index}
              draggable={!busy}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index)); // o Firefox só inicia o arrasto com isso
                setDragFrom(index);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOver !== index) setDragOver(index);
              }}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={resetDrag}
              className={`relative aspect-square rounded-lg overflow-hidden border bg-gray-100 ${
                isDropTarget ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-200'
              } ${dragFrom === index ? 'opacity-40' : ''} ${busy ? '' : 'cursor-grab'}`}
            >
              <img src={url} alt={`Foto ${index + 1} de ${images.length}`} draggable={false} className="w-full h-full object-cover" />

              {isCover && (
                <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  Capa
                </span>
              )}

              {confirmRemove === index ? (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-white">
                  <p className="text-[11px] font-semibold">Remover foto?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void persist(removeAt(images, index))}
                      aria-label="Confirmar remoção da foto"
                      title="Confirmar remoção"
                      className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center"
                    >
                      <Check size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(null)}
                      aria-label="Cancelar remoção"
                      title="Cancelar"
                      className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center"
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmRemove(index)}
                    aria-label={`Remover foto ${index + 1}`}
                    title="Remover foto"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-40"
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                  <div className="absolute bottom-1 inset-x-1 flex items-center justify-between">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => void persist(moveItem(images, index, index - 1))}
                      aria-label={`Mover foto ${index + 1} para a esquerda`}
                      title="Mover para a esquerda"
                      className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowLeft size={12} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === images.length - 1}
                      onClick={() => void persist(moveItem(images, index, index + 1))}
                      aria-label={`Mover foto ${index + 1} para a direita`}
                      title="Mover para a direita"
                      className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowRight size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {atLimit ? (
          // No limite: o botão continua clicável para EXPLICAR por que não adiciona.
          <button
            type="button"
            data-add-photo
            onClick={() => setWarning(LIMIT_MESSAGE)}
            aria-disabled="true"
            title="Limite de fotos atingido"
            className="aspect-square rounded-lg border border-dashed border-gray-200 text-gray-300 flex flex-col items-center justify-center gap-1 text-[11px]"
          >
            <ImagePlus size={18} strokeWidth={1.5} />
            Limite atingido
          </button>
        ) : (
          <label
            data-add-photo
            title="Adicionar fotos"
            className={`aspect-square rounded-lg border border-dashed border-gray-300 text-gray-500 flex flex-col items-center justify-center gap-1 text-[11px] ${
              busy ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-gray-50'
            }`}
          >
            {busy ? <Loader2 size={18} strokeWidth={1.5} className="animate-spin" /> : <ImagePlus size={18} strokeWidth={1.5} />}
            {busy ? 'Salvando...' : 'Adicionar'}
            <input
              type="file"
              multiple
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              disabled={busy}
              onChange={(e) => void handleFiles(e)}
              className="hidden"
            />
          </label>
        )}
      </div>
    </div>
  );
}
