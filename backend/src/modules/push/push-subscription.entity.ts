import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';

// Uma inscrição de push = um navegador/dispositivo específico que
// aceitou receber notificação (via Push API do navegador + Service
// Worker — não é push nativo de app, é Web Push, funciona em qualquer
// navegador moderno inclusive instalado como PWA). Um cliente pode ter
// várias (celular + notebook, por exemplo) — todas recebem.
//
// `endpoint` é o identificador único de verdade (URL do serviço de push
// do navegador — Chrome usa FCM, Firefox usa Mozilla, etc); `p256dh` e
// `auth` são as chaves de criptografia ponta-a-ponta exigidas pelo
// padrão Web Push (RFC 8291) pra ninguém além do nosso backend + o
// navegador do cliente conseguir ler o conteúdo da notificação.
@Entity('push_subscriptions')
@Index(['endpoint'], { unique: true })
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Index()
  @Column({ name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', length: 500 })
  endpoint: string;

  @Column({ type: 'varchar', length: 200 })
  p256dh: string;

  @Column({ type: 'varchar', length: 200 })
  auth: string;

  // Só informativo, pra eventualmente debugar "cliente reclama que não
  // recebeu, era Safari iOS" — nunca usado em nenhuma lógica.
  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
