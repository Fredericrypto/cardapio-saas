import { absolutizeAvatarUrl } from '../src/common/utils/avatar-url';

let fails = 0;
let checks = 0;
function eq(name: string, got: unknown, want: unknown) {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.error(`FALHOU ${name}: obtido=${JSON.stringify(got)} esperado=${JSON.stringify(want)}`); }
  else console.log(`ok ${name}`);
}

const prev = process.env.CUSTOMER_APP_URL;
process.env.CUSTOMER_APP_URL = 'https://app.exemplo.com/';
eq('relativo vira absoluto, sem barra dupla', absolutizeAvatarUrl('/avatars/female-4.svg'), 'https://app.exemplo.com/avatars/female-4.svg');
eq('absoluto não muda', absolutizeAvatarUrl('https://cdn.exemplo.com/a.png'), 'https://cdn.exemplo.com/a.png');
eq('idempotente', absolutizeAvatarUrl(absolutizeAvatarUrl('/a.svg')), 'https://app.exemplo.com/a.svg');
eq('null', absolutizeAvatarUrl(null), null);
eq('undefined', absolutizeAvatarUrl(undefined), null);
eq('vazio', absolutizeAvatarUrl(''), null);

delete process.env.CUSTOMER_APP_URL;
eq('sem CUSTOMER_APP_URL mantém o relativo (não quebra o cardápio)', absolutizeAvatarUrl('/avatars/female-4.svg'), '/avatars/female-4.svg');
if (prev !== undefined) process.env.CUSTOMER_APP_URL = prev;

console.log(`\n${checks - fails}/${checks} ok, ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
