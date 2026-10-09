import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

// "Lido" é POR USUÁRIO: quando o gerente lê, o alerta continua não lido para
// o dono. Por isso o `isRead` que a API devolve é calculado para quem pediu.
@Entity('internal_notification_reads')
export class InternalNotificationRead {
  @PrimaryColumn({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @CreateDateColumn({ name: 'read_at', type: 'timestamptz' })
  readAt: Date;

  // Exclusão manual INDIVIDUAL: o alerta é compartilhado pela equipe, então
  // "excluir" esconde só para quem excluiu (a linha já é desse usuário).
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
