import { IsString, MinLength } from 'class-validator';

export class ForceResetSessionDto {
  // Obrigatório de verdade — motivo genérico tipo "." ou "x" ainda
  // passa na validação (não dá pra impedir isso só com class-validator),
  // mas pelo menos garante que ALGUM texto foi digitado, não um clique
  // vazio de confirmação.
  @IsString()
  @MinLength(5, { message: 'Descreva o motivo (mínimo 5 caracteres).' })
  reason: string;
}
