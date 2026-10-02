import type { ReactNode } from 'react';
import type { SessionPerson } from '../types';

// Pessoas na mesa — mesmo padrão visual do painel do admin (avatar em
// círculo com anel, nome, selo "Abriu a mesa"), usado na Minha conta e no
// cupom final. Cada pessoa leva os PRÓPRIOS pedidos logo abaixo, pra
// ficar claro quem pediu o quê (decisão do Felipe, 01/10).
const AVATAR_COLORS = ['#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899'];

export function PersonAvatar({ person, size = 40 }: { person: SessionPerson; size?: number }) {
  const initial = person.name.trim().charAt(0).toUpperCase() || '?';
  const color = AVATAR_COLORS[person.name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <span
      className="rounded-full overflow-hidden ring-2 ring-white shadow-sm bg-gray-100 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span
          className="w-full h-full flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: person.isGuest ? '#9CA3AF' : color, fontSize: size * 0.4 }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}

export function PersonHeader({ person, compact = false }: { person: SessionPerson; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <PersonAvatar person={person} size={compact ? 28 : 40} />
      <div className="min-w-0">
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-900 truncate`}>
          {person.name}
          {person.isMe && <span className="ml-1.5 text-[10px] font-medium text-gray-400">(você)</span>}
        </p>
        {person.isOpener && (
          <p className="text-[10px] font-semibold text-gray-500">Abriu a mesa</p>
        )}
      </div>
    </div>
  );
}

export function PeopleOrders<T extends { id: string }>({
  people,
  orders,
  unassignedOrderIds,
  renderOrder,
  emptyLabel = 'Ainda não pediu nada',
  compact = false,
}: {
  people: SessionPerson[];
  orders: T[];
  unassignedOrderIds: string[];
  renderOrder: (order: T) => ReactNode;
  emptyLabel?: string;
  compact?: boolean;
}) {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const leftover = unassignedOrderIds.map((id) => byId.get(id)).filter((o): o is T => Boolean(o));
  return (
    <div className="flex flex-col gap-4">
      {people.map((person) => {
        const personOrders = person.orderIds.map((id) => byId.get(id)).filter((o): o is T => Boolean(o));
        return (
          <section key={person.id} className="flex flex-col gap-2">
            <PersonHeader person={person} compact={compact} />
            <div className={`flex flex-col gap-2 ${compact ? 'pl-2' : 'pl-3 border-l-2 border-gray-100 ml-5'}`}>
              {personOrders.length === 0 ? (
                <p className="text-xs text-gray-400">{emptyLabel}</p>
              ) : (
                personOrders.map((o) => <div key={o.id}>{renderOrder(o)}</div>)
              )}
            </div>
          </section>
        );
      })}
      {leftover.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-400">Outros pedidos</p>
          {leftover.map((o) => (
            <div key={o.id}>{renderOrder(o)}</div>
          ))}
        </section>
      )}
    </div>
  );
}
