import { useI18n } from '../i18n/I18nContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { AvatarCropModal } from './AvatarCropModal';
import { PRESET_AVATAR_IDS, presetAvatarPath } from '../lib/presetAvatars';
import { Tooltip } from './Tooltip';
import { MENU_SURFACE, MENU_BORDER, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';

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
  const { t } = useI18n();
  // Com o modal aberto a página atrás NÃO rola (02/10).
  useScrollLock(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('avatarPickerModal.formato_invalido_use_jpeg'));
      return;
    }
    if (file.size > MAX_SOURCE_SIZE_BYTES) {
      setError(t('avatarPickerModal.imagem_muito_grande_escolha'));
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
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className={`${MENU_SURFACE} border ${MENU_BORDER} rounded-t-3xl md:rounded-3xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto shadow-xl`}>
        <div className="flex items-center justify-between mb-4">
          <p className={`font-display font-bold ${MENU_TEXT}`}>{t('avatarPickerModal.escolher_foto_de_perfil')}</p>
          <Tooltip label={t('common.cancel')}>
            <button onClick={onClose} aria-label={t('common.cancel')}>
              <X size={20} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
            </button>
          </Tooltip>
        </div>

        <Tooltip label={t('avatarPickerModal.tirar_ou_escolher_foto')} className="flex w-full">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
            style={{ backgroundColor: accentColor }}
          >
            <Camera size={16} strokeWidth={1.5} />
            {t('avatarPickerModal.tirar_ou_escolher_foto')}
          </button>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}

        <p className={`text-xs font-semibold ${MENU_TEXT_BODY} mt-5 mb-2`}>{t('avatarPickerModal.ou_escolha_um_avatar')}</p>
        <div className="grid grid-cols-5 gap-3">
          {PRESET_AVATAR_IDS.map((presetId) => (
            <button
              key={presetId}
              onClick={() => onSelectPreset(presetId)}
              disabled={isSaving}
              className="aspect-square rounded-full overflow-hidden border border-[#E5E7EB] dark:border-white/10 disabled:opacity-60 hover:opacity-90 transition-opacity"
            >
              <img src={presetAvatarPath(presetId)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
