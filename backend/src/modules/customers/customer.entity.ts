import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { numericTransformer } from '../../common/utils/numeric-transformer';

// IMPORTANTE — isolamento de segurança:
// `customers` é uma tabela TOTALMENTE separada de `admin_users`. Não tem
// nenhuma relação, chave estrangeira, ou campo compartilhado entre elas.
// Um id de cliente e um id de admin nunca podem ser confundidos, e o
// login de cliente (CustomerAuthModule) nunca consulta essa tabela nem
// referencia AdminUser em lugar nenhum. Ver customer-jwt.strategy.ts pra
// entender a segunda camada de isolamento (assinatura JWT diferente).
//
// Cliente é POR RESTAURANTE (tenantId obrigatório), não global — decisão
// de produto: cada restaurante é uma ilha isolada (sem "central tipo
// iFood" cruzando dados entre eles). O mesmo e-mail pode ter uma conta
// diferente em cada restaurante — são negócios completamente
// independentes, então isso é o comportamento certo, não um bug.
@Entity('customers')
@Index(['tenantId', 'email'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  // 'masculino' | 'feminino' | 'outro' | 'prefiro_nao_dizer' | null —
  // validado no DTO (whitelist fechada), nunca texto livre.
  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  // Endereço salvo, verificado pela mesma API de geocodificação usada
  // pro estabelecimento (LocationIQ) — igual o iFood faz: uma vez
  // confirmado, o pedido de entrega usa isso automaticamente, sem
  // precisar redigitar nem recalcular na mão toda vez.
  @Column({ name: 'address_street', type: 'varchar', length: 200, nullable: true })
  addressStreet: string | null;

  @Column({ name: 'address_number', type: 'varchar', length: 20, nullable: true })
  addressNumber: string | null;

  @Column({ name: 'address_neighborhood', type: 'varchar', length: 120, nullable: true })
  addressNeighborhood: string | null;

  @Column({ name: 'address_city', type: 'varchar', length: 120, nullable: true })
  addressCity: string | null;

  @Column({ name: 'address_state', type: 'varchar', length: 2, nullable: true })
  addressState: string | null;

  @Column({ name: 'address_postcode', type: 'varchar', length: 12, nullable: true })
  addressPostcode: string | null;

  @Column({ name: 'address_reference_point', type: 'varchar', length: 200, nullable: true })
  addressReferencePoint: string | null;

  @Column({ name: 'address_formatted', type: 'text', nullable: true })
  addressFormatted: string | null;

  @Column({
    name: 'address_latitude',
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numericTransformer,
  })
  addressLatitude: number | null;

  @Column({
    name: 'address_longitude',
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numericTransformer,
  })
  addressLongitude: number | null;

  // Mesmo significado que em Order/Tenant: false = geocodificado, mas sem
  // confirmar o número exato do prédio — mostra aviso, não bloqueia.
  @Column({ name: 'address_precise', type: 'boolean', nullable: true })
  addressPrecise: boolean | null;

  // "Carteira Pix" do cliente — SÓ a chave pra ONDE o estabelecimento
  // manda dinheiro de volta (reembolso), nunca guardamos saldo aqui.
  // Não corre dinheiro nenhum através da nossa infra: é só um dado de
  // contato salvo, igual telefone/endereço.
  @Column({ name: 'pix_key_type', type: 'varchar', length: 20, nullable: true })
  pixKeyType: string | null; // email, telefone, cpf, aleatoria

  @Column({ name: 'pix_key', type: 'varchar', length: 150, nullable: true })
  pixKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
