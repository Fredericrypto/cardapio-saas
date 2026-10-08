// Auditoria do horário de funcionamento (fuso de Brasília, 24h, janela que cruza a
// meia-noite, toggle x horário). Não usa banco.
import {
  computeIsOpenNow, getBrazilClock, getMinutesUntilClose, isOpen24hNow, isWithinSchedule,
} from '../src/common/utils/schedule';
import { createChecker } from './helpers';

const { ok, finish } = createChecker();
const days = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const H24 = Object.fromEntries(days.map((d) => [d, '00:00-00:00']));
const only = (day: string, value: string) => Object.fromEntries(days.map((d) => [d, d === day ? value : 'fechado']));
const at = (iso: string) => new Date(iso);

// 2026-10-04 é domingo. 14:00 UTC = 11:00 em Brasília.
const sun11 = at('2026-10-04T14:00:00Z');
ok(JSON.stringify(getBrazilClock(sun11)) === JSON.stringify({ dayIndex: 0, minutes: 660 }), 'relógio de Brasília: domingo 11:00');
ok(isWithinSchedule(H24, sun11) && isOpen24hNow(H24, sun11) && getMinutesUntilClose(true, H24, sun11) === null, '00:00-00:00 = aberto 24h, sem "fecha em"');
const sun2306 = at('2026-10-05T02:06:00Z'); // domingo 23:06 BRT (o servidor em UTC já estaria na segunda)
ok(isWithinSchedule(only('domingo', '18:00-00:00'), sun2306) && getMinutesUntilClose(true, only('domingo', '18:00-00:00'), sun2306) === 54, 'domingo 23:06 com 18:00-00:00: aberto, fecha em 54 min (dia certo no fuso BRT)');
const cross = only('sabado', '18:00-02:00');
ok(isWithinSchedule(cross, at('2026-10-04T03:30:00Z')) && getMinutesUntilClose(true, cross, at('2026-10-04T03:30:00Z')) === 90, 'janela que cruza a meia-noite: domingo 00:30 ainda é a de sábado (fecha em 90 min)');
ok(!isWithinSchedule(cross, at('2026-10-04T06:00:00Z')), 'domingo 03:00 já fechou');
ok(computeIsOpenNow(false, H24, true, sun11) === false, 'admin fechou manualmente dentro do horário: continua fechado');
ok(computeIsOpenNow(true, cross, true, at('2026-10-04T06:00:00Z')) === false, 'horário fechou (transição pendente): o horário vence o toggle');
ok(computeIsOpenNow(true, cross, false, at('2026-10-04T06:00:00Z')) === true, 'admin abriu fora do horário (sem transição pendente): fica aberto');
ok(computeIsOpenNow(true, cross, null, at('2026-10-04T06:00:00Z')) === false, 'estado desconhecido (loja antiga): comportamento anterior (toggle E horário)');
ok(computeIsOpenNow(true, null, null, sun11) === true && computeIsOpenNow(false, null, null, sun11) === false, 'sem horário configurado: vale só o toggle');
process.exit(finish());
