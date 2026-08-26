import { IsOptional, IsNumber, Min } from 'class-validator';

export class RequestClosingDto {
  // Gorjeta opcional escolhida pelo cliente antes de solicitar o fechamento.
  @IsOptional()
  @IsNumber()
  @Min(0)
  tipAmount?: number;
}
