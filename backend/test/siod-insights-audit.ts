// Auditoria da aba "Entregas" do SIOD (configuração + visualização) — Postgres REAL
// (banco de teste obrigatório; apaga os restaurantes). Parte pura + SQL conferido
// contra um cálculo independente. Uso:
//   DATABASE_URL=postgres://.../cardapio_test npm run test:siod-insights
import 'reflect-metadata';
import { assertTestDatabase, createChecker } from './helpers';
assertTestDatabase();
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppDataSource } from '../src/config/data-source';
import { SiodInsightsService } from '../src/modules/siod/siod-insights.service';
import type { QueryFn } from '../src/modules/siod/siod-insights.queries';
import { runDbChecks, runPureChecks } from './siod-insights-core';
import type { Svc } from './siod-insights-core';

const { ok, finish } = createChecker();

// Imita o driver pg: números chegam como string (garante que a conversão no serviço é robusta).
const asPgStrings =
  (q: QueryFn): QueryFn =>
  async (sql, params) =>
    (await q(sql, params)).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])));

const rejectsAs = async (fn: () => Promise<unknown>, name: 'BadRequestException' | 'NotFoundException'): Promise<boolean> => {
  const cls = name === 'BadRequestException' ? BadRequestException : NotFoundException;
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof cls;
  }
};

(async () => {
  runPureChecks(ok);
  const ds = await AppDataSource.initialize();
  const query: QueryFn = (sql, params) => ds.query(sql, params);
  await runDbChecks(query, ok, () => new SiodInsightsService(ds) as unknown as Svc, rejectsAs, asPgStrings);
  await ds.destroy();
  process.exit(finish());
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
