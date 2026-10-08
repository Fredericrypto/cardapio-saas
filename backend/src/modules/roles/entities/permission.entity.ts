import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Catálogo GLOBAL de permissões (não pertence a um estabelecimento).
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 80 })
  slug: string;

  @Column({ length: 120 })
  name: string;

  @Index()
  @Column({ length: 60 })
  module: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  description: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
