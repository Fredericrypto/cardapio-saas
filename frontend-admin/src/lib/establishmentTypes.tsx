import type { ComponentType } from 'react';
import {
  Beef,
  CakeSlice,
  ChefHat,
  Coffee,
  Croissant,
  Beer,
  Hamburger,
  IceCreamCone,
  Pizza,
  Salad,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { BowlIcon, SushiIcon, TakeoutBoxIcon } from '../components/categoryLineIcons';

// Tipos de estabelecimento (preset de categorias). Escolher um tipo só
// MARCA as categorias mais relevantes na tela de categorias — o dono
// continua podendo marcar mais, desmarcar e remover depois (não trava
// nada, e nunca desliga o que ele já tinha). Cada `keys` são chaves do
// catálogo (categoryCatalog.ts).
export interface EstablishmentType {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  keys: string[];
}

// Ícone de traço fino (mesmo 1.6 das categorias).
const thin = (Icon: LucideIcon) =>
  function ThinIcon({ size = 20, className }: { size?: number; className?: string }) {
    return <Icon size={size} strokeWidth={1.6} className={className} />;
  };

// Lista de cafeteria/padaria dada pelo Felipe (a mesma pros dois tipos).
const CAFETERIA_PADARIA = [
  'cafes', 'cafes-especiais', 'chas', 'paes-panificados', 'salgados', 'sanduiches', 'cafe-da-manha',
  'bolos', 'tortas', 'doces-confeitaria', 'croissants-viennoiseries', 'waffles-panquecas', 'acai',
  'smoothies', 'milkshakes',
];

export const ESTABLISHMENT_TYPES: EstablishmentType[] = [
  {
    id: 'lanchonete',
    label: 'Lanchonete',
    icon: thin(Hamburger),
    keys: ['lanches', 'hamburgueres', 'hot-dogs', 'sanduiches', 'porcoes', 'acompanhamentos', 'sucos', 'refrigerantes', 'milkshakes', 'sobremesas'],
  },
  {
    id: 'pizzaria',
    label: 'Pizzaria',
    icon: thin(Pizza),
    keys: ['pizzas', 'pizzas-doces', 'pizzas-especiais', 'calzones', 'esfihas'],
  },
  {
    id: 'japones',
    label: 'Japonês',
    icon: SushiIcon,
    keys: ['sushi', 'nigiri', 'uramaki', 'hossomaki', 'temaki', 'hot-roll', 'yakissoba', 'donburi', 'combinados', 'rodizio', 'molhos-extras'],
  },
  {
    id: 'chines',
    label: 'Chinês',
    icon: TakeoutBoxIcon,
    keys: [
      'entradas-chinesas', 'dumplings-pasteis', 'rolinhos-primavera', 'sopas-chinesas', 'arroz-chao-fan',
      'yakisoba-chines', 'frango-xadrez-kung-pao', 'porco-agridoce', 'pato-especialidades',
      'combinados-chineses', 'vegetarianos-chineses', 'molhos-extras', 'bebidas-chinesas-chas',
    ],
  },
  {
    id: 'coreano',
    label: 'Coreano',
    icon: BowlIcon,
    keys: [
      'entradas-coreanas', 'kimchi-banchan', 'mandu', 'bibimbap', 'bulgogi', 'japchae', 'ramyeon',
      'tteokbokki', 'frango-frito-coreano', 'combinados-coreanos', 'vegetarianos-coreanos',
      'molhos-extras', 'bebidas-coreanas-soju',
    ],
  },
  {
    id: 'churrascaria',
    label: 'Churrascaria',
    icon: thin(Beef),
    keys: ['carnes-grelhados', 'acompanhamentos', 'saladas', 'porcoes', 'pratos-executivos', 'sobremesas', 'refrigerantes', 'sucos', 'cervejas', 'vinhos'],
  },
  { id: 'cafeteria', label: 'Cafeteria', icon: thin(Coffee), keys: CAFETERIA_PADARIA },
  {
    id: 'bar',
    label: 'Bar / Pub',
    icon: thin(Beer),
    keys: ['cervejas', 'drinks', 'caipirinhas', 'destilados', 'shots', 'vinhos', 'espumantes', 'whisky', 'petiscos', 'porcoes', 'tabuas-frios', 'hamburgueres', 'sanduiches'],
  },
  {
    id: 'restaurante',
    label: 'Restaurante',
    icon: thin(Utensils),
    keys: ['entradas', 'saladas', 'sopas-caldos', 'pratos-principais', 'pratos-executivos', 'carnes-grelhados', 'peixes-frutos-do-mar', 'massas-risotos', 'acompanhamentos', 'menu-vegetariano', 'menu-infantil', 'sobremesas', 'sucos', 'refrigerantes', 'aguas', 'cervejas', 'vinhos'],
  },
  {
    id: 'saudavel',
    label: 'Saudável / Fitness',
    icon: thin(Salad),
    keys: ['bowls', 'avocado-toasts', 'pratos-saudaveis', 'low-carb', 'fitness-proteicos', 'smoothies', 'saladas', 'sucos', 'acai', 'frutas'],
  },
  {
    id: 'confeitaria',
    label: 'Confeitaria',
    icon: thin(CakeSlice),
    keys: ['doces-confeitaria', 'bolos', 'tortas', 'cupcakes', 'cookies', 'chocolates', 'donuts', 'pudins', 'sobremesas', 'cafes'],
  },
  {
    id: 'sorveteria',
    label: 'Sorveteria',
    icon: thin(IceCreamCone),
    keys: ['sorvetes', 'acai', 'milkshakes', 'sobremesas', 'waffles-panquecas', 'frutas', 'cookies'],
  },
  { id: 'padaria', label: 'Padaria', icon: thin(Croissant), keys: CAFETERIA_PADARIA },
  {
    id: 'alta-gastronomia',
    label: 'Alta Gastronomia',
    icon: thin(ChefHat),
    keys: ['menu-degustacao', 'entradas', 'pratos-principais', 'carnes-grelhados', 'peixes-frutos-do-mar', 'massas-risotos', 'sobremesas', 'vinhos', 'espumantes', 'drinks'],
  },
];
