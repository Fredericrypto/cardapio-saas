// Auditoria PURA dos selos de produto (sem banco): catálogo/validação dos selos
// declarativos e regras dos selos comportamentais. Rodar: npm run test:badges
import { createChecker } from './helpers';
import {
  DECLARED_BADGE_CODES,
  MAX_DECLARED_CHIP_BADGES,
  countChipBadges,
  resolveDeclaredBadges,
  validateDeclaredBadges,
} from '../src/modules/products/badges/product-badges.types';
import {
  DEFAULT_BEHAVIORAL_BADGE_CONFIG as CFG,
  computeBehavioralBadges,
  isCustomerFavorite,
  rankTopOrdered,
  rankTrending,
  type ProductRatingStat,
  type ProductSalesStat,
} from '../src/modules/products/badges/behavioral-badge-rules';

const t = createChecker();
const sale = (productId: string, unitsWindow: number, ordersWindow: number, unitsRecent = 0, unitsPrevious = 0): ProductSalesStat => ({
  productId, unitsWindow, ordersWindow, unitsRecent, unitsPrevious,
});
const rate = (productId: string, reviewCount: number, ratingSum: number): ProductRatingStat => ({ productId, reviewCount, ratingSum });
const codes = (m: Map<string, { code: string }[]>, id: string): string[] => (m.get(id) ?? []).map((b) => b.code);

console.log('Catálogo declarativo');
t.ok(DECLARED_BADGE_CODES.length === 12, '12 códigos declarativos');
t.ok(new Set(DECLARED_BADGE_CODES).size === 12, 'códigos únicos');
t.ok(resolveDeclaredBadges(['vegan', 'vegan', 'xpto', 42, null, 'artisanal']).join() === 'artisanal,vegan', 'leitura: descarta desconhecidos/repetidos, ordem do catálogo');
t.ok(resolveDeclaredBadges(null).length === 0 && resolveDeclaredBadges(undefined).length === 0, 'leitura: null/undefined = []');
t.ok(countChipBadges(['illustrative_image', 'vegan']) === 1, 'imagem ilustrativa não conta no limite');
const okFour = validateDeclaredBadges(['artisanal', 'vegan', 'spicy', 'always_fresh', 'illustrative_image']);
t.ok(okFour.ok && okFour.badges.length === 5, `${MAX_DECLARED_CHIP_BADGES} selos de texto + imagem ilustrativa é aceito`);
const five = validateDeclaredBadges(['artisanal', 'vegan', 'spicy', 'always_fresh', 'house_recipe']);
t.ok(!five.ok, '5 selos de texto é recusado');
const bad = validateDeclaredBadges(['vegan', 'mais_vendido']);
t.ok(!bad.ok && bad.message.includes('mais_vendido'), 'código desconhecido é recusado e citado');
t.ok(validateDeclaredBadges([]).ok, 'lista vazia é válida');
t.ok(validateDeclaredBadges(['vegan', 'vegan']).ok, 'repetido é normalizado, não erro');

console.log('Mais pedido');
{
  const sales = [sale('a', 50, 30), sale('b', 40, 25), sale('c', 30, 20), sale('d', 25, 18), sale('e', 9, 9), sale('f', 100, 4)];
  t.ok(rankTopOrdered(sales, CFG.topOrdered).join() === 'a,b,c', 'top 3 por unidades');
  t.ok(!rankTopOrdered(sales, CFG.topOrdered).includes('e'), 'abaixo do mínimo de unidades fica de fora');
  t.ok(!rankTopOrdered(sales, CFG.topOrdered).includes('f'), 'abaixo do mínimo de pedidos fica de fora (100 unidades em 4 pedidos)');
  t.ok(rankTopOrdered([sale('x', 10, 5), sale('y', 10, 5)], CFG.topOrdered).join() === 'x,y', 'empate total: id crescente (determinístico)');
  t.ok(rankTopOrdered([sale('x', 10, 5), sale('y', 10, 7)], CFG.topOrdered).join() === 'y,x', 'empate de unidades: mais pedidos vence');
  t.ok(rankTopOrdered([], CFG.topOrdered).length === 0, 'sem vendas = sem selo');
  const shuffled = [...sales].reverse();
  t.ok(rankTopOrdered(shuffled, CFG.topOrdered).join() === 'a,b,c', 'independe da ordem de entrada');
}

console.log('Favorito dos clientes');
{
  t.ok(isCustomerFavorite(rate('a', 10, 48), CFG.customerFavorite), '4,8 exato com 10 avaliações = favorito');
  t.ok(!isCustomerFavorite(rate('a', 10, 47), CFG.customerFavorite), '4,7 não');
  t.ok(!isCustomerFavorite(rate('a', 9, 45), CFG.customerFavorite), 'nota máxima com 9 avaliações (< mínimo) não');
  t.ok(isCustomerFavorite(rate('a', 25, 120), CFG.customerFavorite), '4,8 com 25 avaliações');
  t.ok(!isCustomerFavorite(rate('a', 25, 119), CFG.customerFavorite), '4,76 não (sem arredondar para cima)');
  t.ok(!isCustomerFavorite(rate('a', 0, 0), CFG.customerFavorite), 'zero avaliações não');
  t.ok(isCustomerFavorite(rate('a', 10, 50), CFG.customerFavorite), '5,0 sim');
}

console.log('Tendência');
{
  const s = [
    sale('up', 0, 0, 20, 10), // +10, +100%
    sale('big', 0, 0, 40, 30), // +10, +33% (abaixo de 50%)
    sale('tiny', 0, 0, 3, 1), // volume baixo
    sale('exact', 0, 0, 12, 8), // +50% exato = entra
    sale('flat', 0, 0, 10, 10),
    sale('noprev', 0, 0, 30, 0), // sem base: não entra
    sale('fall', 0, 0, 5, 30),
  ];
  const r = rankTrending(s, CFG.trending);
  t.ok(r.includes('up') && r.includes('exact'), 'crescimento >= 50% com volume mínimo entra');
  t.ok(!r.includes('big'), '+33% não entra');
  t.ok(!r.includes('tiny'), 'volume mínimo protege de "crescer de 1 para 3"');
  t.ok(!r.includes('noprev'), 'sem base no período anterior não entra');
  t.ok(!r.includes('flat') && !r.includes('fall'), 'estável/queda não entra');
  t.ok(r[0] === 'up', 'maior ganho absoluto primeiro');
  const many = ['a', 'b', 'c', 'd', 'e'].map((id, i) => sale(id, 0, 0, 20 + i, 10));
  t.ok(rankTrending(many, CFG.trending).length === CFG.trending.topN, 'no máximo topN');
}

console.log('Combinação');
{
  const sales = [sale('a', 50, 30, 30, 10), sale('b', 20, 10, 5, 5)];
  const ratings = [rate('a', 20, 98), rate('b', 12, 60), rate('z', 10, 50)];
  const m = computeBehavioralBadges(sales, ratings);
  t.ok(codes(m, 'a').join() === 'top_ordered,customer_favorite,trending', 'produto pode ter os três, em ordem de prioridade');
  t.ok(codes(m, 'b').join() === 'top_ordered,customer_favorite' && m.get('b')?.length === 2, 'b: mais pedido + favorito (60/12 = 5,0), sem tendência');
  t.ok(codes(m, 'z').join() === 'customer_favorite', 'só avaliação também vale (sem vendas na janela)');
  t.ok(m.get('a')?.every((b) => b.kind === 'behavioral') === true, 'todos comportamentais');
  t.ok(computeBehavioralBadges([], []).size === 0, 'sem dados = nenhum selo');
}

console.log('Invariantes (400 cenários aleatórios, semente fixa)');
{
  let seed = 20261015;
  const rnd = (n: number): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed % n;
  };
  let violations = 0;
  for (let i = 0; i < 400; i++) {
    const n = 1 + rnd(12);
    const sales: ProductSalesStat[] = [];
    const ratings: ProductRatingStat[] = [];
    for (let k = 0; k < n; k++) {
      const id = `p${String(k).padStart(2, '0')}`;
      sales.push(sale(id, rnd(80), rnd(40), rnd(40), rnd(40)));
      const cnt = rnd(40);
      ratings.push(rate(id, cnt, cnt === 0 ? 0 : cnt + rnd(cnt * 4 + 1)));
    }
    const m = computeBehavioralBadges(sales, ratings);
    const top = [...m].filter(([, b]) => b.some((x) => x.code === 'top_ordered')).length;
    const trend = [...m].filter(([, b]) => b.some((x) => x.code === 'trending')).length;
    if (top > CFG.topOrdered.topN || trend > CFG.trending.topN) violations++;
    // independente: favorito por força bruta com frações
    for (const r of ratings) {
      const expected = r.reviewCount >= CFG.customerFavorite.minReviews && r.ratingSum / r.reviewCount >= 4.8 - 1e-9;
      const got = (m.get(r.productId) ?? []).some((x) => x.code === 'customer_favorite');
      if (expected !== got) violations++;
    }
    // nenhum top_ordered abaixo dos mínimos
    for (const s of sales) {
      const got = (m.get(s.productId) ?? []).some((x) => x.code === 'top_ordered');
      if (got && (s.unitsWindow < CFG.topOrdered.minUnits || s.ordersWindow < CFG.topOrdered.minOrders)) violations++;
    }
    // determinismo
    const again = computeBehavioralBadges([...sales].reverse(), [...ratings].reverse());
    if (JSON.stringify([...m].sort()) !== JSON.stringify([...again].sort())) violations++;
  }
  t.ok(violations === 0, `0 violações em 400 cenários (achou ${violations})`);
}

process.exit(t.finish());
