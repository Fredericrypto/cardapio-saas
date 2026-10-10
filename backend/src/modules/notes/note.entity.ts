import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

// Setores/tags das anotações. Para criar uma nova, basta incluir aqui (o
// backend valida por esta lista e o painel lê de GET /notes/meta).
export const NOTE_TAGS = ['Geral', 'Cozinha', 'Caixa', 'Urgente'] as const;
export type NoteTag = (typeof NOTE_TAGS)[number];

// Mural de anotações da EQUIPE (painel admin). Nunca aparece para clientes.
// Só some quando alguém exclui manualmente — não há expiração nem limpeza.
@Entity('notes')
@Index(['tenantId', 'createdAt'])
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Texto em markdown simples (**negrito**, _itálico_, __sublinhado__,
  // "- item", "- [ ] tarefa", "- [x] feita"). É renderizado pelo painel sem
  // HTML — nada do que a equipe digita vira código executável.
  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'varchar', length: 9, default: '#FEF08A' })
  color: string;

  @Column({ name: 'text_color', type: 'varchar', length: 9, default: '#422006' })
  textColor: string;

  @Column({ type: 'int', default: 260 })
  width: number;

  @Column({ type: 'int', default: 220 })
  height: number;

  @Column({ name: 'pos_x', type: 'int', default: 24 })
  posX: number;

  @Column({ name: 'pos_y', type: 'int', default: 24 })
  posY: number;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  // Ordem de exibição (menor = primeiro), dentro do grupo fixadas / soltas.
  // Define a sequência no modo Cards e a ordem dos slots "Pin 1, Pin 2..." no
  // quadro. Sempre persistida pelo painel; o banco só garante o padrão 0.
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_minimized', type: 'boolean', default: false })
  isMinimized: boolean;

  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId: string | null;

  @Column({ name: 'author_name', type: 'varchar', length: 150 })
  authorName: string;

  // Quem fez a última edição de CONTEÚDO (texto, cores ou tag). Arrastar,
  // redimensionar, fixar e minimizar não contam como edição.
  @Column({ name: 'last_edited_by_name', type: 'varchar', length: 150, nullable: true })
  lastEditedByName: string | null;

  @Column({ type: 'varchar', length: 20, default: 'Geral' })
  tag: string;

  // Data/hora da última edição de CONTEÚDO (o `updatedAt` muda até ao arrastar).
  @Column({ name: 'content_updated_at', type: 'timestamptz', default: () => 'now()' })
  contentUpdatedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
