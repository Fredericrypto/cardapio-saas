// Auditoria da galeria de fotos do item — com Postgres REAL (banco de teste
// obrigatório; apaga os restaurantes). Cobre o que só o banco prova:
//  - a migration (up/down, backfill de quem já tinha foto, idempotência, CHECK);
//  - capa = images[0] depois de criar/reordenar/remover/trocar a capa;
//  - limite de 5 mesmo com envios SIMULTÂNEOS (lock da linha);
//  - dado antigo / backup anterior à galeria (images vazia + image_url preenchida);
//  - isolamento entre restaurantes e custo nunca no cardápio público.
// Uso:  DATABASE_URL=postgres://.../cardapio_test npm run test:product-images
import 'reflect-metadata';
import { assertTestDatabase, createChecker } from './helpers';
assertTestDatabase();
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppDataSource } from '../src/config/data-source';
import { Product } from '../src/modules/products/product.entity';
import { ProductsService } from '../src/modules/products/products.service';
import { ProductImagesGallery1757400000000 } from '../src/migrations/1757400000000-ProductImagesGallery';

const { ok, finish } = createChecker();
const U = (n: number | string): string => `https://cdn.test/${n}.jpg`;
const eq = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const rejectsWith = async (fn: () => Promise<unknown>, cls: new (...a: never[]) => Error): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof cls;
  }
};

(async () => {
  const ds = await AppDataSource.initialize();
  const q = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> => ds.query(sql, params);
  await q(`TRUNCATE tenants CASCADE`);
  const [t] = await q(`INSERT INTO tenants (slug,name) VALUES ('fotos','Fotos') RETURNING id`);
  const [t2] = await q(`INSERT INTO tenants (slug,name) VALUES ('outra','Outra') RETURNING id`);
  const tenantId = t.id as string;
  const otherTenantId = t2.id as string;
  const [cat] = await q(`INSERT INTO categories (tenant_id,name) VALUES ($1,'Lanches') RETURNING id`, [tenantId]);
  const categoryId = cat.id as string;

  const row = async (id: string): Promise<{ imageUrl: string | null; images: string[] }> => {
    const [r] = await q(`SELECT image_url, images FROM products WHERE id = $1`, [id]);
    return { imageUrl: r.image_url as string | null, images: r.images as string[] };
  };
  const svc = new ProductsService(ds.getRepository(Product), ds);
  const make = async (name: string, images: string[]): Promise<string> =>
    (await svc.create(tenantId, { categoryId, name, price: 10, images })).id;

  // ---------------------------------------------------------------------------
  console.log('1) Migration: down remove, up refaz e preenche quem já tinha foto');
  const qr = ds.createQueryRunner();
  await qr.connect();
  const migration = new ProductImagesGallery1757400000000();
  await migration.down(qr);
  const hasColumn = async (): Promise<boolean> =>
    (await q(`SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='images'`)).length > 0;
  ok(!(await hasColumn()), 'down remove a coluna images');

  const legacy = async (name: string, imageUrl: string | null, deleted = false): Promise<string> =>
    (
      await q(
        `INSERT INTO products (tenant_id,category_id,name,price,image_url,deleted_at)
         VALUES ($1,$2,$3,10,$4,${deleted ? 'now()' : 'NULL'}) RETURNING id`,
        [tenantId, categoryId, name, imageUrl],
      )
    )[0].id as string;
  const lWith = await legacy('Antigo com foto', U('legado'));
  const lNone = await legacy('Antigo sem foto', null);
  const lBlank = await legacy('Antigo foto em branco', '   ');
  const lDeleted = await legacy('Antigo apagado com foto', U('apagado'), true);

  await migration.up(qr);
  ok(await hasColumn(), 'up recria a coluna images');
  ok(eq((await row(lWith)).images, [U('legado')]), 'backfill: produto com foto vira galeria de 1');
  ok((await row(lWith)).imageUrl === U('legado'), 'backfill: a capa (image_url) continua intacta');
  ok(eq((await row(lNone)).images, []), 'backfill: produto sem foto fica com galeria vazia');
  ok(eq((await row(lBlank)).images, []), 'backfill: foto só com espaços não vira foto');
  ok(eq((await row(lDeleted)).images, [U('apagado')]), 'backfill: também vale para produto apagado (soft-delete)');

  await migration.up(qr); // idempotente
  ok(eq((await row(lWith)).images, [U('legado')]), 'rodar o up de novo não duplica nem quebra');
  await qr.release();

  console.log('2) CHECK do banco: no máximo 5 fotos');
  const five = [1, 2, 3, 4, 5].map(U);
  let fiveAccepted = true;
  try {
    await q(`UPDATE products SET images = $1::text[] WHERE id = $2`, [five, lWith]);
  } catch {
    fiveAccepted = false;
  }
  ok(fiveAccepted, 'o banco aceita exatamente 5 fotos');
  let sixRejected = false;
  try {
    await q(`UPDATE products SET images = $1::text[] WHERE id = $2`, [[...five, U(6)], lWith]);
  } catch {
    sixRejected = true;
  }
  ok(sixRejected, 'o banco RECUSA 6 fotos (CHECK) mesmo com SQL direto');
  ok(eq((await row(lWith)).images, five), 'a tentativa recusada não alterou nada');

  // ---------------------------------------------------------------------------
  console.log('3) Criar: galeria, formato antigo, repetidas e excesso');
  const pA = await svc.create(tenantId, { categoryId, name: 'A', price: 10, images: [U(1), U(2), U(3)] });
  ok(eq(pA.images, [U(1), U(2), U(3)]) && pA.imageUrl === U(1), 'create com images: capa = primeira foto');
  const dbA = await row(pA.id);
  ok(eq(dbA.images, [U(1), U(2), U(3)]) && dbA.imageUrl === U(1), '...e o banco gravou a mesma coisa');
  const pLegacy = await svc.create(tenantId, { categoryId, name: 'Legado', price: 10, imageUrl: U(9) });
  ok(eq(pLegacy.images, [U(9)]) && pLegacy.imageUrl === U(9), 'create só com imageUrl (formato antigo) vira galeria de 1');
  const pNone = await svc.create(tenantId, { categoryId, name: 'Sem foto', price: 10 });
  ok(eq(pNone.images, []) && pNone.imageUrl === null, 'create sem foto: galeria vazia e capa nula');
  const pDup = await svc.create(tenantId, { categoryId, name: 'Dup', price: 10, images: [U(1), U(1), U(2)] });
  ok(eq(pDup.images, [U(1), U(2)]), 'create descarta repetidas');
  ok(
    await rejectsWith(() => svc.create(tenantId, { categoryId, name: 'Seis', price: 10, images: [1, 2, 3, 4, 5, 6].map(U) }), BadRequestException),
    'create com 6 fotos é recusado (400)',
  );

  // ---------------------------------------------------------------------------
  console.log('4) Atualizar: reordenar, remover, trocar a capa, não mexer');
  const reordered = await svc.update(tenantId, pA.id, { images: [U(3), U(1), U(2)] });
  ok(eq(reordered.images, [U(3), U(1), U(2)]) && reordered.imageUrl === U(3), 'reordenar muda a capa para a nova primeira');
  ok((await row(pA.id)).imageUrl === U(3), '...e o banco também');
  const removedOne = await svc.update(tenantId, pA.id, { images: [U(1), U(2)] });
  ok(eq(removedOne.images, [U(1), U(2)]) && removedOne.imageUrl === U(1), 'remover a capa promove a próxima');
  const legacySwap = await svc.update(tenantId, pA.id, { imageUrl: U(7) });
  ok(eq(legacySwap.images, [U(7), U(2)]) && legacySwap.imageUrl === U(7), 'imageUrl sozinho troca só a capa e mantém as outras');
  const renamed = await svc.update(tenantId, pA.id, { name: 'A renomeado' });
  ok(eq(renamed.images, [U(7), U(2)]) && renamed.imageUrl === U(7), 'editar outro campo não mexe nas fotos');
  const precedence = await svc.update(tenantId, pA.id, { images: [U(4)], imageUrl: U(99) });
  ok(eq(precedence.images, [U(4)]) && precedence.imageUrl === U(4), 'images tem precedência sobre imageUrl');
  const cleared = await svc.update(tenantId, pA.id, { images: [] });
  ok(eq(cleared.images, []) && cleared.imageUrl === null, 'images = [] remove todas e zera a capa');
  const dbCleared = await row(pA.id);
  ok(eq(dbCleared.images, []) && dbCleared.imageUrl === null, '...no banco também');
  await svc.update(tenantId, pA.id, { images: five });
  ok(
    await rejectsWith(() => svc.update(tenantId, pA.id, { images: [...five, U(6)] }), BadRequestException),
    'update com 6 fotos é recusado (400)',
  );
  ok(eq((await row(pA.id)).images, five), '...e nada foi gravado');

  console.log('5) Isolamento entre restaurantes');
  ok(await rejectsWith(() => svc.update(otherTenantId, pA.id, { images: [U(1)] }), NotFoundException), 'outro restaurante não altera as fotos (404)');
  ok(await rejectsWith(() => svc.appendImages(otherTenantId, pA.id, [U(1)]), NotFoundException), 'outro restaurante não acrescenta fotos (404)');
  ok(eq((await row(pA.id)).images, five), 'as fotos continuam intactas');

  // ---------------------------------------------------------------------------
  console.log('6) appendImages: ordem, limite e envios simultâneos');
  const pAppend = await make('Append', [U(1)]);
  const appended = await svc.appendImages(tenantId, pAppend, [U(2), U(3)]);
  ok(eq(appended.images, [U(1), U(2), U(3)]) && appended.imageUrl === U(1), 'novas fotos entram no FIM e a capa não muda');
  ok(
    await rejectsWith(() => svc.appendImages(tenantId, pAppend, [U(4), U(5), U(6)]), BadRequestException),
    'passar de 5 é recusado (3 + 3)',
  );
  ok(eq((await row(pAppend)).images, [U(1), U(2), U(3)]), '...sem gravar parte');
  const pEmpty = await make('Append vazio', []);
  const first = await svc.appendImages(tenantId, pEmpty, [U('a')]);
  ok(eq(first.images, [U('a')]) && first.imageUrl === U('a'), 'primeira foto de um item sem fotos vira a capa');

  const pRace = await make('Corrida 1', [U(1), U(2), U(3)]);
  const race = await Promise.allSettled([
    svc.appendImages(tenantId, pRace, [U('x1'), U('x2')]),
    svc.appendImages(tenantId, pRace, [U('y1'), U('y2')]),
  ]);
  const okCount = race.filter((r) => r.status === 'fulfilled').length;
  const raceRow = await row(pRace);
  ok(okCount === 1, 'dois envios de 2 fotos num item com 3: só UM passa');
  ok(raceRow.images.length === 5 && new Set(raceRow.images).size === 5, '...e o item termina com exatamente 5 fotos, sem repetidas');
  ok(raceRow.images.slice(0, 3).every((u, i) => u === U(i + 1)), '...preservando as 3 fotos originais na frente');

  const pRace2 = await make('Corrida 2', []);
  const many = await Promise.allSettled([1, 2, 3, 4, 5].map((n) => svc.appendImages(tenantId, pRace2, [U(`p${n}`)])));
  const row2 = await row(pRace2);
  ok(many.every((r) => r.status === 'fulfilled'), '5 envios simultâneos de 1 foto cabem todos');
  ok(row2.images.length === 5 && new Set(row2.images).size === 5, '...sem perder nenhuma (sem atualização perdida)');

  const pRace3 = await make('Corrida 3', []);
  const eight = await Promise.allSettled([1, 2, 3, 4, 5, 6, 7, 8].map((n) => svc.appendImages(tenantId, pRace3, [U(`q${n}`)])));
  const row3 = await row(pRace3);
  ok(eight.filter((r) => r.status === 'fulfilled').length === 5, '8 envios simultâneos de 1 foto: exatamente 5 passam');
  ok(row3.images.length === 5 && row3.imageUrl === row3.images[0], '...e o item fica com 5 fotos e capa coerente');

  // ---------------------------------------------------------------------------
  console.log('7) Dado antigo / backup anterior à galeria');
  const [old] = await q(
    `INSERT INTO products (tenant_id,category_id,name,price,image_url,images,cost_price)
     VALUES ($1,$2,'Restaurado',10,$3,'{}',4.5) RETURNING id`,
    [tenantId, categoryId, U('capa-antiga')],
  );
  const oldId = old.id as string;
  const viaOne = await svc.findOne(tenantId, oldId);
  ok(eq(viaOne.images, [U('capa-antiga')]), 'findOne: images vazia + capa antiga = galeria de 1');
  const publicList = await svc.findAllForPublic(tenantId);
  const pub = publicList.find((p) => p.id === oldId);
  ok(pub !== undefined && eq(pub.images, [U('capa-antiga')]), 'cardápio público: mesma coisa');
  ok(publicList.every((p) => p.costPrice === null), 'cardápio público NUNCA devolve o custo do produto');
  const adminList = await svc.findAllForAdmin(tenantId);
  ok(adminList.find((p) => p.id === oldId)?.costPrice === 4.5, 'o painel (admin) continua vendo o custo');
  ok(!publicList.some((p) => p.id === lDeleted), 'produto apagado (soft-delete) não aparece no cardápio');
  await svc.update(tenantId, oldId, { name: 'Restaurado e salvo' });
  ok(eq((await row(oldId)).images, [U('capa-antiga')]), 'ao salvar, o banco é corrigido (images passa a ter a capa)');
  const appendedOld = await svc.appendImages(tenantId, oldId, [U('nova')]);
  ok(eq(appendedOld.images, [U('capa-antiga'), U('nova')]), 'acrescentar numa galeria antiga preserva a capa que já existia');

  await ds.destroy();
  process.exit(finish());
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
