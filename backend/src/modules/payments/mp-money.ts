// Conversão de valores para a API do Mercado Pago.
//
// REGRA: todo valor no banco e na memória do servidor é INTEIRO em centavos.
// A API do Mercado Pago exige `transaction_amount` como número decimal com
// até 2 casas (ex.: 14.90) — esta é a ÚNICA função do sistema que faz essa
// conversão, e só deve ser chamada na hora de montar o corpo da requisição
// HTTP. Nada de somar/dividir/multiplicar decimais em outro lugar.

/**
 * Centavos inteiros -> número decimal para o payload do Mercado Pago.
 *
 * Não usa divisão em ponto flutuante: monta o texto "reais.centavos" a partir
 * de aritmética INTEIRA (quociente e resto) e só então converte. O resultado é
 * o `double` mais próximo do decimal exato, que `JSON.stringify` serializa de
 * volta como o mesmo decimal (ex.: 1490 -> 14.9).
 *
 * Lança erro para qualquer valor que não seja inteiro seguro positivo: cobrar
 * R$ 0,00, valor negativo, fracionário, NaN ou Infinity é sempre bug.
 */
export function centsToMpAmount(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new RangeError(`Valor em centavos inválido para cobrança: ${String(cents)}`);
  }
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  return Number(`${reais}.${centavos.toString().padStart(2, '0')}`);
}

/**
 * Valor a COBRAR de um pedido, em centavos: total persistido (já líquido de
 * promoção, taxa de entrega e cashback) + gorjeta. Recebe centavos inteiros —
 * quem chama converte as colunas `numeric` do banco com `toCents`.
 */
export function chargeCents(totalCents: number, tipCents: number): number {
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(tipCents)) {
    throw new RangeError('Total e gorjeta devem ser centavos inteiros.');
  }
  if (totalCents < 0 || tipCents < 0) {
    throw new RangeError('Total e gorjeta não podem ser negativos.');
  }
  return totalCents + tipCents;
}
