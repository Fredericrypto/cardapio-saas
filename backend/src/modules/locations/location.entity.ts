import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

// Uma filial física de um restaurante (Tenant = marca; Location = loja
// física). Mesma lógica do McDonald's: a marca é uma só (nome, logo,
// cores, credenciais de pagamento continuam no Tenant), mas cada loja
// tem seu próprio endereço, horário, raio de entrega e mesas. Um Tenant
// com uma loja só (o caso comum) tem exatamente UMA Location — nada
// muda pra ele na prática, é só uma camada a mais.
@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Ex: "Unidade Centro", "Shopping Praia" — como aparece pro cliente
  // escolher qual loja, e pro admin no seletor de loja no painel.
  @Column({ length: 150 })
  name: string;

  @Column({ name: 'whatsapp_number', type: 'varchar', length: 20, nullable: true })
  whatsappNumber: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  latitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  longitude: number | null;

  @Column({ name: 'is_open', default: true })
  isOpen: boolean;

  @Column({ name: 'opening_hours', type: 'jsonb', nullable: true })
  openingHours: Record<string, string> | null;

  @Column({ name: 'delivery_fee', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  deliveryFee: number;

  @Column({ name: 'delivery_fee_per_km', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  deliveryFeePerKm: number;

  @Column({ name: 'delivery_max_radius_km', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  deliveryMaxRadiusKm: number | null;

  @Column({ name: 'min_order_value', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  minOrderValue: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
