// Auditoria do horário de funcionamento (fuso de Brasília, 24h, janela que cruza a
// meia-noite, toggle x horário). Não usa banco.
import {
  computeIsOpenNow, getBrazilClock, getNextOpening, getMinutesUntilClose, isOpen24hNow, isWithinSchedule,
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

// Próxima abertura (aviso "Abre Hoje às 18:00" / "Abre Segunda-feira às 09:30").
const week = Object.fromEntries(days.map((d) => [d, d === 'domingo' ? 'fechado' : '09:30-18:00']));
const evening = { ...week, domingo: '18:00-23:00' };
const sunMorning = at('2026-10-04T12:00:00Z'); // domingo 09:00 BRT
const n1 = getNextOpening(evening, sunMorning);
ok(n1?.dayKey === 'domingo' && n1.time === '18:00' && n1.daysAhead === 0, 'domingo 09:00, abre 18:00: "Abre Hoje às 18:00"');
const n2 = getNextOpening(week, sunMorning);
ok(n2?.dayKey === 'segunda' && n2.time === '09:30' && n2.daysAhead === 1, 'domingo fechado: próxima abertura segunda 09:30');
const n3 = getNextOpening(week, at('2026-10-05T22:00:00Z')); // segunda 19:00 BRT, já fechou
ok(n3?.dayKey === 'terca' && n3.time === '09:30', 'segunda 19:00 depois de fechar: terça 09:30');
const n4 = getNextOpening(only('segunda', '09:30-18:00'), at('2026-10-05T22:00:00Z'));
ok(n4?.dayKey === 'segunda' && n4.daysAhead === 7, 'único dia aberto já passou: segunda da semana seguinte (7 dias)');
ok(getNextOpening(Object.fromEntries(days.map((d) => [d, 'fechado'])), sunMorning) === null && getNextOpening(null, sunMorning) === null, 'tudo fechado ou sem horário: sem previsão');
const n5 = getNextOpening(H24, sun11);
ok(n5?.dayKey === 'segunda' && n5.time === '00:00' && n5.daysAhead === 1, '24h fechado na mão: próxima abertura é a do dia seguinte 00:00');
process.exit(finish());
