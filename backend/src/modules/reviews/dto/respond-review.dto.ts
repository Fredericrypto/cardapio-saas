import { IsString, MinLength, MaxLength } from 'class-validator';

export class RespondReviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  responseText: string;
}
