import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { InternalNotificationsService } from './internal-notifications.service';
import {
  SubscribeInternalPushDto,
  UnsubscribeInternalPushDto,
  UpdateInternalPreferencesDto,
} from './dto/internal-notification.dto';

// Notificações INTERNAS da equipe — só JwtAuthGuard (admin). Não existe rota
// pública nem de cliente aqui. Rotas estáticas ficam antes das com ":id".
@Controller('internal-notifications')
@UseGuards(JwtAuthGuard)
export class InternalNotificationsController {
  constructor(private readonly service: InternalNotificationsService) {}

  @Get()
  list(
    @CurrentAdminUser() user: RequestAdminUser,
    @Query('limit') limit?: string,
    @Query('unread') unread?: string,
  ) {
    return this.service.list(user.tenantId, user, { limit: Number(limit) || undefined, unreadOnly: unread === 'true' });
  }

  @Get('unread-count')
  async unreadCount(@CurrentAdminUser() user: RequestAdminUser) {
    return { unreadCount: await this.service.unreadCount(user.tenantId, user) };
  }

  @Patch('read-all')
  async readAll(@CurrentAdminUser() user: RequestAdminUser) {
    await this.service.markAllRead(user.tenantId, user);
    return { success: true };
  }

  @Get('preferences')
  preferences(@CurrentAdminUser() user: RequestAdminUser) {
    return this.service.getPreferences(user.tenantId);
  }

  @Patch('preferences')
  updatePreferences(@CurrentAdminUser() user: RequestAdminUser, @Body() dto: UpdateInternalPreferencesDto) {
    return this.service.setPreferences(user.tenantId, user, dto.target);
  }

  @Post('push/subscribe')
  async subscribe(@CurrentAdminUser() user: RequestAdminUser, @Body() dto: SubscribeInternalPushDto) {
    await this.service.subscribe(user.tenantId, user, dto);
    return { success: true };
  }

  @Delete('push/subscribe')
  async unsubscribe(@CurrentAdminUser() user: RequestAdminUser, @Body() dto: UnsubscribeInternalPushDto) {
    await this.service.unsubscribe(user.tenantId, user, dto.endpoint);
    return { success: true };
  }

  @Post('push/test')
  test(@CurrentAdminUser() user: RequestAdminUser) {
    return this.service.sendTest(user.tenantId, user);
  }

  @Post('push/status')
  async status(@CurrentAdminUser() user: RequestAdminUser, @Body() dto: UnsubscribeInternalPushDto) {
    return { subscribed: await this.service.isSubscribed(user.tenantId, user, dto.endpoint) };
  }

  @Patch(':id/read')
  async markRead(@CurrentAdminUser() user: RequestAdminUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.markRead(user.tenantId, user, id);
    return { success: true };
  }
}
