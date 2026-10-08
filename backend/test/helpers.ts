// Utilidades dos testes de auditoria (backend/test/*-audit.ts).
//
// ATENÇÃO: estes testes APAGAM todos os restaurantes do banco (TRUNCATE tenants
// CASCADE) para semear dados determinísticos. Só rodam num banco cujo nome
// contenha "test". Uso:  DATABASE_URL=postgres://.../cardapio_test npm run test:all

export function assertTestDatabase(): void {
  let dbName = '';
  try {
    dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  } catch {
    /* sem DATABASE_URL válida */
  }
  if (!/test/i.test(dbName) && process.env.ALLOW_DESTRUCTIVE_TESTS !== '1') {
    console.error(
      `Recuso rodar: o banco "${dbName || '(DATABASE_URL ausente)'}" não parece ser de teste. Estes scripts apagam todos os dados.`,
    );
    process.exit(2);
  }
}

export function createChecker() {
  let pass = 0;
  let fail = 0;
  return {
    ok(condition: boolean, label: string) {
      if (condition) pass++;
      else fail++;
      console.log(condition ? '  OK ' : '  FALHOU', label);
    },
    finish(): number {
      console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
      return fail === 0 ? 0 : 1;
    },
  };
}
