import { UnauthorizedException } from '@nestjs/common';
import { OrdersController } from '../src/modules/orders/orders.controller';

let fails = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail = '') {
  checks++;
  if (!cond) { fails++; console.error(`FALHOU ${name} ${detail}`); }
  else console.log(`ok ${name}`);
}
async function rejection(fn: () => unknown): Promise<any> {
  try { await fn(); return null; } catch (e) { return e; }
}
function isLoginRequired(e: any): boolean {
  return e instanceof UnauthorizedException
    && e.getStatus() === 401
    && (e.getResponse() as any)?.code === 'LOGIN_REQUIRED'
    && typeof (e.getResponse() as any)?.message === 'string'
    && (e.getResponse() as any).message.length > 0;
}

function build() {
  const calls: unknown[][] = [];
  const orders: any = { create: async (...args: unknown[]) => { calls.push(args); return { id: 'o1' }; } };
  const auth: any = { verifyToken: (_tenant: string, token: string) => (token === 'good' ? { customerId: 'c1' } : null) };
  return { controller: new OrdersController(orders, auth, {} as any), calls };
}
const dto: any = { orderType: 'mesa' };

async function main() {
  // Pedido sem conta é recusado no servidor, qualquer que seja o motivo da falta de conta.
  for (const [name, header] of [
    ['sem Authorization', undefined],
    ['token inválido', 'Bearer bad'],
    ['esquema errado', 'Basic good'],
    ['Bearer vazio', 'Bearer '],
  ] as const) {
    const { controller, calls } = build();
    const e = await rejection(() => controller.createPublic('t1', dto, header, 's1'));
    ok(`${name}: 401 LOGIN_REQUIRED`, isLoginRequired(e), `obtido=${e ? e.constructor?.name : 'aceitou o pedido'}`);
    ok(`${name}: o serviço de pedidos NÃO é chamado`, calls.length === 0, `chamadas=${calls.length}`);
  }

  // Pedido de conta válida passa com assento e dono corretos.
  {
    const { controller, calls } = build();
    const r = await controller.createPublic('t1', dto, 'Bearer good', 's1');
    ok('conta válida: pedido criado', (r as any)?.id === 'o1');
    ok('conta válida: create(tenant, dto, customerId, seat)', JSON.stringify(calls[0]) === JSON.stringify(['t1', dto, 'c1', 's1']), JSON.stringify(calls[0]));
  }
  {
    const { controller, calls } = build();
    await controller.createPublic('t1', dto, 'Bearer good', undefined);
    ok('conta válida sem assento: seat = null', calls[0]?.[3] === null);
  }

  // A função de guarda em si.
  let guard: any = null;
  try { guard = require('../src/common/utils/require-account'); } catch { /* módulo ainda não existe */ }
  ok('módulo require-account existe', guard !== null);
  if (guard) {
    for (const v of [null, undefined, '']) {
      const e = await rejection(() => guard.requireOrderAccount(v));
      ok(`requireOrderAccount(${JSON.stringify(v)}) recusa`, isLoginRequired(e));
    }
    ok('requireOrderAccount devolve o id da conta', guard.requireOrderAccount('c1') === 'c1');
  }

  console.log(`\n${checks - fails}/${checks} ok, ${fails} falhas`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
