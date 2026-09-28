import type { Category } from '../types';
import { getCategoryIcon } from './CategoryIcon';

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
  return (
    <div className="overflow-x-auto no-scrollbar border-b border-gray-100">
      {/* `w-max min-w-full justify-center` centraliza quando cabe na tela e, quando não
          cabe, continua rolando normal pra esquerda (justify-center
          direto cortaria o começo da lista). */}
      <div className="flex w-max min-w-full justify-center gap-2 px-3 pt-1.5">
      <Tab
        label="Todos"
        isActive={activeCategoryId === null}
        onClick={() => onSelect(null)}
        primaryColor={primaryColor}
      />
      {categories.map((category) => (
        <Tab
          key={category.id}
          label={category.name}
          categoryKey={category.key}
          isActive={activeCategoryId === category.id}
          onClick={() => onSelect(category.id)}
          primaryColor={primaryColor}
        />
      ))}
      </div>
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
  const color = isActive ? '#111827' : '#9CA3AF';

  return (
    <button
      onClick={onClick}
      className="shrink-0 flex flex-col items-center gap-2 px-4 pt-2 pb-2 min-w-[76px] transition-colors active:bg-gray-50 rounded-t-xl"
      style={{
        color,
        borderBottom: isActive ? `2.5px solid ${primaryColor}` : '2.5px solid transparent',
      }}
    >
      {Icon && (
        <span className="h-6 flex items-center justify-center">
          <Icon size={22} />
        </span>
      )}
      <span className="text-sm whitespace-nowrap" style={{ fontWeight: isActive ? 700 : 500 }}>
        {label}
      </span>
    </button>
  );
}
