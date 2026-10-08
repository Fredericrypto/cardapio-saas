import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { Permission } from './permission.entity';

// Cargos são POR ESTABELECIMENTO (multi-tenant): um cargo de um restaurante
// jamais é visível nem atribuível em outro.
@Entity('roles')
@Unique('UQ_roles_tenant_slug', ['tenantId', 'slug'])
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 60 })
  name: string;

  @Column({ length: 80 })
  slug: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description: string | null;

  // Protege os cargos padrão (admin/manager/staff) contra exclusão.
  @Column({ name: 'is_system_default', default: false })
  isSystemDefault: boolean;

  @ManyToMany(() => Permission, { eager: false })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
