// Espelho de `backend/src/modules/categories/category-catalog.ts` — as
// chaves e nomes têm que bater com o backend (que valida a chave).
export interface CatalogEntry {
  key: string;
  name: string;
}

export const CATEGORY_CATALOG: CatalogEntry[] = [
  { key: 'lanches', name: 'Lanches' },
  { key: 'bebidas', name: 'Bebidas' },
  { key: 'sobremesas', name: 'Sobremesas' },
  { key: 'entradas', name: 'Entradas' },
  { key: 'petiscos', name: 'Petiscos / Aperitivos' },
  { key: 'saladas', name: 'Saladas' },
  { key: 'sorvetes', name: 'Sorvetes' },
  { key: 'vinhos', name: 'Vinhos' },
  { key: 'sopas-caldos', name: 'Sopas e Caldos' },
  { key: 'pratos-principais', name: 'Pratos Principais' },
  { key: 'carnes-grelhados', name: 'Carnes e Grelhados' },
  { key: 'peixes-frutos-do-mar', name: 'Peixes e Frutos do Mar' },
  { key: 'massas-risotos', name: 'Massas e Risotos' },
  { key: 'pratos-executivos', name: 'Pratos Executivos' },
  { key: 'acompanhamentos', name: 'Acompanhamentos / Guarnições' },
  { key: 'menu-vegetariano', name: 'Menu Vegetariano / Vegano' },
  { key: 'menu-infantil', name: 'Menu Infantil / Kids' },
  { key: 'menu-degustacao', name: 'Menu Degustação' },
  { key: 'combinados', name: 'Combinados' },
  { key: 'pratos-compartilhar', name: 'Pratos para Compartilhar' },
];
