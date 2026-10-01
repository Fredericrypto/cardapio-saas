import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { TableSession } from './table-session.entity';
import { Customer } from '../customers/customer.entity';

// Pedido do Felipe (14/09, sessão I): quem entra numa mesa (escaneia e
// confirma "sim, continuar nessa mesa") deve aparecer no painel do admin
// NA HORA — não só depois de fazer o primeiro pedido, como era antes
// (a lista de "quem está na mesa" era montada só a partir dos PEDIDOS).
// 30/09: agora também guarda convidados (assento sem conta). Essa
// tabela é a fonte de verdade de "quem está presente" agora,
// independente de pedido. Uma linha por (sessão, cliente); `leftAt` nulo
// = ainda presente, preenchido = saiu (ver `leaveTable` no service) —
// soft, não apaga a linha, pra manter o histórico de quem passou pela
// mesa mesmo depois de sair.
@Entity('table_session_participants')
@Unique(['tableSessionId', 'customerId'])
export class TableSessionParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'table_session_id' })
  tableSessionId: string;

  @ManyToOne(() => TableSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'table_session_id' })
  tableSession: TableSession;

  // Nulo = assento de CONVIDADO (sem conta). Um convidado que faz
  // login no meio da visita tem o assento vinculado ao cliente
  // (ver TablesService.assertActiveSeat).
  @Index()
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  // Credencial secreta do assento (256 bits). Só o servidor decide se
  // ela ainda vale: `leftAt` preenchido = assento morto pra sempre, e
  // nenhuma ação do navegador (refresh, voltar, limpar cache) o revive.
  @Column({ name: 'seat_token', type: 'varchar', length: 64 })
  seatToken: string;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;
}
