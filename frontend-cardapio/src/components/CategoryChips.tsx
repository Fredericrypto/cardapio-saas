import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Category } from '../types';
import { getCategoryIcon } from './CategoryIcon';
import { useAccentColor } from '../hooks/useAccentColor';
import { MENU_BORDER, MENU_TEXT_MUTED } from '../lib/menuTheme';

interface CategoryChipsProps {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  primaryColor: string;
}

// Abas com ícone em cima e a palavra embaixo, centralizadas (pedido do
// Felipe, sessão S/T) — cada aba tem área de toque generosa (px-4/py-2,
// largura mínima 76px) e o conjunto fica centralizado na tela. Ativa em
// preto/negrito com friso embaixo na cor do tenant, as outras em cinza —
// o ícone segue a mesma cor via `currentColor`.
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
  primaryColor,
}: CategoryChipsProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreToRight, setHasMoreToRight] = useState(false);

  // Seta "→" só quando há MAIS de 4 abas (contando "Todos") E de fato dá
  // pra rolar pra direita; some quando o cliente chega no fim da lista.
  const tabCount = categories.length + 1;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const overflows = el.scrollWidth > el.clientWidth + 4;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      setHasMoreToRight(tabCount > 4 && overflows && !atEnd);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [tabCount]);

  // Mantém a aba ativa visível: no desktop a barra rola na horizontal, e ao
  // escolher uma categoria (ou rolar a lista) a aba selecionada é trazida pro
  // centro. Rola só o container das abas (nunca a página inteira).
  useEffect(() => {
    const el = scrollRef.current;
    const active = el?.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || !active) return;
    const left = Math.max(0, active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2);
    el.scrollTo({ left, behavior: 'smooth' });
  }, [activeCategoryId]);

  return (
    <div className={`relative border-b ${MENU_BORDER}`}>
    <div ref={scrollRef} className="overflow-x-auto no-scrollbar">
      {/* `w-max min-w-full justify-center` centraliza quando cabe na tela e, quando não
          cabe, continua rolando normal pra esquerda (justify-center
          direto cortaria o começo da lista). */}
      <div className="flex w-max min-w-full justify-center md:justify-start gap-2 md:gap-1 px-3 md:px-0 pt-1.5 md:pt-0">
      <Tab
        label={t('categoryChips.todos')}
        isActive={activeCategoryId === null}
        onClick={() => onSelect(null)}
        primaryColor={primaryColor}
      />
      {categories.map((category) => (
        <Tab
          key={category.id}
          label={categoryLabel(category, t)}
          categoryKey={category.key}
          isActive={activeCategoryId === category.id}
          onClick={() => onSelect(category.id)}
          primaryColor={primaryColor}
        />
      ))}
      </div>
    </div>
    {hasMoreToRight && (
      <div className="pointer-events-none absolute right-0 top-0 h-full w-10 flex items-center justify-end pr-1.5 bg-gradient-to-l from-[#FFFFFF] via-[#FFFFFF]/90 to-transparent dark:from-[#131314] dark:via-[#131314]/90 dark:to-transparent">
        <ArrowRight size={14} strokeWidth={2} className={MENU_TEXT_MUTED} />
      </div>
    )}
    </div>
  );
}

function Tab({
  label,
  categoryKey,
  isActive,
  onClick,
  primaryColor,
}: {
  label: string;
  categoryKey?: string | null;
  isActive: boolean;
  onClick: () => void;
  primaryColor: string;
}) {
  const Icon = getCategoryIcon(categoryKey ?? (label === 'Todos' ? 'todos' : null), label);
  // Friso da aba ativa: a cor principal do restaurante pode ser escura demais
  // sobre o fundo escuro (o padrão é #3d3846) — o hook devolve uma variante
  // legível, a mesma usada no preço promocional do ProductCard.
  const accent = useAccentColor(primaryColor);
  const colorClass = isActive
    ? 'text-[#111827] dark:text-white'
    : 'text-[#9CA3AF] dark:text-[#8E918F]';

  return (
    <button
      onClick={onClick}
      data-active={isActive ? 'true' : 'false'}
      className={`shrink-0 flex flex-col md:flex-row items-center gap-2 px-4 pt-2 pb-2 md:py-3 min-w-[76px] md:min-w-0 transition-colors active:bg-[#F9FAFB] md:hover:bg-[#F9FAFB] dark:active:bg-[#282A2C] dark:md:hover:bg-[#282A2C] rounded-t-xl ${colorClass}`}
      style={{
        borderBottom: isActive ? `2.5px solid ${accent}` : '2.5px solid transparent',
      }}
    >
      {Icon && (
        <span className="h-6 md:h-5 flex items-center justify-center">
          <Icon size={22} />
        </span>
      )}
      <span className="text-sm whitespace-nowrap" style={{ fontWeight: isActive ? 700 : 500 }}>
        {label}
      </span>
    </button>
  );
}
