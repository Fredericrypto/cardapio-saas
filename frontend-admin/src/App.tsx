import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MenuManagementPage } from './pages/MenuManagementPage';
import { TablesPage } from './pages/TablesPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { LocationsSettingsPage } from './pages/LocationsSettingsPage';
import { PromotionsSettingsPage } from './pages/PromotionsSettingsPage';
import { LoyaltySettingsPage } from './pages/LoyaltySettingsPage';
import { CashbackSettingsPage } from './pages/CashbackSettingsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { VerifyReceiptPage } from './pages/VerifyReceiptPage';

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
            <Route path="/" element={<DashboardPage />} />
            <Route path="/cardapio" element={<MenuManagementPage />} />
            <Route path="/mesas" element={<TablesPage />} />
            <Route path="/lojas" element={<LocationsSettingsPage />} />
            <Route path="/promocoes" element={<PromotionsSettingsPage />} />
            <Route path="/fidelidade" element={<LoyaltySettingsPage />} />
            <Route path="/cashback" element={<CashbackSettingsPage />} />
            <Route path="/avaliacoes" element={<ReviewsPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/verificar-cupom" element={<VerifyReceiptPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
