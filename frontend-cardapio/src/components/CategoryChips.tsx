import type { ReactElement } from 'react';
import type { Category } from '../types';
import { TodosIcon, LanchesIcon, BebidasIcon, SobremesasIcon } from './MenuIcons';

interface CategoryChipsProps {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  primaryColor: string;
}

type IconComponent = (props: { size?: number; className?: string }) => ReactElement;

// Ícone por categoria (pedido do Felipe, sessão S, 27/09) — casamento por
// nome normalizado (sem acento, minúsculo) pra bater com "Lanches",
// "Bebidas", "Sobremesas" e o pseudo-item fixo "Todos" mesmo se o admin
// digitar com acento/maiúscula diferente. Categoria sem ícone mapeado
// (nome que o Felipe não previu) cai de volta pro texto sozinho, sem
// quebrar layout.
const CATEGORY_ICONS: Record<string, IconComponent> = {
  todos: TodosIcon,
  lanches: LanchesIcon,
  bebidas: BebidasIcon,
  sobremesas: SobremesasIcon,
};

function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

// Abas com ícone em cima e a palavra embaixo, centralizados (pedido do
// Felipe, sessão S) — mais espaçadas entre si (gap-7) e com uma folga
// maior entre ícone e texto do que a versão só-texto anterior. Ativa em
// preto/negrito com friso embaixo na cor do tenant, as outras em cinza —
// o ícone segue a mesma cor via `currentColor`.
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
  primaryColor,
}: CategoryChipsProps) {
  return (
    <div className="flex gap-7 px-4 pt-2 pb-2.5 overflow-x-auto no-scrollbar border-b border-gray-100">
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
          isActive={activeCategoryId === category.id}
          onClick={() => onSelect(category.id)}
          primaryColor={primaryColor}
        />
      ))}
    </div>
  );
}

function Tab({
  label,
  isActive,
  onClick,
  primaryColor,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  primaryColor: string;
}) {
  const Icon = CATEGORY_ICONS[normalize(label)];
  const color = isActive ? '#111827' : '#9CA3AF';

  return (
    <button
      onClick={onClick}
      className="shrink-0 flex flex-col items-center gap-1.5 pb-1.5 transition-colors"
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
