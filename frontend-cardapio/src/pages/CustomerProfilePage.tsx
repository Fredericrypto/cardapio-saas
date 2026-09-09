import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Receipt, MapPin, Wallet, Coins, Star, Bell, BellOff, LogOut, User, BadgeCheck, Clock3 } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { IconBadge } from '../components/IconBadge';
import { BottomNav } from '../components/BottomNav';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { VerificationExplainerModal } from '../components/VerificationExplainerModal';
import { VerificationCameraCapture } from '../components/VerificationCameraCapture';
import { VerificationCongratsModal } from '../components/VerificationCongratsModal';
import { submitMyVerification, markVerificationCongratsSeen, fetchMyCustomerProfile } from '../lib/customer-api';

// Hub da conta do cliente — igual ao iFood: um cabeçalho com quem é a
// pessoa, e uma lista organizada de opções (cada uma sua própria tela),
// em vez de tudo empilhado numa página só. Pedidos, endereço e
// pagamento cada um é uma seção própria — aqui é só a porta de entrada.
export function CustomerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { customer, token, isLoading, logout, setCustomer } = useCustomerAuth();
  const push = usePushNotifications(tenant?.id, token);

  // Fluxo de verificação — explicação → câmera → envio. Cada etapa é
  // sua própria tela cheia (nunca as três juntas), fechando a anterior
  // antes de abrir a próxima.
  const [verificationStep, setVerificationStep] = useState<'explainer' | 'camera' | null>(null);
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  async function handleCapturePhoto(photoBlob: Blob) {
    if (!tenant || !token) return;
    setIsSubmittingVerification(true);
    setVerificationError(null);
    try {
      await submitMyVerification(tenant.id, token, photoBlob);
      setVerificationStep(null);
      // Recarrega o perfil pra pegar o novo `verificationStatus: 'pending'`
      // vindo do backend — nunca assume esse valor localmente aqui.
      const fresh = await fetchMyCustomerProfile(tenant.id, token);
      setCustomer(fresh);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setVerificationError(message ?? 'Não foi possível enviar sua foto agora. Tenta de novo.');
      setVerificationStep(null);
    } finally {
      setIsSubmittingVerification(false);
    }
  }

  async function handleCloseCongrats() {
    if (!tenant || !token || !customer) return;
    // Fecha na hora (não espera a resposta do servidor) — é só uma
    // marcação de "já vi", não precisa travar a UI por causa disso; se a
    // chamada falhar, o pior caso é o modal aparecer de novo na próxima
    // abertura, o que não é grave.
    setCustomer({ ...customer, verificationCongratsPending: false });
    markVerificationCongratsSeen(tenant.id, token).catch(() => {});
  }

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
        <div className="relative shrink-0">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold overflow-hidden"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {customer.avatarUrl ? (
              <img src={customer.avatarUrl} alt={customer.name} className="w-full h-full object-cover" />
            ) : (
              customer.name[0]?.toUpperCase()
            )}
          </div>
          {customer.isVerified && (
            <span className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white rounded-full">
              <VerifiedBadge size={18} />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-display font-bold text-gray-900 truncate">{customer.name}</p>
          </div>
          {/* "Cliente Verificado" por extenso só aparece aqui e no "Aí na
              Mesa" do admin, por decisão explícita do Felipe — em
              qualquer outro lugar do app é só o selinho, sem o texto. */}
          {customer.isVerified && <VerifiedBadge variant="inline" size={12} />}
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
          {/* Verificação — pedido explícito do Felipe: o botão SOME por
              completo (não reaparece de jeito nenhum) assim que
              `isVerified` vira true. Enquanto pendente, fica visível
              mas travado. Recusado volta a ficar ativo pra tentar de
              novo, mostrando o motivo. */}
          {!customer.isVerified && (
            <MenuRow
              icon={customer.verificationStatus === 'pending' ? Clock3 : BadgeCheck}
              iconBg={customer.verificationStatus === 'pending' ? '#FFF7ED' : '#EFF6FF'}
              iconColor={customer.verificationStatus === 'pending' ? '#F59E0B' : '#1D9BF0'}
              label={
                customer.verificationStatus === 'pending'
                  ? 'Verificação pendente'
                  : customer.verificationStatus === 'rejected'
                    ? 'Verificação recusada — tentar de novo'
                    : 'Verificar minha conta'
              }
              disabled={customer.verificationStatus === 'pending'}
              disabledSuffix={false}
              onClick={() => setVerificationStep('explainer')}
            />
          )}
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

        {customer.verificationStatus === 'rejected' && customer.verificationRejectionReason && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-3 mt-3">
            <p className="text-xs font-semibold text-red-700 mb-0.5">Sua verificação foi recusada</p>
            <p className="text-xs text-red-600">{customer.verificationRejectionReason}</p>
          </div>
        )}
        {verificationError && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-3 mt-3">
            <p className="text-xs text-red-600">{verificationError}</p>
          </div>
        )}

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

      {verificationStep === 'explainer' && (
        <VerificationExplainerModal
          primaryColor={tenant.primaryColor}
          onCancel={() => setVerificationStep(null)}
          onContinue={() => setVerificationStep('camera')}
        />
      )}
      {verificationStep === 'camera' && (
        <VerificationCameraCapture
          primaryColor={tenant.primaryColor}
          onCancel={() => setVerificationStep(null)}
          onCapture={handleCapturePhoto}
        />
      )}
      {isSubmittingVerification && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl px-6 py-5 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-600">Enviando sua foto...</p>
          </div>
        </div>
      )}
      {customer.verificationCongratsPending && (
        <VerificationCongratsModal primaryColor={tenant.primaryColor} onClose={handleCloseCongrats} />
      )}
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
  // Por padrão, `disabled` também cola "· em breve" no rótulo (usado
  // pelas linhas "isso ainda não existe"). A linha de verificação usa
  // `disabled` só pra travar o clique enquanto "pendente" — já tem seu
  // próprio texto, então não deve ganhar esse sufixo.
  disabledSuffix?: boolean;
}

function MenuRow({
  icon,
  iconBg,
  iconColor,
  label,
  labelColor,
  onClick,
  disabled,
  disabledSuffix = true,
}: MenuRowProps) {
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
        {disabled && disabledSuffix && <span className="text-xs text-gray-400 font-normal"> · em breve</span>}
      </span>
      {!disabled && <ChevronRight size={18} className="text-gray-300" />}
    </button>
  );
}
