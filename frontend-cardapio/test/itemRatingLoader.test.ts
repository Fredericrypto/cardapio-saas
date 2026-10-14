import assert from 'node:assert/strict';
import { createItemRatingLoader, ITEM_RATING_TTL_MS } from '../src/lib/itemRatingLoader';

async function main() {
  let clock = 1_000_000;
  const calls: string[] = [];
  let mode: 'ok' | 'fail' | 'empty' | 'nan' = 'ok';
  const loader = createItemRatingLoader(
    async (t, p) => {
      calls.push(`${t}:${p}`);
      await new Promise((r) => setTimeout(r, 5));
      if (mode === 'fail') throw new Error('rede');
      if (mode === 'empty') return { average: 0, count: 0 };
      if (mode === 'nan') return { average: Number('x'), count: 3 };
      return { average: 4.5, count: 10 };
    },
    () => clock,
  );

  assert.equal(loader.peek('t', 'a'), undefined, 'começa vazio');
  assert.deepEqual(await loader.load('t', 'a'), { average: 4.5, count: 10 });
  assert.deepEqual(loader.peek('t', 'a'), { average: 4.5, count: 10 }, 'depois de carregar, peek devolve');
  await loader.load('t', 'a');
  assert.equal(calls.length, 1, 'segunda leitura vem do cache (sem nova requisição)');

  // pedidos simultâneos do mesmo item viram UMA requisição
  const [x, y] = await Promise.all([loader.load('t', 'b'), loader.load('t', 'b')]);
  assert.deepEqual(x, y);
  assert.equal(calls.filter((c) => c === 't:b').length, 1, 'simultâneos juntam em 1 chamada');

  // chaves distintas por restaurante e por item
  await loader.load('t2', 'a');
  await loader.load('t', 'c');
  assert.deepEqual(calls.slice(-2), ['t2:a', 't:c']);

  // expira depois do TTL
  clock += ITEM_RATING_TTL_MS + 1;
  assert.equal(loader.peek('t', 'a'), undefined, 'passou do TTL: peek não devolve mais');
  await loader.load('t', 'a');
  assert.equal(calls.filter((c) => c === 't:a').length, 2, 'depois do TTL busca de novo');

  // falha: devolve null e NÃO guarda; a próxima tenta de novo
  mode = 'fail';
  assert.equal(await loader.load('t', 'd'), null);
  assert.equal(loader.peek('t', 'd'), undefined, 'falha não fica guardada');
  mode = 'ok';
  assert.deepEqual(await loader.load('t', 'd'), { average: 4.5, count: 10 }, 'tenta de novo e funciona');
  assert.equal(calls.filter((c) => c === 't:d').length, 2);

  // sem avaliações é um resultado válido e fica guardado
  mode = 'empty';
  assert.deepEqual(await loader.load('t', 'e'), { average: 0, count: 0 });
  await loader.load('t', 'e');
  assert.equal(calls.filter((c) => c === 't:e').length, 1, '"sem avaliações" também é guardado');

  // resposta estranha vira "sem avaliações" (nunca NaN na tela)
  mode = 'nan';
  assert.deepEqual(await loader.load('t', 'f'), { average: 0, count: 0 });
  console.log('itemRatingLoader: ok');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
