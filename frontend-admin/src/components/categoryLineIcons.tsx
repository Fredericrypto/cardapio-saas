import type { ReactElement } from 'react';
import {
  Apple,
  Amphora,
  Banana,
  Bean,
  Beaker,
  Beer,
  Bird,
  Boxes,
  Candy,
  Citrus,
  Coffee,
  Cookie,
  Croissant,
  Cylinder,
  CupSoda,
  Dessert,
  Donut,
  Drumstick,
  Dumbbell,
  Egg,
  EggFried,
  Flame,
  Flower2,
  GlassWater,
  Grid3x3,
  Ham,
  Hamburger,
  IceCreamBowl,
  Infinity as InfinityIcon,
  Droplet,
  LayoutGrid,
  Lollipop,
  Martini,
  Milk,
  Pizza,
  Sandwich,
  Shrimp,
  Sparkles,
  Sprout,
  Star,
  Tag,
  Triangle,
  Utensils,
  Vegan,
  Waves,
  Cherry,
  Leaf,
  Beef,
  Soup,
  Zap,
  Wheat,
  Layers,
} from 'lucide-react';

// Ícones de traço fino de TODAS as categorias novas (02/10) — mesma
// família visual das que já existiam: contorno de 1.6, pontas
// arredondadas, `currentColor`, caixa 24x24. Os que o lucide tem usam o
// lucide; os que ele não tem (sushi, hot dog, taco, dumpling, tigelas…)
// são desenhados aqui no MESMO traço. Sem emoji em lugar nenhum.
// Arquivo idêntico no painel e no cardápio — se mexer, mexer nos dois.
export type LineIconComponent = (props: { size?: number; className?: string }) => ReactElement;

function line(Icon: typeof Utensils): LineIconComponent {
  return ({ size = 22, className }) => <Icon size={size} strokeWidth={1.6} className={className} />;
}

function drawn(children: ReactElement): LineIconComponent {
  return ({ size = 22, className }) => (
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
      {children}
    </svg>
  );
}

// ---- desenhados (o lucide não tem) ----
// Sushi (nigiri): arroz embaixo, fatia por cima.
const SushiIcon = drawn(
  <>
    <rect x="3.5" y="13" width="17" height="6" rx="3" />
    <path d="M3.5 13c.6-4.2 4-6 8.5-6s7.9 1.8 8.5 6" />
    <path d="M9 8.2c.4 1.4.4 2.9 0 4.3M14 8.2c.4 1.4.4 2.9 0 4.3" />
  </>,
);
// Rolinho (uramaki): círculo, anel de arroz e recheio no meio.
const RollIcon = drawn(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.8" />
    <circle cx="12" cy="12" r="1.2" />
  </>,
);
// Hossomaki: rolinho fino, só alga e recheio.
const MakiIcon = drawn(
  <>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 3.2v1.4M12 19.4v1.4" />
  </>,
);
// Temaki: cone de alga com recheio saindo.
const TemakiIcon = drawn(
  <>
    <path d="M4.5 6.5 19.5 8 13 21z" />
    <path d="M4.5 6.5c1.6-2.2 3.8-2.6 5.2-1.2M9.7 5.3c1.6-2 4-2.2 5.4-.6M15.1 4.7c1.6-.8 3.2-.2 4.4 1.6" />
  </>,
);
// Hot dog: pão inclinado com a salsicha.
const HotDogIcon = drawn(
  <g transform="rotate(-35 12 12)">
    <rect x="2" y="8" width="20" height="8" rx="4" />
    <rect x="4" y="10" width="16" height="4" rx="2" />
    <path d="M6.5 12c1-1.2 2-1.2 3 0s2 1.2 3 0 2-1.2 3 0" />
  </g>,
);
// Taco: concha em meia-lua com o recheio por cima.
const TacoIcon = drawn(
  <>
    <path d="M3 18a9 9 0 0 1 18 0z" />
    <path d="M7 18a5 5 0 0 1 10 0" />
    <path d="M6.2 9.8c.9-1.3 2.2-1.6 3.2-.8M10.4 7.6c1-1.1 2.4-1.1 3.4 0M14.6 8.6c1-.8 2.3-.5 3.2.9" />
  </>,
);
// Dumpling / pastel: meia-lua com as pregas em cima.
const DumplingIcon = drawn(
  <>
    <path d="M3 16a9 9 0 0 1 18 0c0 2.2-1.8 3.5-4 3.5H7C4.8 19.5 3 18.2 3 16z" />
    <path d="M8.2 8.8 7.5 11M12 7v3M15.8 8.8l.7 2.2" />
  </>,
);
// Tigela com macarrão e hashi (ramen, yakisoba, ramyeon).
const NoodleBowlIcon = drawn(
  <>
    <path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z" />
    <path d="M6.5 9.5c.9-1.6 1.9-1.6 2.8 0s1.9 1.6 2.8 0 1.9-1.6 2.8 0" />
    <path d="m14.5 6.5 5-3.8M16.5 8.6 21 5" />
  </>,
);
// Tigela de arroz com a "cúpula" de arroz por cima.
const RiceBowlIcon = drawn(
  <>
    <path d="M3.5 13h17a8.5 8.5 0 0 1-17 0z" />
    <path d="M6.5 13a5.5 5.5 0 0 1 11 0" />
    <path d="M10 9.4v.1M12.6 8.6v.1M14.6 10.4v.1M8.7 11.2v.1" />
  </>,
);
// Tigela com ingredientes por cima (bowls, bibimbap).
const BowlIcon = drawn(
  <>
    <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z" />
    <circle cx="9" cy="8.6" r="2" />
    <circle cx="14.6" cy="8" r="1.6" />
    <path d="M11 5.2c.4-1.2 1.4-1.9 2.6-1.9" />
  </>,
);
// Cupcake: forminha, cobertura e cereja.
const CupcakeIcon = drawn(
  <>
    <path d="M6.5 12.5h11l-1.4 7.5H7.9z" />
    <path d="M5.5 12.5c-.4-3.2 2.4-5.6 6.5-5.6s6.9 2.4 6.5 5.6z" />
    <path d="M12 6.9c0-1.2.6-2.1 1.6-2.7" />
    <path d="M9.5 15.5v2.6M12 15.5v2.6M14.5 15.5v2.6" />
  </>,
);
// Porção de batata: cone de papel com as batatas.
const FriesIcon = drawn(
  <>
    <path d="M6.5 11h11l-1.4 9H7.9z" />
    <path d="M8.5 11V5.2M11 11V3.8M13.5 11V5.2M16 11V6.4" />
  </>,
);
// Caixinha de delivery oriental (tipo "Chinês").
export const TakeoutBoxIcon = drawn(
  <>
    <path d="M5 9h14l-1.8 11H6.8z" />
    <path d="M7.5 9 9 5.5h6L16.5 9" />
    <path d="M9.5 5.5c0-2 5-2 5 0" />
    <path d="M9 13.5c.9.9 1.8.9 3 0s2.1-.9 3 0" />
  </>,
);

export { SushiIcon, DumplingIcon, NoodleBowlIcon, BowlIcon, RollIcon };

// Fallback de categoria PERSONALIZADA (criada pelo dono, sem chave).
export const CustomCategoryIcon: LineIconComponent = line(Tag);

// ---- chave do catálogo → ícone (só as NOVAS + o ajuste do "combinados") ----
export const LINE_CATEGORY_ICONS: Record<string, LineIconComponent> = {
  // pratos e refeições
  hamburgueres: line(Hamburger),
  'hot-dogs': HotDogIcon,
  sanduiches: line(Sandwich),
  pizzas: line(Pizza),
  'tacos-burritos': TacoIcon,
  sushi: SushiIcon,
  'pratos-japoneses': NoodleBowlIcon,
  porcoes: FriesIcon,
  'tabuas-frios': line(Ham),
  combinados: line(Boxes), // era Pizza — agora Pizza é a categoria "Pizzas"
  'cafe-da-manha': line(EggFried),
  'paes-panificados': line(Wheat),
  // bebidas
  cafes: line(Coffee),
  'cafes-especiais': line(Bean),
  chas: line(Flower2),
  sucos: line(Citrus),
  refrigerantes: line(CupSoda),
  aguas: line(GlassWater),
  energeticos: line(Zap),
  cervejas: line(Beer),
  drinks: line(Martini),
  destilados: line(Amphora),
  espumantes: line(Sparkles),
  // doces e sobremesas
  'doces-confeitaria': line(Lollipop),
  acai: line(IceCreamBowl),
  milkshakes: line(Milk),
  donuts: line(Donut),
  cupcakes: CupcakeIcon,
  cookies: line(Cookie),
  chocolates: line(Candy),
  pudins: line(Dessert),
  'waffles-panquecas': line(Grid3x3),
  frutas: line(Apple),
  // saudáveis
  bowls: BowlIcon,
  'avocado-toasts': line(Sprout),
  'pratos-saudaveis': line(Vegan),
  'low-carb': line(Egg),
  'fitness-proteicos': line(Dumbbell),
  smoothies: line(Banana),
  // japonês
  nigiri: line(Shrimp),
  uramaki: RollIcon,
  hossomaki: MakiIcon,
  temaki: TemakiIcon,
  'hot-roll': line(Flame),
  yakissoba: line(Waves),
  donburi: RiceBowlIcon,
  rodizio: line(InfinityIcon),
  'molhos-extras': line(Droplet),
  // chinês
  'entradas-chinesas': line(Utensils),
  'dumplings-pasteis': DumplingIcon,
  'rolinhos-primavera': line(Cylinder),
  'sopas-chinesas': line(Soup),
  'arroz-chao-fan': RiceBowlIcon,
  'yakisoba-chines': NoodleBowlIcon,
  'frango-xadrez-kung-pao': line(Drumstick),
  'porco-agridoce': line(Ham),
  'pato-especialidades': line(Bird),
  'combinados-chineses': line(Boxes),
  'vegetarianos-chineses': line(Leaf),
  'bebidas-chinesas-chas': line(Flower2),
  // coreano
  'entradas-coreanas': line(Utensils),
  'kimchi-banchan': line(LayoutGrid),
  mandu: DumplingIcon,
  bibimbap: BowlIcon,
  bulgogi: line(Beef),
  japchae: line(Waves),
  ramyeon: NoodleBowlIcon,
  tteokbokki: line(Flame),
  'frango-frito-coreano': line(Drumstick),
  'combinados-coreanos': line(Boxes),
  'vegetarianos-coreanos': line(Leaf),
  'bebidas-coreanas-soju': line(Amphora),
  // pizzaria
  'pizzas-doces': line(Cherry),
  'pizzas-especiais': line(Star),
  calzones: DumplingIcon,
  esfihas: line(Triangle),
  // cafeteria / padaria / bar
  salgados: line(Drumstick),
  'croissants-viennoiseries': line(Croissant),
  caipirinhas: line(Citrus),
  shots: line(Beaker),
  whisky: line(Layers),
};
