import { useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { AvatarCropModal } from './AvatarCropModal';
import { PRESET_AVATAR_IDS, presetAvatarPath } from '../lib/presetAvatars';

interface AvatarPickerModalProps {
  onClose: () => void;
  onSelectPreset: (presetId: string) => void;
  onSelectPhoto: (file: File) => void;
  accentColor: string;
  isSaving: boolean;
}

const MAX_SOURCE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// "Escolher Avatar" — bottom sheet com duas opções: tirar/escolher uma
// foto (com recorte circular) ou pegar um dos avatares prontos. Às
// vezes a pessoa não quer usar foto de verdade, e tudo bem.
export function AvatarPickerModal({
  onClose,
  onSelectPreset,
  onSelectPhoto,
  accentColor,
  isSaving,
}: AvatarPickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Formato inválido. Use JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_SOURCE_SIZE_BYTES) {
      setError('Imagem muito grande. Escolha uma foto menor.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPendingImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  if (pendingImageSrc) {
    return (
      <AvatarCropModal
        imageSrc={pendingImageSrc}
        accentColor={accentColor}
        onCancel={() => setPendingImageSrc(null)}
        onConfirm={(file) => {
          setPendingImageSrc(null);
          onSelectPhoto(file);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-white rounded-t-3xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-gray-900">Escolher foto de perfil</p>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
          style={{ backgroundColor: accentColor }}
        >
          <Camera size={16} />
          Tirar ou escolher foto
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

        <p className="text-xs font-semibold text-gray-500 mt-5 mb-2">Ou escolha um avatar</p>
        <div className="grid grid-cols-5 gap-3">
          {PRESET_AVATAR_IDS.map((presetId) => (
            <button
              key={presetId}
              onClick={() => onSelectPreset(presetId)}
              disabled={isSaving}
              className="aspect-square rounded-full overflow-hidden border border-gray-100 disabled:opacity-60"
            >
              <img src={presetAvatarPath(presetId)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
