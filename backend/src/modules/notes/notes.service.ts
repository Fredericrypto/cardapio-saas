import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Note, NOTE_TAGS } from './note.entity';
import { CreateNoteDto, UpdateLayoutDto, UpdateNoteDto } from './dto/note.dto';
import { InternalNotificationsService } from '../internal-notifications/internal-notifications.service';
import type { Actor } from '../internal-notifications/internal-notifications.service';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note) private readonly repo: Repository<Note>,
    private readonly internal: InternalNotificationsService,
  ) {}

  meta() {
    return { tags: NOTE_TAGS };
  }

  // Fixadas primeiro; dentro de cada grupo vale a ordem salva (sortOrder) e, em
  // empate, as mais recentes.
  list(tenantId: string): Promise<Note[]> {
    return this.repo.find({ where: { tenantId }, order: { isPinned: 'DESC', sortOrder: 'ASC', createdAt: 'DESC' } });
  }

  // Nota nova entra no INÍCIO do grupo (solta) ou no FIM das fixadas.
  private async nextSortOrder(tenantId: string, pinned: boolean): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('n')
      .select(pinned ? 'MAX(n.sortOrder)' : 'MIN(n.sortOrder)', 'v')
      .where('n.tenantId = :tenantId AND n.isPinned = :pinned', { tenantId, pinned })
      .getRawOne<{ v: number | string | null }>();
    if (row?.v == null) return 0;
    return pinned ? Number(row.v) + 1 : Number(row.v) - 1;
  }

  async create(user: RequestAdminUser, dto: CreateNoteDto): Promise<Note> {
    const actor = await this.internal.resolveActor(user);
    // Sem posição informada, cada nota nova entra levemente deslocada da anterior.
    const count = await this.repo.count({ where: { tenantId: user.tenantId } });
    const note = await this.repo.save(
      this.repo.create({
        tenantId: user.tenantId,
        content: dto.content ?? '',
        ...(dto.color && { color: dto.color }),
        ...(dto.textColor && { textColor: dto.textColor }),
        tag: dto.tag ?? 'Geral',
        ...(dto.width && { width: dto.width }),
        ...(dto.height && { height: dto.height }),
        posX: dto.posX ?? 24 + (count % 10) * 32,
        posY: dto.posY ?? 24 + (count % 10) * 32,
        isPinned: dto.isPinned ?? false,
        sortOrder: await this.nextSortOrder(user.tenantId, dto.isPinned ?? false),
        isMinimized: dto.isMinimized ?? false,
        authorUserId: user.userId,
        authorName: actor.name,
        lastEditedByName: null,
      }),
    );
    void this.internal.notifyNoteEvent({ tenantId: user.tenantId, type: 'note_created', noteId: note.id, tag: note.tag, actor });
    return note;
  }

  async update(user: RequestAdminUser, id: string, dto: UpdateNoteDto): Promise<Note> {
    const note = await this.findOne(user.tenantId, id);
    // EDIÇÃO = texto, cores ou tag. Arrastar, redimensionar, fixar e minimizar
    // são "layout" e não geram alerta nem mexem em autoria/data de edição.
    const contentChanged =
      (dto.content !== undefined && dto.content !== note.content) ||
      (dto.color !== undefined && dto.color !== note.color) ||
      (dto.textColor !== undefined && dto.textColor !== note.textColor) ||
      (dto.tag !== undefined && dto.tag !== note.tag);

    for (const key of ['content', 'color', 'textColor', 'tag', 'width', 'height', 'posX', 'posY', 'isPinned', 'isMinimized'] as const) {
      if (dto[key] !== undefined) (note as unknown as Record<string, unknown>)[key] = dto[key];
    }

    let actor: Actor | null = null;
    if (contentChanged) {
      actor = await this.internal.resolveActor(user);
      note.lastEditedByName = actor.name;
      note.contentUpdatedAt = new Date();
    }
    const saved = await this.repo.save(note);
    if (contentChanged && actor) {
      void this.internal.notifyNoteEvent({ tenantId: user.tenantId, type: 'note_updated', noteId: saved.id, tag: saved.tag, actor });
    }
    return saved;
  }

  async updateLayout(tenantId: string, dto: UpdateLayoutDto): Promise<{ updated: number }> {
    const ids = dto.items.map((i) => i.id);
    if (ids.length === 0) return { updated: 0 };
    const notes = await this.repo.find({ where: { tenantId, id: In(ids) } });
    const byId = new Map(notes.map((n) => [n.id, n]));
    for (const item of dto.items) {
      const note = byId.get(item.id);
      if (!note) continue; // de outro restaurante ou já excluída: ignora
      if (item.posX !== undefined) note.posX = item.posX;
      if (item.posY !== undefined) note.posY = item.posY;
      if (item.width) note.width = item.width;
      if (item.height) note.height = item.height;
      if (item.isPinned !== undefined) note.isPinned = item.isPinned;
      if (item.sortOrder !== undefined) note.sortOrder = item.sortOrder;
    }
    await this.repo.save([...byId.values()]);
    return { updated: byId.size };
  }

  async remove(user: RequestAdminUser, id: string): Promise<void> {
    const note = await this.findOne(user.tenantId, id);
    const actor = await this.internal.resolveActor(user);
    await this.repo.remove(note);
    void this.internal.notifyNoteEvent({ tenantId: user.tenantId, type: 'note_deleted', noteId: id, tag: note.tag, actor });
  }

  private async findOne(tenantId: string, id: string): Promise<Note> {
    const note = await this.repo.findOne({ where: { id, tenantId } });
    if (!note) throw new NotFoundException('Anotação não encontrada.');
    return note;
  }
}
