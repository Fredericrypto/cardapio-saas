import { useI18n } from '../i18n/I18nContext';
import { useCallback, useState } from 'react';
import { Share2 } from 'lucide-react';
import { FloatingNotice } from './FloatingNotice';
import { Tooltip } from './Tooltip';
import { MENU_BORDER, MENU_TEXT } from '../lib/menuTheme';

interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
  // 'overlay' = círculo branco sobre foto; 'chip' = ícone pequeno dentro de card.
  variant?: 'overlay' | 'chip' | 'glass';
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
//
// É o ÚNICO botão de compartilhar do app (cards de item, cards de promoção e
// páginas de detalhe) e já traz o balão "Share" do `Tooltip` embutido: quem usa
// não envolve em outro Tooltip e não há `title` nativo (seria um segundo balão).
// O invólucro é `contents` porque o botão é posicionado (absolute) pelo chamador
// em relação ao card e não pode ganhar um pai com caixa.
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

  // 'glass' = mesmo vidro do header do cardápio (botão fora da foto, sobre o wallpaper).
  const look =
    variant === 'glass'
      ? `h-10 w-10 border bg-transparent shadow-sm ring-1 ring-black/5 backdrop-blur-md ${MENU_BORDER}`
      : variant === 'overlay'
        ? 'w-9 h-9 bg-white/90 dark:bg-black/55 backdrop-blur-sm shadow-sm'
        : 'w-7 h-7 bg-white/90 dark:bg-black/55 backdrop-blur-sm shadow-sm';
  const tone = variant === 'glass' ? MENU_TEXT : 'text-[#374151] dark:text-white';

  return (
    <>
      <Tooltip label={t('share.share')} className="contents">
        <span
          role="button"
          tabIndex={0}
          aria-label={t('share.shareItem', { title })}
          onClick={share}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') void share(e);
          }}
          className={`${look} rounded-full flex items-center justify-center ${tone} active:scale-90 transition-transform cursor-pointer ${className}`}
        >
          <Share2 size={variant === 'chip' ? 14 : 17} strokeWidth={1.5} />
        </span>
      </Tooltip>
      {notice && <FloatingNotice message={notice} onDone={clearNotice} durationMs={3000} />}
    </>
  );
}
