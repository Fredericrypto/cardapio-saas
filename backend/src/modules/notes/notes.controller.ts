import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { NotesService } from './notes.service';
import { CreateNoteDto, UpdateLayoutDto, UpdateNoteDto } from './dto/note.dto';

// Mural de anotações da equipe — só admin autenticado, sempre no tenant do token.
@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get('meta')
  meta() {
    return this.notes.meta();
  }

  @Get()
  list(@CurrentAdminUser() user: RequestAdminUser) {
    return this.notes.list(user.tenantId);
  }

  @Post()
  create(@CurrentAdminUser() user: RequestAdminUser, @Body() dto: CreateNoteDto) {
    return this.notes.create(user, dto);
  }

  // Antes de ":id" para "layout" não ser lido como id.
  @Patch('layout')
  layout(@CurrentAdminUser() user: RequestAdminUser, @Body() dto: UpdateLayoutDto) {
    return this.notes.updateLayout(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentAdminUser() user: RequestAdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAdminUser() user: RequestAdminUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notes.remove(user, id);
  }
}
