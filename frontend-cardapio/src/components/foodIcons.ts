import {
  Amphora, Apple, Banana, Barrel, Bean, Beef, Beer, BottleWine, Broccoli, Cake, CakeSlice,
  Candy, CandyCane, Carrot, ChefHat, Cherry, Citrus, Coffee, Cookie, CookingPot, Croissant,
  CupSoda, Dessert, Donut, Drumstick, Egg, EggFried, Fish, FishSymbol, GlassWater, Grape, Ham,
  Hamburger, Hop, IceCream, IceCream2, IceCreamBowl, IceCreamCone, LeafyGreen, Lollipop, Martini,
  Milk, Nut, Pizza, Popcorn, Popsicle, Salad, Sandwich, Shell, Soup, Sprout, Utensils,
  UtensilsCrossed, Vegan, Wheat, Wine,
  type LucideIcon,
} from 'lucide-react';

// Todos os ícones de comida/bebida do Lucide (traço fino) — 56, nenhum repetido na lista.
// A ORDEM não é aleatória: foi calculada para que, na malha do fundo
// (índice = linha * FOOD_STEP + coluna), famílias parecidas (sorvetes, doces, bebidas...)
// nunca fiquem encostadas e o mesmo ícone só reapareça a ~700 px de distância.
export const FOOD_ICONS: readonly LucideIcon[] = [
  Cake, Carrot, CakeSlice, IceCream, Dessert, Apple, Donut, Broccoli, Utensils, Croissant,
  IceCream2, Cookie, Beef, BottleWine, Coffee, Banana, LeafyGreen, Wheat, UtensilsCrossed, Sandwich,
  IceCreamCone, Drumstick, Beer, CupSoda, Cherry, Sprout, Bean, ChefHat, Pizza, Candy,
  Ham, Fish, Egg, IceCreamBowl, Wine, Nut, Barrel, GlassWater, Citrus, Vegan,
  Hamburger, CookingPot, Popcorn, CandyCane, FishSymbol, EggFried, Martini, Popsicle, Lollipop, Salad,
  Amphora, Milk, Shell, Grape, Hop, Soup,
];

// Passo entre linhas da malha (coprimo com 56, escolhido por maximizar a distância entre repetições).
export const FOOD_STEP = 21;
