import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './note.entity';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { InternalNotificationsModule } from '../internal-notifications/internal-notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Note]), InternalNotificationsModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
