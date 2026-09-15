import { IsString, IsNotEmpty, IsUUID, IsOptional, IsIn } from 'class-validator';

export class CreateTableDto {
  @IsNotEmpty()
  @IsString()
  number: string; // "Mesa 5", "Balcão 2"

  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsIn(['mesa', 'balcao'])
  kind?: 'mesa' | 'balcao';
}
