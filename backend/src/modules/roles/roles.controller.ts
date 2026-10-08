import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AccessContext } from './access-context';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

// Pipe ESTRITO só nesta área: corpo com qualquer campo desconhecido (ex.: um
// "permissions"/"role"/"tenantId" injetado onde não deveria) é rejeitado com 400.
// (No resto do app o pipe global continua só com whitelist, para não quebrar
// clientes que enviam campos extras.)
const strictPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

// O tenant e o ator vêm SEMPRE do JWT (request.user montado no servidor).
// Rate limit próprio nas rotas de gestão de acesso (força bruta / abuso).
@Controller()
@UsePipes(strictPipe)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get('roles')
  @RequirePermission('roles:view')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@CurrentAdminUser() actor: AccessContext) {
    return this.service.list(actor);
  }

  @Get('permissions')
  @RequirePermission('roles:view')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  permissions(@CurrentAdminUser() actor: AccessContext) {
    return this.service.listPermissionsByModule(actor);
  }

  @Post('roles')
  @RequirePermission('roles:manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentAdminUser() actor: AccessContext, @Body() dto: CreateRoleDto) {
    return this.service.create(actor, dto);
  }

  @Put('roles/:id')
  @RequirePermission('roles:manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  update(
    @CurrentAdminUser() actor: AccessContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('roles:manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async remove(@CurrentAdminUser() actor: AccessContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(actor, id);
  }

  @Get('team')
  @RequirePermission('roles:view')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  team(@CurrentAdminUser() actor: AccessContext) {
    return this.service.listTeam(actor);
  }

  @Patch('team/:userId/role')
  @RequirePermission('roles:manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  assign(
    @CurrentAdminUser() actor: AccessContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.service.assignRole(actor, userId, dto.roleId);
  }
}
