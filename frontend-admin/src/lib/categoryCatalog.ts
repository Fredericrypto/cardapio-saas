// Espelho de `backend/src/modules/categories/category-catalog.ts` — as
// chaves e nomes têm que bater com o backend (que valida a chave) e com os
// ícones de `components/CategoryIcon.tsx`. Aqui entram também o AGRUPAMENTO
// (pra tela de categorias ficar organizada) e os TIPOS DE ESTABELECIMENTO
// (presets que só marcam a seleção inicial — nunca travam a edição).
export type CatalogGroupId =
  | 'pratos'
  | 'bebidas'
  | 'doces'
  | 'saudaveis'
  | 'japones'
  | 'orientais'
  | 'chines'
  | 'coreano'
  | 'pizzaria'
  | 'casa';

export interface CatalogEntry {
  key: string;
  name: string;
  // true = uma das 60 categorias universais; false = especialidade (pacote
  // por tipo de cozinha, mostrado em "Especialidades").
  core: boolean;
  group: CatalogGroupId;
}

export const CATALOG_GROUPS: Array<{ id: CatalogGroupId; label: string; core: boolean }> = [
  { id: 'pratos', label: 'Pratos e refeições', core: true },
  { id: 'bebidas', label: 'Bebidas', core: true },
  { id: 'doces', label: 'Doces e sobremesas', core: true },
  { id: 'saudaveis', label: 'Saudáveis', core: true },
  { id: 'japones', label: 'Japonês', core: false },
  { id: 'chines', label: 'Chinês', core: false },
  { id: 'coreano', label: 'Coreano', core: false },
  { id: 'orientais', label: 'Orientais — molhos e extras', core: false },
  { id: 'pizzaria', label: 'Pizzaria', core: false },
  { id: 'casa', label: 'Cafeteria, padaria e bar', core: false },
];

export const CATEGORY_CATALOG: CatalogEntry[] = [
  { key: 'lanches', name: 'Lanches', core: true, group: 'pratos' },
  { key: 'hamburgueres', name: 'Hambúrgueres', core: true, group: 'pratos' },
  { key: 'hot-dogs', name: 'Hot Dogs', core: true, group: 'pratos' },
  { key: 'sanduiches', name: 'Sanduíches / Wraps', core: true, group: 'pratos' },
  { key: 'pizzas', name: 'Pizzas', core: true, group: 'pratos' },
  { key: 'tacos-burritos', name: 'Tacos / Burritos', core: true, group: 'pratos' },
  { key: 'sushi', name: 'Sushi / Sashimi', core: true, group: 'pratos' },
  { key: 'pratos-japoneses', name: 'Temakis / Yakisoba / Pratos Japoneses', core: true, group: 'pratos' },
  { key: 'massas-risotos', name: 'Massas e Risotos', core: true, group: 'pratos' },
  { key: 'pratos-principais', name: 'Pratos Principais', core: true, group: 'pratos' },
  { key: 'pratos-executivos', name: 'Pratos do Dia / Executivos', core: true, group: 'pratos' },
  { key: 'carnes-grelhados', name: 'Carnes e Grelhados', core: true, group: 'pratos' },
  { key: 'peixes-frutos-do-mar', name: 'Peixes e Frutos do Mar', core: true, group: 'pratos' },
  { key: 'entradas', name: 'Entradas', core: true, group: 'pratos' },
  { key: 'petiscos', name: 'Petiscos / Aperitivos', core: true, group: 'pratos' },
  { key: 'porcoes', name: 'Porções', core: true, group: 'pratos' },
  { key: 'tabuas-frios', name: 'Tábuas / Frios', core: true, group: 'pratos' },
  { key: 'saladas', name: 'Saladas', core: true, group: 'pratos' },
  { key: 'sopas-caldos', name: 'Sopas e Caldos', core: true, group: 'pratos' },
  { key: 'acompanhamentos', name: 'Acompanhamentos / Guarnições', core: true, group: 'pratos' },
  { key: 'combinados', name: 'Combinados', core: true, group: 'pratos' },
  { key: 'pratos-compartilhar', name: 'Pratos para Compartilhar', core: true, group: 'pratos' },
  { key: 'menu-vegetariano', name: 'Menu Vegetariano / Vegano', core: true, group: 'pratos' },
  { key: 'menu-infantil', name: 'Menu Infantil / Kids', core: true, group: 'pratos' },
  { key: 'menu-degustacao', name: 'Menu Degustação', core: true, group: 'pratos' },
  { key: 'cafe-da-manha', name: 'Café da Manhã / Brunch', core: true, group: 'pratos' },
  { key: 'paes-panificados', name: 'Pães / Panificados', core: true, group: 'pratos' },
  { key: 'bebidas', name: 'Bebidas', core: true, group: 'bebidas' },
  { key: 'cafes', name: 'Cafés', core: true, group: 'bebidas' },
  { key: 'cafes-especiais', name: 'Cafés Especiais', core: true, group: 'bebidas' },
  { key: 'chas', name: 'Chás / Infusões', core: true, group: 'bebidas' },
  { key: 'sucos', name: 'Sucos', core: true, group: 'bebidas' },
  { key: 'refrigerantes', name: 'Refrigerantes', core: true, group: 'bebidas' },
  { key: 'aguas', name: 'Águas', core: true, group: 'bebidas' },
  { key: 'energeticos', name: 'Energéticos', core: true, group: 'bebidas' },
  { key: 'cervejas', name: 'Cervejas', core: true, group: 'bebidas' },
  { key: 'drinks', name: 'Drinks / Coquetéis', core: true, group: 'bebidas' },
  { key: 'destilados', name: 'Destilados', core: true, group: 'bebidas' },
  { key: 'vinhos', name: 'Vinhos', core: true, group: 'bebidas' },
  { key: 'espumantes', name: 'Espumantes', core: true, group: 'bebidas' },
  { key: 'sobremesas', name: 'Sobremesas', core: true, group: 'doces' },
  { key: 'doces-confeitaria', name: 'Doces / Confeitaria', core: true, group: 'doces' },
  { key: 'bolos', name: 'Bolos', core: true, group: 'doces' },
  { key: 'tortas', name: 'Tortas', core: true, group: 'doces' },
  { key: 'sorvetes', name: 'Sorvetes', core: true, group: 'doces' },
  { key: 'acai', name: 'Açaí', core: true, group: 'doces' },
  { key: 'milkshakes', name: 'Milkshakes', core: true, group: 'doces' },
  { key: 'donuts', name: 'Donuts', core: true, group: 'doces' },
  { key: 'cupcakes', name: 'Cupcakes', core: true, group: 'doces' },
  { key: 'cookies', name: 'Cookies', core: true, group: 'doces' },
  { key: 'chocolates', name: 'Chocolates', core: true, group: 'doces' },
  { key: 'pudins', name: 'Pudins / Flans', core: true, group: 'doces' },
  { key: 'waffles-panquecas', name: 'Waffles / Panquecas', core: true, group: 'doces' },
  { key: 'frutas', name: 'Frutas / Salada de Frutas', core: true, group: 'doces' },
  { key: 'bowls', name: 'Bowls', core: true, group: 'saudaveis' },
  { key: 'avocado-toasts', name: 'Avocado / Toasts', core: true, group: 'saudaveis' },
  { key: 'pratos-saudaveis', name: 'Pratos Saudáveis', core: true, group: 'saudaveis' },
  { key: 'low-carb', name: 'Low Carb', core: true, group: 'saudaveis' },
  { key: 'fitness-proteicos', name: 'Fitness / Proteicos', core: true, group: 'saudaveis' },
  { key: 'smoothies', name: 'Smoothies / Detox', core: true, group: 'saudaveis' },
  { key: 'nigiri', name: 'Nigiri', core: false, group: 'japones' },
  { key: 'uramaki', name: 'Uramaki', core: false, group: 'japones' },
  { key: 'hossomaki', name: 'Hossomaki', core: false, group: 'japones' },
  { key: 'temaki', name: 'Temaki', core: false, group: 'japones' },
  { key: 'hot-roll', name: 'Hot', core: false, group: 'japones' },
  { key: 'yakissoba', name: 'Yakissoba', core: false, group: 'japones' },
  { key: 'donburi', name: 'Donburi', core: false, group: 'japones' },
  { key: 'rodizio', name: 'Rodízio', core: false, group: 'japones' },
  { key: 'molhos-extras', name: 'Molhos / Extras', core: false, group: 'orientais' },
  { key: 'entradas-chinesas', name: 'Entradas Chinesas', core: false, group: 'chines' },
  { key: 'dumplings-pasteis', name: 'Dumplings / Pastéis', core: false, group: 'chines' },
  { key: 'rolinhos-primavera', name: 'Rolinhos Primavera', core: false, group: 'chines' },
  { key: 'sopas-chinesas', name: 'Sopas Chinesas', core: false, group: 'chines' },
  { key: 'arroz-chao-fan', name: 'Arroz / Chao Fan', core: false, group: 'chines' },
  { key: 'yakisoba-chines', name: 'Yakisoba Chinês / Macarrão', core: false, group: 'chines' },
  { key: 'frango-xadrez-kung-pao', name: 'Frango Xadrez / Kung Pao', core: false, group: 'chines' },
  { key: 'porco-agridoce', name: 'Porco Agridoce', core: false, group: 'chines' },
  { key: 'pato-especialidades', name: 'Pato / Especialidades', core: false, group: 'chines' },
  { key: 'combinados-chineses', name: 'Combinados Chineses', core: false, group: 'chines' },
  { key: 'vegetarianos-chineses', name: 'Pratos Vegetarianos Chineses', core: false, group: 'chines' },
  { key: 'bebidas-chinesas-chas', name: 'Bebidas Chinesas / Chás', core: false, group: 'chines' },
  { key: 'entradas-coreanas', name: 'Entradas Coreanas', core: false, group: 'coreano' },
  { key: 'kimchi-banchan', name: 'Kimchi / Banchan', core: false, group: 'coreano' },
  { key: 'mandu', name: 'Mandu (Dumplings Coreanos)', core: false, group: 'coreano' },
  { key: 'bibimbap', name: 'Bibimbap', core: false, group: 'coreano' },
  { key: 'bulgogi', name: 'Bulgogi', core: false, group: 'coreano' },
  { key: 'japchae', name: 'Japchae', core: false, group: 'coreano' },
  { key: 'ramyeon', name: 'Ramen / Ramyeon', core: false, group: 'coreano' },
  { key: 'tteokbokki', name: 'Tteokbokki', core: false, group: 'coreano' },
  { key: 'frango-frito-coreano', name: 'Fried Chicken Coreano', core: false, group: 'coreano' },
  { key: 'combinados-coreanos', name: 'Combinados Coreanos', core: false, group: 'coreano' },
  { key: 'vegetarianos-coreanos', name: 'Pratos Vegetarianos Coreanos', core: false, group: 'coreano' },
  { key: 'bebidas-coreanas-soju', name: 'Bebidas Coreanas / Soju', core: false, group: 'coreano' },
  { key: 'pizzas-doces', name: 'Pizzas Doces', core: false, group: 'pizzaria' },
  { key: 'pizzas-especiais', name: 'Pizzas Especiais', core: false, group: 'pizzaria' },
  { key: 'calzones', name: 'Calzones', core: false, group: 'pizzaria' },
  { key: 'esfihas', name: 'Esfihas', core: false, group: 'pizzaria' },
  { key: 'salgados', name: 'Salgados', core: false, group: 'casa' },
  { key: 'croissants-viennoiseries', name: 'Croissants / Viennoiseries', core: false, group: 'casa' },
  { key: 'caipirinhas', name: 'Caipirinhas', core: false, group: 'casa' },
  { key: 'shots', name: 'Shots', core: false, group: 'casa' },
  { key: 'whisky', name: 'Whisky', core: false, group: 'casa' },
];

export const CATALOG_BY_KEY = new Map(CATEGORY_CATALOG.map((e) => [e.key, e]));
