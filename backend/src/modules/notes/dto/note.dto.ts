import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { NOTE_TAGS } from '../note.entity';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export class CreateNoteDto {
  @IsOptional() @IsString() @MaxLength(5000)
  content?: string;

  @IsOptional() @Matches(HEX, { message: 'color deve ser um hex #RRGGBB.' })
  color?: string;

  @IsOptional() @Matches(HEX, { message: 'textColor deve ser um hex #RRGGBB.' })
  textColor?: string;

  @IsOptional() @IsIn(NOTE_TAGS as unknown as string[])
  tag?: string;

  @IsOptional() @IsInt() @Min(160) @Max(1200)
  width?: number;

  @IsOptional() @IsInt() @Min(48) @Max(1200)
  height?: number;

  @IsOptional() @IsInt() @Min(0) @Max(20000)
  posX?: number;

  @IsOptional() @IsInt() @Min(0) @Max(20000)
  posY?: number;

  @IsOptional() @IsBoolean()
  isPinned?: boolean;

  @IsOptional() @IsBoolean()
  isMinimized?: boolean;
}

export class UpdateNoteDto extends CreateNoteDto {}

class LayoutItemDto {
  @IsUUID()
  id: string;

  // Posição é opcional: reordenar no modo Cards muda só a ordem, não o lugar no quadro.
  @IsOptional() @IsInt() @Min(0) @Max(20000)
  posX?: number;

  @IsOptional() @IsInt() @Min(0) @Max(20000)
  posY?: number;

  @IsOptional() @IsInt() @Min(160) @Max(1200)
  width?: number;

  @IsOptional() @IsInt() @Min(48) @Max(1200)
  height?: number;

  // Fixar/desafixar e reordenar chegam junto da posição: um gesto = uma
  // requisição atômica (nunca fica nota fixada no meio de outra).
  @IsOptional() @IsBoolean()
  isPinned?: boolean;

  @IsOptional() @IsInt() @Min(-100000) @Max(100000)
  sortOrder?: number;
}

// "Organizar em grade" e arrastes em lote: só posição/tamanho, nunca conteúdo.
export class UpdateLayoutDto {
  @IsArray() @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LayoutItemDto)
  items: LayoutItemDto[];
}
