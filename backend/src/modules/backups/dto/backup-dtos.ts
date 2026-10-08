import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BACKUP_FREQUENCIES, MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from '../tenant-backup-settings.entity';

export class UpdateBackupSettingsDto {
  @IsIn([...BACKUP_FREQUENCIES], { message: 'Frequência inválida. Use 0 (desativado), 3, 7, 15 ou 30 dias.' })
  frequencyDays: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido. Use HH:MM (00:00 a 23:59).' })
  runTime: string;

  @IsInt()
  @Min(MIN_RETENTION_DAYS)
  @Max(MAX_RETENTION_DAYS)
  retentionDays: number;
}

export class RestoreBackupDto {
  @IsString()
  @MinLength(1, { message: 'Informe sua senha.' })
  @MaxLength(200)
  password: string;

  @IsString()
  @MaxLength(50)
  confirmationWord: string;
}
