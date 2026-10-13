// Funções PURAS do cartão ilustrativo da etapa "Pagamento" do carrinho.
//
// IMPORTANTE (segurança): o app NÃO processa pagamento — o cartão é pago na
// maquininha, na entrega/retirada. Estas funções só formatam o que a pessoa
// digita para o desenho do cartão; nada aqui lê, grava ou envia dados (sem
// storage, sem rede, sem log). Mantenha assim.
//
// O TIPO (crédito/débito) NÃO é detectado aqui: não existe forma confiável de
// descobri-lo só pelo número dentro do navegador (a mesma faixa de BIN atende
// crédito, débito e múltiplo). Por isso a tela tem um seletor Crédito | Débito.

export type CardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'diners' | 'unknown';

// Faixas de BIN do Elo (6 dígitos) mais usadas no Brasil: [início, fim].
const ELO_RANGES: ReadonlyArray<readonly [number, number]> = [
  [401178, 401179],
  [431274, 431274],
  [438935, 438935],
  [451416, 451416],
  [457393, 457393],
  [457631, 457632],
  [504175, 504175],
  [506699, 506778],
  [509000, 509999],
  [627780, 627780],
  [636297, 636297],
  [636368, 636368],
  [650031, 650033],
  [650035, 650051],
  [650405, 650439],
  [650485, 650538],
  [650541, 650598],
  [650700, 650718],
  [650720, 650727],
  [650901, 650978],
  [651652, 651679],
  [655000, 655019],
  [655021, 655058],
];

// Prefixos de 6 dígitos do Hipercard (inclui as faixas 3841xx da bandeira).
const HIPERCARD_PREFIXES: readonly string[] = [
  '606282',
  '637095',
  '637568',
  '637599',
  '637609',
  '637612',
  '384100',
  '384140',
  '384160',
];

/** Só os dígitos (remove espaços, letras e qualquer símbolo). */
export function onlyDigits(input: string): string {
  return input.replace(/\D/g, '');
}

function inRange(value: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  return ranges.some(([from, to]) => value >= from && value <= to);
}

/**
 * Descobre a bandeira pelo prefixo (BIN). Só responde quando o prefixo já é
 * decisivo: Elo e Hipercard exigem 6 dígitos (por isso um número que começa
 * com 4 aparece como Visa e pode virar Elo ao completar o BIN). Desconhecida =
 * 'unknown' (o card mostra o ícone genérico).
 */
export function detectBrand(input: string): CardBrand {
  const d = onlyDigits(input);
  if (d.length === 0) return 'unknown';

  // Marcas de faixa longa primeiro (Elo/Hipercard sobrepõem 4xxx, 5xxx, 6xxx, 38xx).
  if (d.length >= 6) {
    const bin6 = d.slice(0, 6);
    if (HIPERCARD_PREFIXES.includes(bin6)) return 'hipercard';
    if (inRange(Number(bin6), ELO_RANGES)) return 'elo';
  }

  // American Express: 34 e 37.
  if (d.startsWith('34') || d.startsWith('37')) return 'amex';

  // Mastercard: 51-55 e 2221-2720.
  if (d.length >= 2) {
    const two = Number(d.slice(0, 2));
    if (two >= 51 && two <= 55) return 'mastercard';
  }
  if (d.length >= 4) {
    const four = Number(d.slice(0, 4));
    if (four >= 2221 && four <= 2720) return 'mastercard';
  }

  // Diners: 300-305, 3095, 36, 38 e 39.
  if (d.length >= 2) {
    const two = d.slice(0, 2);
    if (two === '36' || two === '38' || two === '39') return 'diners';
  }
  if (d.length >= 3) {
    const three = Number(d.slice(0, 3));
    if (three >= 300 && three <= 305) return 'diners';
  }
  if (d.startsWith('3095')) return 'diners';

  // Visa: 4.
  if (d.startsWith('4')) return 'visa';

  return 'unknown';
}

/** Quantidade máxima de dígitos aceita para a bandeira (Amex 15, demais 16). */
export function maxCardDigits(brand: CardBrand): number {
  return brand === 'amex' ? 15 : 16;
}

// Agrupamento: Amex 4-6-5; as demais (e desconhecida) 4-4-4-4.
function groupSizes(brand: CardBrand): readonly number[] {
  return brand === 'amex' ? [4, 6, 5] : [4, 4, 4, 4];
}

/**
 * Formata o número em grupos conforme a bandeira (Amex 4-6-5, demais
 * 4-4-4-4). Aceita qualquer entrada: só os dígitos são usados e o excesso é
 * cortado no limite da bandeira.
 */
export function formatCardNumber(input: string, brand: CardBrand = detectBrand(input)): string {
  const digits = onlyDigits(input).slice(0, maxCardDigits(brand));
  const groups: string[] = [];
  let cursor = 0;
  for (const size of groupSizes(brand)) {
    if (cursor >= digits.length) break;
    groups.push(digits.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups.join(' ');
}

/**
 * Versão para o DESENHO do cartão: dígitos digitados + "•" nas posições que
 * faltam, já agrupados ("4111 •••• •••• ••••"). Vazio = só pontos.
 */
export function maskNumber(input: string, brand: CardBrand = detectBrand(input)): string {
  const digits = onlyDigits(input).slice(0, maxCardDigits(brand));
  let cursor = 0;
  return groupSizes(brand)
    .map((size) => {
      let group = '';
      for (let i = 0; i < size; i += 1) {
        group += cursor < digits.length ? digits[cursor] : '\u2022';
        cursor += 1;
      }
      return group;
    })
    .join(' ');
}

/**
 * Validação de Luhn (dígito verificador). Ignora espaços/letras. Exige entre
 * 12 e 19 dígitos — abaixo disso o número ainda está incompleto.
 */
export function luhnValid(input: string): boolean {
  const digits = onlyDigits(input);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Validade "MM/AA" a partir do que foi digitado: só dígitos, mês limitado a 12
 * (um primeiro dígito maior que 1 vira "0N") e no máximo 4 dígitos.
 */
export function formatExpiry(input: string): string {
  let digits = onlyDigits(input).slice(0, 4);
  if (digits.length >= 1 && Number(digits[0]) > 1) digits = `0${digits}`.slice(0, 4);
  if (digits.length >= 2 && Number(digits.slice(0, 2)) > 12) digits = `12${digits.slice(2)}`;
  // A barra só entra a partir do 3º dígito: assim apagar com backspace funciona.
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
