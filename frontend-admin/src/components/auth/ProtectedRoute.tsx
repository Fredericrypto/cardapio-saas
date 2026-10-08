import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AccessDeniedView } from '../common/AccessDeniedView';

interface ProtectedRouteProps {
  children: ReactNode;
  // Omitido = basta estar autenticado. Várias = TODAS.
  permission?: string | readonly string[];
}

export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const { isAuthenticated, permissionsReady, hasPermission } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (permission === undefined) {
    return <>{children}</>;
  }
  if (!permissionsReady) {
    return (
      <div className="p-8 text-sm text-gray-400" role="status">
        Verificando acesso...
      </div>
    );
  }
  if (!hasPermission(permission)) {
    return <AccessDeniedView />;
  }
  return <>{children}</>;
}
