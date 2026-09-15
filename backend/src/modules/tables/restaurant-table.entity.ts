import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';

@Entity('restaurant_tables')
export class RestaurantTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Toda mesa pertence a UMA loja física específica — é o que faz o
  // fluxo de QR code já saber automaticamente em qual filial o cliente
  // está, sem precisar perguntar nada (ver Location).
  @Index()
  @Column({ name: 'location_id' })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ type: 'varchar', length: 20 })
  number: string; // "Mesa 5", "Balcão 2", texto livre

  // Pedido do Felipe (13/09): mesa e balcão usam a MESMA infraestrutura de
  // sessão/QR/pedido — a única diferença é puramente visual/organizacional
  // no admin (agrupar separado, ícone diferente). Por isso um campo simples
  // aqui em vez de uma entidade nova ou fluxo separado. Default 'mesa'
  // pra todo cadastro antigo continuar exatamente como estava.
  @Column({ type: 'varchar', length: 10, default: 'mesa' })
  kind: 'mesa' | 'balcao';

  // Token opaco usado no QR code — nunca o id direto, pra não vazar UUIDs
  // sequenciais/previsíveis nem permitir adivinhar outras mesas.
  @Column({ name: 'qr_code_token', type: 'varchar', length: 64, unique: true })
  qrCodeToken: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
