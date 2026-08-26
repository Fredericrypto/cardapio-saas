// Combina o toggle manual ("Estabelecimento aberto") com o horário de
// funcionamento configurado — os dois eram tratados como coisas
// separadas antes (o toggle manual mandava sozinho, o horário era só
// texto informativo), o que causava exatamente a confusão de "diz que tá
// dentro do horário mas aparece fechado": o admin configurava o horário
// mas o toggle continuava desligado de antes, sem ligação nenhuma entre
// os dois.
//
// Regra: se não tem horário configurado pra hoje, vale só o toggle manual
// (comportamento antigo, compatível com quem não configurou nada ainda).
// Se tem horário configurado, só fica "aberto de verdade" quando o toggle
// manual ESTÁ ligado E o horário de agora está dentro da janela de hoje —
// o toggle manual continua servindo pra fechar excepcionalmente mesmo
// dentro do horário (ex: acabou o insumo, precisa fechar mais cedo hoje).
const DAY_KEYS = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
];

function isWithinTodaySchedule(openingHours: Record<string, string> | null): boolean {
  if (!openingHours) return true;

  const key = DAY_KEYS[new Date().getDay()];
  const raw = openingHours[key];
  if (!raw || raw === 'fechado') return false;

  const [openStr, closeStr] = raw.split('-');
  if (!openStr || !closeStr) return true; // formato inesperado — não bloqueia por engano

  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);
  if ([openH, openM, closeH, closeM].some((n) => Number.isNaN(n))) return true;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (closeMinutes > openMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  // Fecha depois da meia-noite (ex: 18:00-02:00) — janela cruza a virada do dia.
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

// Combina o toggle manual ("Estabelecimento aberto") com o horário de
// funcionamento configurado. Pedido explícito do Felipe: "fecha
// automaticamente quando bate a hora, mas o toggle também funciona
// independente pra abrir e fechar". As duas coisas juntas só têm uma
// leitura consistente: o toggle é a autoridade pra FECHAR a qualquer
// momento (inclusive dentro do horário — ex: acabou o insumo) e pra
// ABRIR dentro da janela configurada; já o horário É quem decide o
// fechamento automático no fim do expediente, mesmo com o toggle ligado
// — sem isso, "fecha sozinho no horário" e "toggle manda" seriam
// contraditórios (o toggle ligado sempre venceria e nunca fecharia
// sozinho). Se o admin quiser atender fora do horário configurado de
// propósito (evento especial etc.), o caminho é ajustar o horário de
// hoje em Configurações, não só ligar o toggle.
export function computeIsOpenNow(
  manualIsOpen: boolean,
  openingHours: Record<string, string> | null,
): boolean {
  return manualIsOpen && isWithinTodaySchedule(openingHours);
}

// Minutos até fechar, se já está aberto e o fechamento é HOJE (não cruza
// a virada da meia-noite de forma ambígua) — usado pra mostrar o aviso
// "Fecha em Xh" no cardápio quando faltar menos de 1h. null quando não
// há horário configurado, está fechado, ou o fechamento é longe.
export function getMinutesUntilClose(
  isOpenNow: boolean,
  openingHours: Record<string, string> | null,
): number | null {
  if (!isOpenNow || !openingHours) return null;

  const key = DAY_KEYS[new Date().getDay()];
  const raw = openingHours[key];
  if (!raw || raw === 'fechado') return null;

  const [, closeStr] = raw.split('-');
  if (!closeStr) return null;
  const [closeH, closeM] = closeStr.split(':').map(Number);
  if ([closeH, closeM].some((n) => Number.isNaN(n))) return null;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const closeMinutes = closeH * 60 + closeM;

  const minutesUntilClose =
    closeMinutes >= nowMinutes ? closeMinutes - nowMinutes : closeMinutes + 1440 - nowMinutes;

  return minutesUntilClose;
}
