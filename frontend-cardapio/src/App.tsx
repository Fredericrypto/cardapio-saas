import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './contexts/CartContext';
import { MenuPage } from './pages/MenuPage';
import { LocationPickerPage } from './pages/LocationPickerPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { PromotionDetailPage } from './pages/PromotionDetailPage';
import { CartPage } from './pages/CartPage';
import { MyAccountPage } from './pages/MyAccountPage';
import { CustomerAuthPage } from './pages/CustomerAuthPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { OrdersHubPage } from './pages/OrdersHubPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { OrderReceiptMesaPage } from './pages/OrderReceiptMesaPage';
import { OrderReceiptAvulsoPage } from './pages/OrderReceiptAvulsoPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { SavedAddressPage } from './pages/SavedAddressPage';
import { CustomerPixWalletPage } from './pages/CustomerPixWalletPage';
import { CustomerCashbackPage } from './pages/CustomerCashbackPage';
import { MyReviewsPage } from './pages/MyReviewsPage';
import { PublicReviewsPage } from './pages/PublicReviewsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { RequireCustomerAuth } from './components/RequireCustomerAuth';
import { CustomerAppShell } from './components/CustomerAppShell';
import { TableSessionGate } from './components/TableSessionGate';

function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/:slug" element={<CustomerAppShell />}>
            {/* Fluxo de mesa (QR code físico na mesa) — mesmo MenuPage do
                fluxo geral, só com qrCodeToken presente na URL. Continua
                exigindo login: cardápio inteiro é área logada agora, ver
                RequireCustomerAuth. TableSessionGate vem DEPOIS do login
                de propósito — resolver "existe sessão ativa nessa mesa?"
                só faz sentido depois de saber quem está perguntando. */}
            <Route
              path="mesa/:qrCodeToken"
              element={
                <RequireCustomerAuth>
                  <TableSessionGate>
                    <MenuPage />
                  </TableSessionGate>
                </RequireCustomerAuth>
              }
            />
            <Route
              path="mesa/:qrCodeToken/conta"
              element={
                <RequireCustomerAuth>
                  <TableSessionGate>
                    <MyAccountPage />
                  </TableSessionGate>
                </RequireCustomerAuth>
              }
            />
            <Route
              path="mesa/:qrCodeToken/produto/:productId"
              element={
                <RequireCustomerAuth>
                  <TableSessionGate>
                    <ProductDetailPage />
                  </TableSessionGate>
                </RequireCustomerAuth>
              }
            />
            <Route
              path="mesa/:qrCodeToken/promocao/:promotionId"
              element={
                <RequireCustomerAuth>
                  <TableSessionGate>
                    <PromotionDetailPage />
                  </TableSessionGate>
                </RequireCustomerAuth>
              }
            />
            <Route
              path="mesa/:qrCodeToken/carrinho"
              element={
                <RequireCustomerAuth>
                  <TableSessionGate>
                    <CartPage />
                  </TableSessionGate>
                </RequireCustomerAuth>
              }
            />

            {/* Fluxo geral (sem mesa: retirada/entrega) */}
            <Route
              index
              element={
                <RequireCustomerAuth>
                  <MenuPage />
                </RequireCustomerAuth>
              }
            />
            <Route path="avaliacoes" element={<PublicReviewsPage />} />
            <Route
              path="escolher-loja"
              element={
                <RequireCustomerAuth>
                  <LocationPickerPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="produto/:productId"
              element={
                <RequireCustomerAuth>
                  <ProductDetailPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="promocao/:promotionId"
              element={
                <RequireCustomerAuth>
                  <PromotionDetailPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="carrinho"
              element={
                <RequireCustomerAuth>
                  <CartPage />
                </RequireCustomerAuth>
              }
            />

            {/* Conta do cliente final — SEMPRE dentro do restaurante
                (:slug). Cliente é por restaurante, não uma conta cruzando
                vários. A tela de entrar/criar conta é a ÚNICA rota que
                nunca exige login (senão ninguém conseguiria logar). */}
            <Route path="conta-cliente/entrar" element={<CustomerAuthPage />} />
            <Route
              path="conta-cliente/perfil"
              element={
                <RequireCustomerAuth>
                  <CustomerProfilePage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/pedidos"
              element={
                <RequireCustomerAuth>
                  <OrdersHubPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/pedidos/historico"
              element={
                <RequireCustomerAuth>
                  <OrderHistoryPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/pedidos/mesa/:sessionId"
              element={
                <RequireCustomerAuth>
                  <OrderReceiptMesaPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/pedidos/avulso/:orderId"
              element={
                <RequireCustomerAuth>
                  <OrderReceiptAvulsoPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/dados"
              element={
                <RequireCustomerAuth>
                  <EditProfilePage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/endereco"
              element={
                <RequireCustomerAuth>
                  <SavedAddressPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/carteira-pix"
              element={
                <RequireCustomerAuth>
                  <CustomerPixWalletPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/cashback"
              element={
                <RequireCustomerAuth>
                  <CustomerCashbackPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/avaliacoes"
              element={
                <RequireCustomerAuth>
                  <MyReviewsPage />
                </RequireCustomerAuth>
              }
            />
            <Route
              path="conta-cliente/notificacoes"
              element={
                <RequireCustomerAuth>
                  <NotificationsPage />
                </RequireCustomerAuth>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </CartProvider>
  );
}

export default App;
