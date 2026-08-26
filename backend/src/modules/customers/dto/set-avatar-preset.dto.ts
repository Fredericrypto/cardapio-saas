import { IsIn } from 'class-validator';
import { PRESET_AVATAR_IDS } from '../preset-avatars';

export class SetAvatarPresetDto {
  @IsIn(PRESET_AVATAR_IDS)
  presetId: string;
}
