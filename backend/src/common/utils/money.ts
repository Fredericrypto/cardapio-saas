// Utilitário central para toda matemática monetária do backend.
//
// Nunca somamos números decimais (ex: 19.90 + 6.00) diretamente — ponto
// flutuante binário não representa exatamente a maioria dos valores
// decimais (0.1 + 0.2 !== 0.3), e isso pode acumular erros de centavos em
// pedidos com muitos itens. Em vez disso, convertemos tudo para centavos
// (inteiros), somamos como inteiros, e só convertemos de volta pra decimal
// no final, para gravar/exibir.

// Converte um valor decimal (R$ 19.90) para centavos inteiros (1990),
// arredondando de forma segura contra imprecisão de ponto flutuante.
export function toCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

// Converte centavos inteiros de volta para decimal com 2 casas (R$ 19.90).
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// Multiplica um preço unitário (decimal) por uma quantidade inteira,
// retornando o subtotal em centavos — sem jamais passar por ponto
// flutuante decimal no meio do caminho.
export function multiplyPriceByQuantity(unitPrice: number | string, quantity: number): number {
  return toCents(unitPrice) * quantity;
}
