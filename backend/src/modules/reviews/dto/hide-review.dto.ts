import { IsString, MinLength, MaxLength } from 'class-validator';

// `reason` com mínimo de 10 caracteres de propósito — não é validação
// de segurança, é fricção deliberada: força o funcionário a escrever um
// motivo de verdade ("cliente usou linguagem ofensiva contra a equipe")
// em vez de um "." ou "ruim" só pra passar pela obrigatoriedade. O
// motivo fica salvo e visível pra sempre no registro da review oculta.
export class HideReviewDto {
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason: string;
}
