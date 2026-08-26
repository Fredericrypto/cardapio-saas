import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Receipt, MapPin, Wallet, Coins, Star, Bell, BellOff, LogOut, User } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { IconBadge } from '../components/IconBadge';
import { BottomNav } from '../components/BottomNav';

// Hub da conta do cliente — igual ao iFood: um cabeçalho com quem é a
// pessoa, e uma lista organizada de opções (cada uma sua própria tela),
// em vez de tudo empilhado numa página só. Pedidos, endereço e
// pagamento cada um é uma seção própria — aqui é só a porta de entrada.
export function CustomerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { customer, token, isLoading, logout } = useCustomerAuth();
  const push = usePushNotifications(tenant?.id, token);

  if (!tenant || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto pb-20">
        <p className="text-gray-500 text-sm">Você ainda não entrou na sua conta.</p>
        <button
          onClick={() => navigate(`/${slug}/conta-cliente/entrar`)}
          className="mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          Entrar
        </button>
        <BottomNav slug={slug!} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      <div className="bg-white px-6 pt-8 pb-6 flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0 overflow-hidden"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          {customer.avatarUrl ? (
            <img src={customer.avatarUrl} alt={customer.name} className="w-full h-full object-cover" />
          ) : (
            customer.name[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="font-display font-bold text-gray-900 truncate">{customer.name}</p>
          <p className="text-xs text-gray-500 truncate">{customer.email}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{tenant.name}</p>
        </div>
      </div>

      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl overflow-hidden">
          <MenuRow
            icon={User}
            iconBg="#EDE9FE"
            iconColor="#7C3AED"
            label="Meus dados"
            onClick={() => navigate(`/${slug}/conta-cliente/dados`)}
          />
          <MenuRow
            icon={Receipt}
            iconBg="#FEE2E2"
            iconColor="#DC2626"
            label="Meus pedidos"
            onClick={() => navigate(`/${slug}/conta-cliente/pedidos`)}
          />
          <MenuRow
            icon={MapPin}
            iconBg="#DBEAFE"
            iconColor="#2563EB"
            label="Endereço salvo"
            onClick={() => navigate(`/${slug}/conta-cliente/endereco`)}
          />
          <MenuRow
            icon={Wallet}
            iconBg="#DCFCE7"
            iconColor="#16A34A"
            label="Carteira Pix"
            onClick={() => navigate(`/${slug}/conta-cliente/carteira-pix`)}
          />
          <MenuRow
            icon={Coins}
            iconBg="#FEF3C7"
            iconColor="#D97706"
            label="Meu Cashback"
            onClick={() => navigate(`/${slug}/conta-cliente/cashback`)}
          />
          <MenuRow
            icon={Star}
            iconBg="#FEF3C7"
            iconColor="#F59E0B"
            label="Minhas Avaliações"
            onClick={() => navigate(`/${slug}/conta-cliente/avaliacoes`)}
          />
        </div>

        {push.isSupported && (
          <div className="bg-white rounded-2xl overflow-hidden mt-3">
            <div className="w-full flex items-center gap-3 px-4 py-3.5">
              <button
                onClick={() => navigate(`/${slug}/conta-cliente/notificacoes`)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <IconBadge
                  icon={push.isSubscribed ? Bell : BellOff}
                  backgroundColor={push.isSubscribed ? '#DCFCE7' : '#F3F4F6'}
                  iconColor={push.isSubscribed ? '#16A34A' : '#9CA3AF'}
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Notificações</p>
                  <p className="text-xs text-gray-400">
                    {push.permission === 'denied'
                      ? 'Bloqueadas nas configurações do navegador'
                      : push.isSubscribed
                        ? 'Ativadas — toque pra escolher quais tipos'
                        : 'Avise quando algo importante acontecer'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
              <button
                onClick={() => (push.isSubscribed ? push.unsubscribe() : push.subscribe())}
                disabled={push.isLoading || push.permission === 'denied'}
                className="w-10 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 disabled:opacity-40 ml-2"
                style={{ backgroundColor: push.isSubscribed ? tenant.primaryColor : '#E5E7EB' }}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    push.isSubscribed ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl overflow-hidden mt-3">
          <MenuRow
            icon={LogOut}
            iconBg="#FEE2E2"
            iconColor="#DC2626"
            label="Sair da conta"
            labelColor="#DC2626"
            onClick={logout}
          />
        </div>
      </div>

      <BottomNav slug={slug!} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
    </div>
  );
}

interface MenuRowProps {
  icon: typeof Receipt;
  iconBg: string;
  iconColor: string;
  label: string;
  labelColor?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function MenuRow({ icon, iconBg, iconColor, label, labelColor, onClick, disabled }: MenuRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-b-0 disabled:opacity-40"
    >
      <IconBadge icon={icon} backgroundColor={iconBg} iconColor={iconColor} size={40} />
      <span
        className="flex-1 text-left text-sm font-medium"
        style={{ color: labelColor ?? '#1F2937' }}
      >
        {label}
        {disabled && <span className="text-xs text-gray-400 font-normal"> · em breve</span>}
      </span>
      {!disabled && <ChevronRight size={18} className="text-gray-300" />}
    </button>
  );
}
