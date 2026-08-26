import { ValueTransformer } from 'typeorm';

// BUG CORRIGIDO (sistêmico): colunas Postgres do tipo "numeric" voltam do
// driver como STRING em JS, não number — mesmo a entity TypeORM dizendo
// `tipAmount: number` no TypeScript (mentira de tipagem, o valor real em
// runtime é uma string tipo "4.50"). Isso causava concatenação de string
// em vez de soma (`4.05 + "0.45"` = "4.050.45") sempre que um valor numeric
// era somado a outro no código — resultando em "R$ NaN" na tela sempre que
// havia gorjeta, troco, taxa de entrega etc. envolvidos numa soma.
//
// Esse transformer garante que TODA coluna numeric marcada com ele sempre
// chega como number de verdade tanto lendo do banco quanto gravando.
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null): number | null =>
    value === null || value === undefined ? null : parseFloat(value),
};
