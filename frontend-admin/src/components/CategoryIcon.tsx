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

interface SvgIconProps {
  size?: number;
  className?: string;
}

// SVGs de Todos/Lanches/Bebidas enviados pelo Felipe (mesmos do cardápio
// do cliente).
export function TodosIcon({ size = 22, className }: SvgIconProps) {
  const w = (122.88 / 121.135) * size;
  return (
    <svg width={w} height={size} viewBox="0 0 122.88 121.135" fill="currentColor" className={className}>
      <path d="M74.401,65.787h41.427c1.943,0,3.707,0.791,4.982,2.068c1.276,1.275,2.069,3.039,2.069,4.982v41.246 c0,1.941-0.793,3.707-2.069,4.98c-1.275,1.277-3.039,2.07-4.982,2.07H74.401c-1.942,0-3.706-0.793-4.982-2.07 c-1.275-1.273-2.068-3.039-2.068-4.98V72.838c0-1.943,0.793-3.707,2.068-4.982C70.695,66.578,72.459,65.787,74.401,65.787 L74.401,65.787z M7.052,0h41.426c1.942,0,3.707,0.792,4.983,2.069s2.068,3.04,2.068,4.983v41.245c0,1.943-0.792,3.707-2.068,4.982 c-1.276,1.276-3.041,2.069-4.983,2.069H7.052c-1.934,0-3.692-0.793-4.969-2.069l-0.007-0.006l-0.007,0.006 C0.792,52.003,0,50.239,0,48.296V7.052c0-1.943,0.792-3.707,2.069-4.983C2.162,1.976,2.26,1.888,2.359,1.807 C3.607,0.685,5.255,0,7.052,0L7.052,0z M48.131,7.397H7.397V47.95h40.733V7.397L48.131,7.397z M74.401,0h41.427 c1.943,0,3.707,0.792,4.982,2.069c1.276,1.276,2.069,3.04,2.069,4.983v41.245c0,1.943-0.793,3.707-2.069,4.982 c-1.275,1.276-3.039,2.069-4.982,2.069H74.401c-1.942,0-3.706-0.793-4.982-2.069c-1.275-1.275-2.068-3.04-2.068-4.982V7.052 c0-1.943,0.793-3.707,2.068-4.983C70.695,0.792,72.459,0,74.401,0L74.401,0z M115.482,7.397H74.748V47.95h40.734V7.397 L115.482,7.397z M7.052,65.787h41.426c1.942,0,3.707,0.791,4.983,2.068c1.276,1.275,2.068,3.039,2.068,4.982v41.246 c0,1.941-0.792,3.707-2.068,4.98c-1.276,1.277-3.041,2.07-4.983,2.07H7.052c-1.934,0-3.692-0.793-4.969-2.07l-0.007-0.006 l-0.007,0.006C0.792,117.791,0,116.025,0,114.084V72.838c0-1.943,0.792-3.707,2.069-4.982c0.093-0.094,0.191-0.182,0.291-0.264 C3.607,66.471,5.255,65.787,7.052,65.787L7.052,65.787z M48.131,73.184H7.397v40.553h40.733V73.184L48.131,73.184z M115.482,73.184 H74.748v40.553h40.734V73.184L115.482,73.184z" />
    </svg>
  );
}

export function LanchesIcon({ size = 22, className }: SvgIconProps) {
  const w = (120.79 / 122.88) * size;
  return (
    <svg width={w} height={size} viewBox="0 0 120.79 122.88" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M103.87,44.5h-48H43.39l1.01,4.9c18.68,1.25,32.45,9.27,39.21,17.08c2.6,3,4.42,6.21,5.37,9.34 c1.39,4.58,1.05,9.04-1.13,12.96c-0.28,0.51-0.59,1-0.92,1.48c0.41,0.88,0.72,1.76,0.97,2.61c0.08,0.23,0.16,0.47,0.22,0.71l0.01,0 c0.32,1.13,0.48,2.23,0.48,3.32c0,0.38-0.02,0.26-0.04,0.59l0.01,0.27h0.03c0-0.18,0-0.29,0,0c0,0.28-0.01,0.57-0.03,0.86h15.23 l12.55-54.1H103.87L103.87,44.5L103.87,44.5z M3.19,108.88c23.89-0.04,47.77-0.07,71.66,0c1.42,0.01,2.59,1.17,2.59,2.59 c0,3.86-1.62,11.42-10.35,11.42c-18.71,0-37.42,0-56.13,0c-8.73,0-10.35-7.55-10.35-11.42C0.6,110.04,1.77,108.88,3.19,108.88 L3.19,108.88L3.19,108.88z M56.69,69.07c2.2,0,3.98,1.78,3.98,3.98c0,2.2-1.78,3.98-3.98,3.98c-2.2,0-3.98-1.78-3.98-3.98 C52.71,70.85,54.49,69.07,56.69,69.07L56.69,69.07L56.69,69.07z M21.98,69.35c2.2,0,3.98,1.78,3.98,3.98c0,2.2-1.78,3.98-3.98,3.98 c-2.2,0-3.98-1.78-3.98-3.98S19.78,69.35,21.98,69.35L21.98,69.35L21.98,69.35z M39.19,65.55c2.2,0,3.98,1.78,3.98,3.98 c0,2.2-1.78,3.98-3.98,3.98c-2.2,0-3.98-1.78-3.98-3.98C35.22,67.33,37,65.55,39.19,65.55L39.19,65.55L39.19,65.55z M71.47,86.14 H7.41c-4.07,0-7.41-3.33-7.41-7.4l0,0c0-10.54,21.01-18.2,38.64-18.38C73.35,60.01,88.92,86.14,71.47,86.14L71.47,86.14 L71.47,86.14z M77.27,96.29c0.11,0.19,0.17,0.38,0.17,0.6c0,0.13-0.01,0.28-0.01,0.43c0.01,0.15,0.01,0.29,0.01,0.43 c0,0.21-0.06,0.41-0.17,0.6c-0.59,2.57-2.95,5.93-10.18,5.93c-18.71,0-37.42,0-56.13,0c-7.24,0-9.59-3.36-10.18-5.93 c-0.11-0.19-0.17-0.38-0.17-0.6c0-0.13,0.01-0.28,0.01-0.43c-0.01-0.15-0.01-0.29-0.01-0.43c0-0.21,0.06-0.41,0.17-0.6 c0.59-2.57,2.94-5.93,10.18-5.93h29.07l10.72,11.07l10.65-11.07h5.7C74.33,90.37,76.68,93.73,77.27,96.29L77.27,96.29L77.27,96.29z M88.57,97.75c0.02,0.87,0.03,0.32,0.03,0H88.57L88.57,97.75z M43.48,22.3h31.41l3.42-15.2c0.99-3.67,3.87-5.72,8.95-7.1 c4.31,0,8.62,0,12.92,0c1.97,0.39,3.11,1.76,3.41,4.12c0,1.33,0,2.65,0,3.98c-0.65,2.17-1.96,3.05-3.98,3.41H88.83l-2.29,10.79 h29.72c2.5,0,4.53,2.04,4.53,4.53v5.15c0,2.5-2.04,4.53-4.53,4.53H43.48c-2.5,0-4.53-2.04-4.53-4.53v-5.15 C38.95,24.34,40.99,22.3,43.48,22.3L43.48,22.3L43.48,22.3z M86.38,121.89h5.41h3.12c3.64-0.78,6.17-2.5,7.24-6.11l0.82-8.58H87.92 c0.45,1.35,0.69,2.78,0.69,4.27C88.61,114.23,88.1,118.1,86.38,121.89L86.38,121.89z"
      />
    </svg>
  );
}

export function BebidasIcon({ size = 22, className }: SvgIconProps) {
  const w = (117 / 122.88) * size;
  return (
    <svg width={w} height={size} viewBox="0 0 117 122.88" fill="currentColor" className={className}>
      <path d="M94.8,15.36c-1.18-0.34-1.86-1.56-1.53-2.74c0.34-1.18,1.56-1.86,2.74-1.53c3.15,0.9,5.79,2.39,7.82,4.59 c2.03,2.22,3.39,5.1,3.94,8.79c0.18,1.21-0.66,2.34-1.88,2.52c-1.21,0.18-2.34-0.66-2.52-1.88c-0.41-2.76-1.38-4.87-2.81-6.43 C99.13,17.12,97.17,16.04,94.8,15.36L94.8,15.36z M37.87,67.17L0.61,28.09c-0.84-0.89-0.81-2.29,0.08-3.13 c0.43-0.41,0.98-0.61,1.53-0.61v-0.01h14.53L2.27,9.86c-0.87-0.87-0.87-2.27,0-3.14c0.87-0.87,2.27-0.87,3.14,0l17.62,17.62h42.2 c0.46-6.48,3.24-12.31,7.52-16.64C77.44,2.94,83.92,0,91.08,0c7.16,0,13.64,2.94,18.34,7.7C114.1,12.45,117,19,117,26.23 c0,7.23-2.9,13.78-7.58,18.53c-4.7,4.76-11.18,7.7-18.34,7.7c-3.19,0-6.25-0.59-9.09-1.66c-2.33-0.88-4.51-2.1-6.48-3.6L56,67.18 v38.38l14.94,13.45c0.91,0.82,0.98,2.22,0.16,3.13c-0.44,0.49-1.04,0.73-1.65,0.73v0H24.77c-1.23,0-2.22-0.99-2.22-2.22 c0-0.7,0.32-1.32,0.82-1.73l14.5-13.36V67.17L37.87,67.17z M69.68,24.34h22.88c1.23,0,2.22,0.99,2.22,2.22 c0,0.66-0.29,1.26-0.75,1.67L78.64,44c1.5,1.08,3.15,1.98,4.92,2.65c2.33,0.88,4.87,1.37,7.52,1.37c5.93,0,11.3-2.43,15.18-6.36 c3.89-3.94,6.3-9.39,6.3-15.42c0-6.03-2.41-11.48-6.3-15.42c-3.88-3.93-9.25-6.36-15.18-6.36c-5.93,0-11.3,2.43-15.18,6.36 C72.42,14.33,70.13,19.06,69.68,24.34L69.68,24.34z M7.4,28.78l6.82,7.15c0.14-0.03,0.29-0.05,0.45-0.05h64.77 c0.28,0,0.54,0.05,0.79,0.14l7.08-7.25H7.4L7.4,28.78z M18.41,40.33l23.18,24.31c0.45,0.41,0.73,0.99,0.73,1.65v40.26h0 c0,0.6-0.24,1.2-0.72,1.63l-11.14,10.26h33.22l-11.29-10.16c-0.5-0.41-0.83-1.03-0.83-1.73V66.28h0.01c0-0.56,0.21-1.11,0.63-1.55 l23.83-24.41H18.41L18.41,40.33z" />
    </svg>
  );
}

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
