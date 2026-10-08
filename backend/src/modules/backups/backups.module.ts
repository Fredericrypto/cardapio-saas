import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../auth/admin-user.entity';
import { BackupAuditLog } from './backup-audit-log.entity';
import { BackupAuditService } from './backup-audit.service';
import { BACKUP_STORAGE, createBackupStorage } from './backup-storage';
import { BackupsController } from './backups.controller';
import { BackupsScheduler } from './backups.scheduler';
import { BackupsService } from './backups.service';
import { OwnerOnlyGuard } from './owner-only.guard';
import { TenantBackup } from './tenant-backup.entity';
import { TenantBackupSettings } from './tenant-backup-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TenantBackup, TenantBackupSettings, BackupAuditLog, AdminUser])],
  controllers: [BackupsController],
  providers: [
    BackupsService,
    BackupsScheduler,
    BackupAuditService,
    OwnerOnlyGuard,
    {
      provide: BACKUP_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBackupStorage(config),
    },
  ],
})
export class BackupsModule {}
