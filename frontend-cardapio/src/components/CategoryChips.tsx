import type { Category } from '../types';

interface CategoryChipsProps {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  primaryColor: string;
}

// Abas de texto (não mais pills coloridas) — ativa em preto/negrito com
// friso embaixo na cor do tenant, as outras em cinza. Estilo das abas
// "Popular / Appetizer / Burger / Steak / Pizza" do print de referência.
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
  primaryColor,
}: CategoryChipsProps) {
  return (
    <div className="flex gap-5 px-4 pt-1 pb-2 overflow-x-auto no-scrollbar border-b border-gray-100">
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
  return (
    <button
      onClick={onClick}
      className="shrink-0 whitespace-nowrap pb-1.5 text-sm transition-colors"
      style={{
        fontWeight: isActive ? 700 : 500,
        color: isActive ? '#111827' : '#9CA3AF',
        borderBottom: isActive ? `2.5px solid ${primaryColor}` : '2.5px solid transparent',
      }}
    >
      {label}
    </button>
  );
}
