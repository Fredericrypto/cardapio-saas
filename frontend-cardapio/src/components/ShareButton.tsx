import { useI18n } from '../i18n/I18nContext';
import { useCallback, useState } from 'react';
import { Share2 } from 'lucide-react';
import { FloatingNotice } from './FloatingNotice';

interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
  // 'overlay' = círculo branco sobre foto; 'chip' = ícone pequeno dentro de card.
  variant?: 'overlay' | 'chip';
  className?: string;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para navegadores/WebViews sem a API assíncrona.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

// Compartilha pela folha nativa do aparelho (WhatsApp, Telegram, Instagram,
// e-mail...) e, onde ela não existe (desktop), copia o link e avisa.
// Usa <span role="button"> quando está dentro de um card clicável (um <button>
// dentro de <button> é HTML inválido) — o clique não propaga para o card.
export function ShareButton({ url, title, text, variant = 'overlay', className = '' }: ShareButtonProps) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);

  async function share(e: React.SyntheticEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return; // a pessoa fechou a folha
        // qualquer outra falha cai na cópia do link
      }
    }
    setNotice((await copyToClipboard(url)) ? t('share.copied') : t('share.failed'));
  }

  const look =
    variant === 'overlay'
      ? 'w-9 h-9 bg-white/90 shadow-md'
      : 'w-7 h-7 bg-white/90 shadow-sm';

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={t('share.shareItem', { title })}
        title={t('share.share')}
        onClick={share}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') void share(e);
        }}
        className={`${look} rounded-full flex items-center justify-center text-gray-700 active:scale-90 transition-transform cursor-pointer ${className}`}
      >
        <Share2 size={variant === 'overlay' ? 17 : 14} strokeWidth={1.5} />
      </span>
      {notice && <FloatingNotice message={notice} onDone={clearNotice} durationMs={3000} />}
    </>
  );
}
