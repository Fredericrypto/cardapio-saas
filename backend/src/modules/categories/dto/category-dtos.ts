import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCustomCategoryDto {
  @IsString()
  @MaxLength(60)
  name: string;
}

export class RenameCategoryDto {
  @IsString()
  @MaxLength(60)
  name: string;
}

export class ActivateManyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(150)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  keys: string[];
}

export class ReorderCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @IsUUID('all', { each: true })
  ids: string[];
}
