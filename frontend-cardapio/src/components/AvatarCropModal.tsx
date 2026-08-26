import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { cropImageToFile } from '../lib/cropImage';

interface AvatarCropModalProps {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
  accentColor: string;
}

// Recorte circular igual Instagram/YouTube: arrasta pra reposicionar,
// desliza pra dar zoom, área de corte sempre redonda.
export function AvatarCropModal({ imageSrc, onCancel, onConfirm, accentColor }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const file = await cropImageToFile(imageSrc, croppedAreaPixels);
      onConfirm(file);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
        />
      </div>

      <div className="bg-black px-6 py-5 flex flex-col gap-4">
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white border border-white/20"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: accentColor }}
          >
            {isProcessing ? 'Processando...' : 'Usar foto'}
          </button>
        </div>
      </div>
    </div>
  );
}
