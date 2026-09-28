// Catálogo FIXO de categorias (pedido do Felipe, 28/09): o dono do
// restaurante não digita mais o nome — só liga/desliga itens desta
// lista. "Todos" não entra aqui: é um item virtual do cardápio, sempre
// o primeiro. A lista espelha `frontend-admin/src/lib/categoryCatalog.ts`
// e `frontend-cardapio/src/lib/categoryCatalog.ts` (chave + nome + ícone
// no front) — se mexer aqui, mexer nos dois lados.
export interface CatalogEntry {
  key: string;
  name: string;
  // Posição fixa no início da lista (Lanches → Bebidas → Sobremesas).
  // As demais não têm rank e seguem a ordem em que o dono as ativou.
  fixedRank?: number;
}

export const CATEGORY_CATALOG: CatalogEntry[] = [
  { key: 'lanches', name: 'Lanches', fixedRank: 1 },
  { key: 'bebidas', name: 'Bebidas', fixedRank: 2 },
  { key: 'sobremesas', name: 'Sobremesas', fixedRank: 3 },
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

export const CATALOG_BY_KEY = new Map(CATEGORY_CATALOG.map((c) => [c.key, c]));

export function normalizeCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
