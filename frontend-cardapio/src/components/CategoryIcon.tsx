import type { ReactElement } from 'react';
import {
  CakeSlice,
  Cake,
  Utensils,
  Popcorn,
  Salad,
  IceCreamCone,
  Wine,
  Soup,
  UtensilsCrossed,
  Beef,
  Fish,
  CookingPot,
  HandPlatter,
  Carrot,
  Leaf,
  Baby,
  ChefHat,
  Pizza,
  Users,
} from 'lucide-react';
import { TodosIcon, LanchesIcon, BebidasIcon } from './MenuIcons';

type IconComponent = (props: { size?: number; className?: string }) => ReactElement;

// Ícone de cada categoria do catálogo fixo (chave = a do backend, em
// `category-catalog.ts`). "todos", "lanches" e "bebidas" usam os SVGs que
// o Felipe mandou; as demais usam ícones de traço do lucide (mesma
// família visual do resto do app), com traço um pouco mais fino pra
// combinar com os desenhos em contorno dos três primeiros.
function line(Icon: typeof Utensils): IconComponent {
  return ({ size = 22, className }) => (
    <Icon size={size} strokeWidth={1.6} className={className} />
  );
}

// Torta (lucide não tem ícone de torta/pie): desenho próprio no mesmo
// estilo de traço 24x24 dos outros — forma de torta com cúpula de recheio
// e dois cortes de vapor no topo.
const TortaIcon: IconComponent = ({ size = 22, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 12h16l-1.6 7.2a1 1 0 0 1-1 .8H6.6a1 1 0 0 1-1-.8L4 12z" />
    <path d="M4.5 12c0-3 3.4-5.5 7.5-5.5s7.5 2.5 7.5 5.5" />
    <path d="M10 9l.8 2M14 9l-.8 2" />
  </svg>
);

export const CATEGORY_ICONS: Record<string, IconComponent> = {
  todos: TodosIcon,
  lanches: LanchesIcon,
  bebidas: BebidasIcon,
  sobremesas: line(CakeSlice),
  entradas: line(Utensils),
  petiscos: line(Popcorn),
  saladas: line(Salad),
  sorvetes: line(IceCreamCone),
  bolos: line(Cake),
  tortas: TortaIcon,
  vinhos: line(Wine),
  'sopas-caldos': line(Soup),
  'pratos-principais': line(UtensilsCrossed),
  'carnes-grelhados': line(Beef),
  'peixes-frutos-do-mar': line(Fish),
  'massas-risotos': line(CookingPot),
  'pratos-executivos': line(HandPlatter),
  acompanhamentos: line(Carrot),
  'menu-vegetariano': line(Leaf),
  'menu-infantil': line(Baby),
  'menu-degustacao': line(ChefHat),
  combinados: line(Pizza),
  'pratos-compartilhar': line(Users),
};

// Nomes do catálogo → chave, só pra achar o ícone de categorias LEGADAS
// (criadas à mão antes do catálogo, `key` nulo). Sem casamento, sem ícone.
const NAME_TO_KEY: Record<string, string> = {
  todos: 'todos',
  lanches: 'lanches',
  bebidas: 'bebidas',
  sobremesas: 'sobremesas',
  entradas: 'entradas',
  saladas: 'saladas',
  sorvetes: 'sorvetes',
  vinhos: 'vinhos',
};

function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function getCategoryIcon(
  key: string | null | undefined,
  name: string,
): IconComponent | undefined {
  if (key && CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  const byName = NAME_TO_KEY[normalize(name)];
  return byName ? CATEGORY_ICONS[byName] : undefined;
}
