import { IsBoolean } from 'class-validator';

export class SetCategoryActiveDto {
  @IsBoolean()
  active: boolean;
}
