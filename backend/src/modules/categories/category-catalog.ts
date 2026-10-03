// Catálogo de categorias (pedido do Felipe, 28/09; reestruturado em 02/10).
//
// Duas camadas, sempre ESCOLHIDAS pelo dono no painel (marcar/desmarcar):
//   - 60 categorias UNIVERSAIS (`core: true`), organizadas em 4 grupos —
//     é o que serve pra qualquer restaurante;
//   - ESPECIALIDADES (`core: false`): pequenos pacotes por tipo de cozinha
//     (Japonês, Chinês, Coreano, Pizzaria, Cafeteria/Bar) que só aparecem
//     junto do tipo de estabelecimento correspondente.
// Além do catálogo, o dono pode criar categorias PERSONALIZADAS (sem chave)
// e reordenar tudo.
//
// A lista espelha `frontend-admin/src/lib/categoryCatalog.ts`; os ícones
// (uma entrada por chave) ficam em `components/CategoryIcon.tsx` do painel
// e do cardápio. Se mexer aqui, mexer nos dois lados — o script de teste
// de paridade do projeto confere isso.
export interface CatalogEntry {
  key: string; // até 40 caracteres (coluna `categories.key`)
  name: string;
  core: boolean;
}

const core = (key: string, name: string): CatalogEntry => ({ key, name, core: true });
const extra = (key: string, name: string): CatalogEntry => ({ key, name, core: false });

export const CATEGORY_CATALOG: CatalogEntry[] = [
  // ---- Pratos e refeições (27) ----
  core('lanches', 'Lanches'),
  core('hamburgueres', 'Hambúrgueres'),
  core('hot-dogs', 'Hot Dogs'),
  core('sanduiches', 'Sanduíches / Wraps'),
  core('pizzas', 'Pizzas'),
  core('tacos-burritos', 'Tacos / Burritos'),
  core('sushi', 'Sushi / Sashimi'),
  core('pratos-japoneses', 'Temakis / Yakisoba / Pratos Japoneses'),
  core('massas-risotos', 'Massas e Risotos'),
  core('pratos-principais', 'Pratos Principais'),
  core('pratos-executivos', 'Pratos do Dia / Executivos'),
  core('carnes-grelhados', 'Carnes e Grelhados'),
  core('peixes-frutos-do-mar', 'Peixes e Frutos do Mar'),
  core('entradas', 'Entradas'),
  core('petiscos', 'Petiscos / Aperitivos'),
  core('porcoes', 'Porções'),
  core('tabuas-frios', 'Tábuas / Frios'),
  core('saladas', 'Saladas'),
  core('sopas-caldos', 'Sopas e Caldos'),
  core('acompanhamentos', 'Acompanhamentos / Guarnições'),
  core('combinados', 'Combinados'),
  core('pratos-compartilhar', 'Pratos para Compartilhar'),
  core('menu-vegetariano', 'Menu Vegetariano / Vegano'),
  core('menu-infantil', 'Menu Infantil / Kids'),
  core('menu-degustacao', 'Menu Degustação'),
  core('cafe-da-manha', 'Café da Manhã / Brunch'),
  core('paes-panificados', 'Pães / Panificados'),

  // ---- Bebidas (13) ----
  core('bebidas', 'Bebidas'),
  core('cafes', 'Cafés'),
  core('cafes-especiais', 'Cafés Especiais'),
  core('chas', 'Chás / Infusões'),
  core('sucos', 'Sucos'),
  core('refrigerantes', 'Refrigerantes'),
  core('aguas', 'Águas'),
  core('energeticos', 'Energéticos'),
  core('cervejas', 'Cervejas'),
  core('drinks', 'Drinks / Coquetéis'),
  core('destilados', 'Destilados'),
  core('vinhos', 'Vinhos'),
  core('espumantes', 'Espumantes'),

  // ---- Doces e sobremesas (14) ----
  core('sobremesas', 'Sobremesas'),
  core('doces-confeitaria', 'Doces / Confeitaria'),
  core('bolos', 'Bolos'),
  core('tortas', 'Tortas'),
  core('sorvetes', 'Sorvetes'),
  core('acai', 'Açaí'),
  core('milkshakes', 'Milkshakes'),
  core('donuts', 'Donuts'),
  core('cupcakes', 'Cupcakes'),
  core('cookies', 'Cookies'),
  core('chocolates', 'Chocolates'),
  core('pudins', 'Pudins / Flans'),
  core('waffles-panquecas', 'Waffles / Panquecas'),
  core('frutas', 'Frutas / Salada de Frutas'),

  // ---- Saudáveis (6) ----
  core('bowls', 'Bowls'),
  core('avocado-toasts', 'Avocado / Toasts'),
  core('pratos-saudaveis', 'Pratos Saudáveis'),
  core('low-carb', 'Low Carb'),
  core('fitness-proteicos', 'Fitness / Proteicos'),
  core('smoothies', 'Smoothies / Detox'),

  // ---- Especialidades: Japonês ----
  extra('nigiri', 'Nigiri'),
  extra('uramaki', 'Uramaki'),
  extra('hossomaki', 'Hossomaki'),
  extra('temaki', 'Temaki'),
  extra('hot-roll', 'Hot'),
  extra('yakissoba', 'Yakissoba'),
  extra('donburi', 'Donburi'),
  extra('rodizio', 'Rodízio'),
  // Molhos / Extras: compartilhada por Japonês, Chinês e Coreano.
  extra('molhos-extras', 'Molhos / Extras'),

  // ---- Especialidades: Chinês ----
  extra('entradas-chinesas', 'Entradas Chinesas'),
  extra('dumplings-pasteis', 'Dumplings / Pastéis'),
  extra('rolinhos-primavera', 'Rolinhos Primavera'),
  extra('sopas-chinesas', 'Sopas Chinesas'),
  extra('arroz-chao-fan', 'Arroz / Chao Fan'),
  extra('yakisoba-chines', 'Yakisoba Chinês / Macarrão'),
  extra('frango-xadrez-kung-pao', 'Frango Xadrez / Kung Pao'),
  extra('porco-agridoce', 'Porco Agridoce'),
  extra('pato-especialidades', 'Pato / Especialidades'),
  extra('combinados-chineses', 'Combinados Chineses'),
  extra('vegetarianos-chineses', 'Pratos Vegetarianos Chineses'),
  extra('bebidas-chinesas-chas', 'Bebidas Chinesas / Chás'),

  // ---- Especialidades: Coreano ----
  extra('entradas-coreanas', 'Entradas Coreanas'),
  extra('kimchi-banchan', 'Kimchi / Banchan'),
  extra('mandu', 'Mandu (Dumplings Coreanos)'),
  extra('bibimbap', 'Bibimbap'),
  extra('bulgogi', 'Bulgogi'),
  extra('japchae', 'Japchae'),
  extra('ramyeon', 'Ramen / Ramyeon'),
  extra('tteokbokki', 'Tteokbokki'),
  extra('frango-frito-coreano', 'Fried Chicken Coreano'),
  extra('combinados-coreanos', 'Combinados Coreanos'),
  extra('vegetarianos-coreanos', 'Pratos Vegetarianos Coreanos'),
  extra('bebidas-coreanas-soju', 'Bebidas Coreanas / Soju'),

  // ---- Especialidades: Pizzaria ----
  extra('pizzas-doces', 'Pizzas Doces'),
  extra('pizzas-especiais', 'Pizzas Especiais'),
  extra('calzones', 'Calzones'),
  extra('esfihas', 'Esfihas'),

  // ---- Especialidades: Cafeteria / Padaria / Bar ----
  extra('salgados', 'Salgados'),
  extra('croissants-viennoiseries', 'Croissants / Viennoiseries'),
  extra('caipirinhas', 'Caipirinhas'),
  extra('shots', 'Shots'),
  extra('whisky', 'Whisky'),
];

export const CATALOG_BY_KEY = new Map(CATEGORY_CATALOG.map((e) => [e.key, e]));
