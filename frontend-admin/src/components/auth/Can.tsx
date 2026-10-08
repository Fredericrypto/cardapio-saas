import type { ReactNode } from 'react';
import { usePermission } from '../../hooks/usePermission';

interface CanProps {
  perform: string | readonly string[]; // várias = TODAS
  children: ReactNode;
  fallback?: ReactNode;
}

// Esconde/mostra um trecho da UI conforme a permissão. Só estética: a rota do
// backend correspondente continua protegida por @RequirePermission.
//   <Can perform="menu:manage"><button>Excluir produto</button></Can>
export function Can({ perform, children, fallback = null }: CanProps) {
  return <>{usePermission(perform) ? children : fallback}</>;
}
