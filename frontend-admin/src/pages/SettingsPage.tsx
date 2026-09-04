import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { updateMyTenant, uploadTenantLogo, uploadTenantCoverImage } from '../lib/admin-api';
import { useAuth } from '../contexts/AuthContext';

// Configurações da MARCA (nome, cores, Instagram, Pix, Mercado Pago) —
// endereço, horário, entrega e WhatsApp agora são por LOJA (ver
// LocationsSettingsPage), porque um restaurante pode ter mais de uma
// filial física, cada uma com esses dados próprios.
export function SettingsPage() {
  const { tenant, updateTenant } = useAuth();
  const [name, setName] = useState(tenant?.name ?? '');
  const [instagramHandle, setInstagramHandle] = useState(tenant?.instagramHandle ?? '');
  const [primaryColor, setPrimaryColor] = useState(tenant?.primaryColor ?? '#E63946');
  const [secondaryColor, setSecondaryColor] = useState(tenant?.secondaryColor ?? '#1D3557');
  const [pixKeyType, setPixKeyType] = useState(tenant?.pixKeyType ?? '');
  const [pixKey, setPixKey] = useState(tenant?.pixKey ?? '');
  const [pixMerchantCity, setPixMerchantCity] = useState(tenant?.pixMerchantCity ?? '');
  const [pixEnabled, setPixEnabled] = useState(tenant?.pixEnabled ?? false);
  const [mercadoPagoAccessToken, setMercadoPagoAccessToken] = useState('');
  const [showMercadoPagoField, setShowMercadoPagoField] = useState(!tenant?.mercadoPagoConfigured);
  const [mercadoPagoWebhookSecret, setMercadoPagoWebhookSecret] = useState('');
  const [showWebhookSecretField, setShowWebhookSecretField] = useState(
    !tenant?.mercadoPagoWebhookSecretConfigured,
  );
  const [tableSessionTimeoutMinutes, setTableSessionTimeoutMinutes] = useState<number | null>(
    tenant?.tableSessionTimeoutMinutes ?? null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedRef.current || !tenant) return;
    hasHydratedRef.current = true;
    setName(tenant.name ?? '');
    setInstagramHandle(tenant.instagramHandle ?? '');
    setPrimaryColor(tenant.primaryColor ?? '#E63946');
    setSecondaryColor(tenant.secondaryColor ?? '#1D3557');
    setPixKeyType(tenant.pixKeyType ?? '');
    setPixKey(tenant.pixKey ?? '');
    setPixMerchantCity(tenant.pixMerchantCity ?? '');
    setPixEnabled(tenant.pixEnabled ?? false);
  }, [tenant]);

  // Upload imediato, ao contrário do banner de promoção (que espera a
  // promoção ser criada primeiro) — o tenant sempre já existe, então
  // não tem "criar primeiro".
  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploadingLogo(true);
    try {
      const updated = await uploadTenantLogo(file);
      updateTenant(updated);
    } catch {
      setUploadError('Não foi possível enviar a logo. Tenta de novo.');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploadingCover(true);
    try {
      const updated = await uploadTenantCoverImage(file);
      updateTenant(updated);
    } catch {
      setUploadError('Não foi possível enviar o banner. Tenta de novo.');
    } finally {
      setIsUploadingCover(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const updated = await updateMyTenant({
        name,
        instagramHandle: instagramHandle || undefined,
        primaryColor,
        secondaryColor,
        pixKeyType: pixKeyType || undefined,
        pixKey: pixKey || undefined,
        pixMerchantCity: pixMerchantCity || undefined,
        pixEnabled,
        mercadoPagoAccessToken: mercadoPagoAccessToken.trim() || undefined,
        mercadoPagoWebhookSecret: mercadoPagoWebhookSecret.trim() || undefined,
        tableSessionTimeoutMinutes,
      });
      setMercadoPagoAccessToken('');
      setShowMercadoPagoField(!updated.mercadoPagoConfigured);
      setMercadoPagoWebhookSecret('');
      setShowWebhookSecretField(!updated.mercadoPagoWebhookSecretConfigured);
      updateTenant(updated);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-6">
        Configurações
      </h1>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">
            Banner do cardápio (foto de capa)
          </label>
          <button
            type="button"
            disabled={isUploadingCover}
            onClick={() => coverInputRef.current?.click()}
            className="w-full h-28 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden disabled:opacity-50"
          >
            {tenant?.coverImageUrl ? (
              <img src={tenant.coverImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-400 text-xs flex flex-col items-center gap-1">
                <ImagePlus size={20} />
                {isUploadingCover ? 'Enviando...' : 'Escolher foto de capa'}
              </span>
            )}
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleCoverChange}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Aparece grande no topo do cardápio, atrás da logo. Sem foto, usa um degradê com as
            cores da marca.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">
            Logo do restaurante
          </label>
          <button
            type="button"
            disabled={isUploadingLogo}
            onClick={() => logoInputRef.current?.click()}
            className="w-20 h-20 rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden disabled:opacity-50"
          >
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-400 text-[10px] flex flex-col items-center gap-1 px-1 text-center">
                <ImagePlus size={16} />
                {isUploadingLogo ? 'Enviando...' : 'Escolher'}
              </span>
            )}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleLogoChange}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Sem logo, usa a inicial do nome do restaurante com a cor principal.
          </p>
        </div>

        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

        <Field label="Nome do estabelecimento">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>

        <Field label="Instagram">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <span className="pl-3 text-sm text-gray-400 select-none">instagram.com/</span>
            <input
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value.replace(/^@/, ''))}
              placeholder="seu.restaurante"
              className="flex-1 py-2.5 pr-3 text-sm outline-none min-w-0"
            />
          </div>
        </Field>

        <div className="flex gap-4">
          <Field label="Cor principal">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
              />
              <span className="text-xs text-gray-500">{primaryColor}</span>
            </div>
          </Field>

          <Field label="Cor secundária">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
              />
              <span className="text-xs text-gray-500">{secondaryColor}</span>
            </div>
          </Field>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">Chave Pix</p>
          <p className="text-xs text-gray-400 mb-3">
            Usada só pra gerar o QR code de cobrança — o pagamento cai direto na conta
            vinculada a essa chave. Nunca passa pela nossa infra.
          </p>

          <div className="flex gap-3">
            <Field label="Tipo de chave">
              <select
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
              >
                <option value="">Selecione</option>
                <option value="email">E-mail</option>
                <option value="telefone">Celular</option>
                <option value="cpf">CPF</option>
                <option value="aleatoria">Chave aleatória</option>
              </select>
            </Field>

            <Field label="Chave Pix">
              <input
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="Ex: contato@restaurante.com"
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Cidade (exigida pelo padrão do QR Pix)">
              <input
                value={pixMerchantCity}
                onChange={(e) => setPixMerchantCity(e.target.value)}
                placeholder="Ex: ARARANGUA"
                maxLength={15}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 mt-4 bg-gray-50 rounded-lg p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pixEnabled}
              onChange={(e) => setPixEnabled(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-gray-600">
              <span className="font-semibold text-gray-900 block mb-0.5">
                Exigir Pix confirmado antes de aceitar o pedido (balcão/entrega)
              </span>
              Com isso ligado, quando o cliente escolher Pix no carrinho, o pedido só
              entra na cozinha depois que você clicar em "Confirmar pagamento recebido"
              no Painel. Sem isso, Pix continua só uma preferência informada pelo
              cliente — o pagamento é combinado em pessoa, como já era.
            </span>
          </label>

          <div className="border-t border-gray-100 pt-4 mt-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">
              Mercado Pago (Pix confirmado automaticamente)
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Quando configurado, tem prioridade sobre a chave Pix acima: o pagamento é
              confirmado sozinho (igual iFood), sem você precisar clicar em nada. O
              dinheiro cai direto na sua conta Mercado Pago — nunca passa pela nossa
              infra.
            </p>

            {tenant?.mercadoPagoConfigured && !showMercadoPagoField ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
                <span className="text-xs font-semibold text-green-700">
                  ✓ Access Token configurado
                </span>
                <button
                  onClick={() => setShowMercadoPagoField(true)}
                  className="text-xs font-semibold text-gray-500 underline"
                >
                  Substituir
                </button>
              </div>
            ) : (
              <input
                type="password"
                value={mercadoPagoAccessToken}
                onChange={(e) => setMercadoPagoAccessToken(e.target.value)}
                placeholder="Cole aqui o Access Token (TEST-... ou APP_USR-...)"
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
              />
            )}

            {/* Sem isso configurado, todo webhook de pagamento chega SEM
                verificação de assinatura — o backend agora recusa
                confirmar pagamento nesse caso (correção de segurança:
                antes aceitava sem assinatura, o que deixava a porta
                aberta pra qualquer POST forjado nessa URL). Só
                aparece depois que o Access Token já foi configurado —
                não faz sentido pedir antes. */}
            {tenant?.mercadoPagoConfigured && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">
                  Segredo do webhook (Assinatura secreta)
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  No painel do Mercado Pago: Suas integrações → sua aplicação → Webhooks →
                  Assinatura secreta. Sem isso, a confirmação automática de pagamento fica
                  bloqueada por segurança.
                </p>
                {tenant?.mercadoPagoWebhookSecretConfigured && !showWebhookSecretField ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
                    <span className="text-xs font-semibold text-green-700">✓ Configurado</span>
                    <button
                      onClick={() => setShowWebhookSecretField(true)}
                      className="text-xs font-semibold text-gray-500 underline"
                    >
                      Substituir
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="password"
                      value={mercadoPagoWebhookSecret}
                      onChange={(e) => setMercadoPagoWebhookSecret(e.target.value)}
                      placeholder="Cole aqui a assinatura secreta do webhook"
                      className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
                    />
                    {!tenant?.mercadoPagoWebhookSecretConfigured && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 mt-2">
                        Ainda não configurado — pagamentos via Mercado Pago não confirmam
                        sozinhos até isso ser preenchido.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Prazo pra fazer o primeiro pedido depois de escanear o QR da
            mesa — passou do prazo sem NENHUM pedido, a sessão expira
            sozinha (o cliente precisa escanear de novo). Um único pedido
            já cancela o prazo pra sempre naquela sessão específica. */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 flex flex-col gap-3">
          <p className="text-sm font-bold text-gray-900">Prazo pra pedir na mesa</p>
          <p className="text-xs text-gray-400">
            Se o cliente escanear o QR e não fizer nenhum pedido dentro desse tempo, a mesa
            libera sozinha e ele precisa escanear de novo. Depois do primeiro pedido, esse
            prazo deixa de valer.
          </p>
          <select
            value={tableSessionTimeoutMinutes ?? ''}
            onChange={(e) =>
              setTableSessionTimeoutMinutes(e.target.value ? Number(e.target.value) : null)
            }
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full bg-white"
          >
            <option value="">Desativado (nunca expira sozinho)</option>
            <option value="10">10 minutos</option>
            <option value="15">15 minutos</option>
            <option value="30">30 minutos</option>
            <option value="60">1 hora</option>
            <option value="120">2 horas</option>
          </select>
        </div>

        {savedMessage && (
          <p className="text-xs text-green-600 font-semibold">
            Salvo com sucesso!
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-gray-900 text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
        >
          {isSaving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}
