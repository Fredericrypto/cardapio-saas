import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../auth/admin-user.entity';
import { AccessControlService } from './access-control.service';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { PermissionsSyncService } from './permissions-sync.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, AdminUser])],
  controllers: [RolesController],
  providers: [RolesService, AccessControlService, PermissionsSyncService],
  exports: [RolesService, AccessControlService],
})
export class RolesModule {}
