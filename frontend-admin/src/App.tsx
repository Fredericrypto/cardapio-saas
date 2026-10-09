import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AccessDeniedView } from './components/common/AccessDeniedView';
import { RoleManagementPage } from './pages/RoleManagementPage';
import { firstAllowedPath, permissionForPath } from './config/sidebarConfig';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MenuManagementPage } from './pages/MenuManagementPage';
import { TablesPage } from './pages/TablesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ManagerCalculatorPage } from './pages/ManagerCalculatorPage';
import { NotesPage } from './pages/NotesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { LocationsSettingsPage } from './pages/LocationsSettingsPage';
import { PromotionsSettingsPage } from './pages/PromotionsSettingsPage';
import { LoyaltySettingsPage } from './pages/LoyaltySettingsPage';
import { CashbackSettingsPage } from './pages/CashbackSettingsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { VerifyReceiptPage } from './pages/VerifyReceiptPage';
import { VerificationsPage } from './pages/VerificationsPage';

// Protege a página com a permissão declarada em config/sidebarConfig.ts
// (fonte única do menu e das rotas).
function guarded(path: string, page: ReactElement) {
  return <ProtectedRoute permission={permissionForPath(path)}>{page}</ProtectedRoute>;
}

// "/" é o Painel; quem não tem acesso a ele cai direto na primeira aba permitida
// (em vez de ver "acesso negado" logo depois de entrar).
function HomeGate() {
  const { hasPermission, permissionsReady } = useAuth();
  if (!permissionsReady) return null;
  const required = permissionForPath('/');
  if (!required || hasPermission(required)) return <DashboardPage />;
  return <Navigate to={firstAllowedPath((p) => hasPermission(p))} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomeGate />} />
            <Route path="/cardapio" element={guarded('/cardapio', <MenuManagementPage />)} />
            <Route path="/mesas" element={guarded('/mesas', <TablesPage />)} />
            <Route path="/lojas" element={guarded('/lojas', <LocationsSettingsPage />)} />
            <Route path="/promocoes" element={guarded('/promocoes', <PromotionsSettingsPage />)} />
            <Route path="/fidelidade" element={guarded('/fidelidade', <LoyaltySettingsPage />)} />
            <Route path="/cashback" element={guarded('/cashback', <CashbackSettingsPage />)} />
            <Route path="/avaliacoes" element={guarded('/avaliacoes', <ReviewsPage />)} />
            <Route path="/analise" element={guarded('/analise', <AnalyticsPage />)} />
            <Route path="/calculadora" element={guarded('/calculadora', <ManagerCalculatorPage />)} />
            <Route path="/anotacoes" element={guarded('/anotacoes', <NotesPage />)} />
            <Route path="/notificacoes" element={guarded('/notificacoes', <NotificationsPage />)} />
            <Route path="/historico" element={guarded('/historico', <HistoryPage />)} />
            <Route path="/verificar-cupom" element={guarded('/verificar-cupom', <VerifyReceiptPage />)} />
            <Route path="/verificacoes" element={guarded('/verificacoes', <VerificationsPage />)} />
            <Route path="/cargos" element={guarded('/cargos', <RoleManagementPage />)} />
            <Route path="/configuracoes" element={guarded('/configuracoes', <SettingsPage />)} />
            <Route path="/acesso-negado" element={<AccessDeniedView />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
