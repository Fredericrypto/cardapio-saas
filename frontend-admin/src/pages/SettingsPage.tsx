import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Check,
  ChevronRight,
  CreditCard,
  ImagePlus,
  Palette,
  Share2,
  Store,
  TrendingUp,
} from 'lucide-react';
import { updateMyTenant, uploadTenantLogo, uploadTenantCoverImage } from '../lib/admin-api';
import { useAuth } from '../contexts/AuthContext';
import { NotificationPreferences } from '../components/notifications/NotificationPreferences';

// Configurações da MARCA, organizadas por contexto (sub-abas). Endereço,
// horário, entrega, WhatsApp e telefone são por LOJA (ver
// LocationsSettingsPage), porque um restaurante pode ter mais de uma filial
// física, cada uma com esses dados próprios — por isso aparecem aqui só como
// atalho, nunca como campo duplicado.
//
// Todos os campos continuam no MESMO estado e no MESMO "Salvar alterações"
// (o payload de updateMyTenant é idêntico ao da tela anterior): trocar de
// sub-aba nunca perde o que foi digitado.

// Percentual digitado → número entre 0 e 100 (vazio/inválido vira 0).
function clampPercent(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 100) / 100)) : 0;
}

type SectionId = 'visual' | 'contatos' | 'pagamentos' | 'financeiro' | 'atendimento' | 'notificacoes';

interface SectionDef {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  // Esta sub-aba tem campos que o botão "Salvar alterações" grava?
  savable: boolean;
}

const SECTIONS: readonly SectionDef[] = [
  { id: 'visual', label: 'Visual', icon: Palette, savable: true },
  { id: 'contatos', label: 'Redes sociais & contatos', icon: Share2, savable: true },
  { id: 'pagamentos', label: 'Pagamentos & pedidos', icon: CreditCard, savable: true },
  { id: 'financeiro', label: 'Análise & financeiro', icon: TrendingUp, savable: true },
  { id: 'atendimento', label: 'Funcionamento & notificações', icon: Store, savable: false },
  // Gerenciamento das notificações da equipe (antes era a engrenagem do sininho).
  { id: 'notificacoes', label: 'Configurações de Notificações', icon: Bell, savable: false },
];

const INPUT = 'border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full';

export function SettingsPage() {
  const { tenant, updateTenant, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('secao');
  const section: SectionDef = SECTIONS.find((s) => s.id === requested) ?? SECTIONS[0];

  const [name, setName] = useState(tenant?.name ?? '');
  const [instagramHandle, setInstagramHandle] = useState(tenant?.instagramHandle ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(tenant?.youtubeUrl ?? '');
  const [facebookUrl, setFacebookUrl] = useState(tenant?.facebookUrl ?? '');
  const [tiktokHandle, setTiktokHandle] = useState(tenant?.tiktokHandle ?? '');
  const [twitterHandle, setTwitterHandle] = useState(tenant?.twitterHandle ?? '');
  const [messengerUsername, setMessengerUsername] = useState(tenant?.messengerUsername ?? '');
  const [gmailAddress, setGmailAddress] = useState(tenant?.gmailAddress ?? '');
  const [primaryColor, setPrimaryColor] = useState(tenant?.primaryColor ?? '#3d3846');
  const [secondaryColor, setSecondaryColor] = useState(tenant?.secondaryColor ?? '#c0bfbc');
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
  const [defaultCmvPercent, setDefaultCmvPercent] = useState(String(tenant?.defaultCmvPercent ?? 30));
  const [cardFeePercent, setCardFeePercent] = useState(String(tenant?.cardFeePercent ?? 0));
  const [pixFeePercent, setPixFeePercent] = useState(String(tenant?.pixFeePercent ?? 0));
  const [taxPercent, setTaxPercent] = useState(String(tenant?.taxPercent ?? 0));
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

  // O formulário se hidrata a partir do tenant enquanto o usuário AINDA NÃO
  // mexeu em nada. Antes, só alguns campos eram hidratados e só uma vez: abrir
  // /configuracoes direto (recarregando a página) mostrava os parâmetros
  // financeiros e o prazo da mesa com os valores padrão e, ao salvar, gravava
  // esses padrões por cima dos reais. Agora todos os campos acompanham o tenant
  // até a primeira edição; depois disso o que foi digitado nunca é sobrescrito.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!tenant || dirtyRef.current) return;
    setName(tenant.name ?? '');
    setInstagramHandle(tenant.instagramHandle ?? '');
    setYoutubeUrl(tenant.youtubeUrl ?? '');
    setFacebookUrl(tenant.facebookUrl ?? '');
    setTiktokHandle(tenant.tiktokHandle ?? '');
    setTwitterHandle(tenant.twitterHandle ?? '');
    setMessengerUsername(tenant.messengerUsername ?? '');
    setGmailAddress(tenant.gmailAddress ?? '');
    setPrimaryColor(tenant.primaryColor ?? '#3d3846');
    setSecondaryColor(tenant.secondaryColor ?? '#c0bfbc');
    setPixKeyType(tenant.pixKeyType ?? '');
    setPixKey(tenant.pixKey ?? '');
    setPixMerchantCity(tenant.pixMerchantCity ?? '');
    setPixEnabled(tenant.pixEnabled ?? false);
    setShowMercadoPagoField(!tenant.mercadoPagoConfigured);
    setShowWebhookSecretField(!tenant.mercadoPagoWebhookSecretConfigured);
    setDefaultCmvPercent(String(tenant.defaultCmvPercent ?? 30));
    setCardFeePercent(String(tenant.cardFeePercent ?? 0));
    setPixFeePercent(String(tenant.pixFeePercent ?? 0));
    setTaxPercent(String(tenant.taxPercent ?? 0));
    setTableSessionTimeoutMinutes(tenant.tableSessionTimeoutMinutes ?? null);
  }, [tenant]);

  // Qualquer edição de campo (exceto escolher arquivo, que sobe na hora) marca
  // o formulário como "mexido". O onChange do React borbulha, então um único
  // handler no contêiner cobre todos os inputs/selects.
  function markDirty(e: FormEvent<HTMLDivElement>) {
    if ((e.target as HTMLInputElement).type === 'file') return;
    dirtyRef.current = true;
  }

  function selectSection(id: SectionId) {
    setSearchParams({ secao: id }, { replace: true });
  }

  // Upload imediato, ao contrário do banner de promoção (que espera a
  // promoção ser criada primeiro) — o tenant sempre já existe, então
  // não tem "criar primeiro".
  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
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

  async function handleCoverChange(e: ChangeEvent<HTMLInputElement>) {
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
        youtubeUrl: youtubeUrl || undefined,
        facebookUrl: facebookUrl || undefined,
        tiktokHandle: tiktokHandle || undefined,
        twitterHandle: twitterHandle || undefined,
        messengerUsername: messengerUsername || undefined,
        gmailAddress: gmailAddress || undefined,
        primaryColor,
        secondaryColor,
        pixKeyType: pixKeyType || undefined,
        pixKey: pixKey || undefined,
        pixMerchantCity: pixMerchantCity || undefined,
        pixEnabled,
        mercadoPagoAccessToken: mercadoPagoAccessToken.trim() || undefined,
        mercadoPagoWebhookSecret: mercadoPagoWebhookSecret.trim() || undefined,
        tableSessionTimeoutMinutes,
        defaultCmvPercent: clampPercent(defaultCmvPercent),
        cardFeePercent: clampPercent(cardFeePercent),
        pixFeePercent: clampPercent(pixFeePercent),
        taxPercent: clampPercent(taxPercent),
      });
      setMercadoPagoAccessToken('');
      setShowMercadoPagoField(!updated.mercadoPagoConfigured);
      setMercadoPagoWebhookSecret('');
      setShowWebhookSecretField(!updated.mercadoPagoWebhookSecretConfigured);
      // Salvo = o servidor é a verdade de novo: libera a hidratação.
      dirtyRef.current = false;
      updateTenant(updated);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto" onChange={markDirty}>
      <h1 className="font-display text-xl font-bold text-gray-900 mb-1">Configurações</h1>
      <p className="text-xs text-gray-400 mb-5">
        Tudo da sua marca num só lugar, separado por assunto. Um único botão salva todas as abas.
      </p>

      {/* Sub-abas: rolam na horizontal no celular, nunca quebram o layout. */}
      <div
        role="tablist"
        aria-label="Categorias de configuração"
        className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1"
      >
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = s.id === section.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`settings-panel-${s.id}`}
              onClick={() => selectSection(s.id)}
              className={`shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap border transition-colors ${
                active
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon size={16} strokeWidth={1.5} />
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        id={`settings-panel-${section.id}`}
        role="tabpanel"
        className="flex flex-col gap-4"
      >
        {section.id === 'visual' && (
          <>
            <Card title="Identidade" description="Como o restaurante aparece no cardápio do cliente.">
              <Field label="Nome do estabelecimento">
                <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
              </Field>
            </Card>

            <Card title="Logo e banner">
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
                  Sem logo, usa a inicial do nome do restaurante com a cor principal. Enviar uma
                  imagem já atualiza a logo na hora (não precisa salvar).
                </p>
              </div>

              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
            </Card>

            <Card title="Cores da marca">
              <div className="flex flex-wrap gap-6">
                <Field label="Cor principal" className="w-auto">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-gray-200"
                    />
                    <span className="text-xs text-gray-500">{primaryColor}</span>
                  </div>
                </Field>
                <Field label="Cor secundária" className="w-auto">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-gray-200"
                    />
                    <span className="text-xs text-gray-500">{secondaryColor}</span>
                  </div>
                </Field>
              </div>
            </Card>
          </>
        )}

        {section.id === 'contatos' && (
          <>
            {/* Redes sociais da MARCA — cada uma opcional: "escolher quais usar"
                é simplesmente preencher (ou deixar vazio) cada campo. */}
            <Card
              title="Redes sociais da marca"
              description="Aparecem como ícones no cardápio do cliente. Deixe em branco as que não usa."
            >
              <Field label="Instagram">
                <PrefixedInput
                  prefix="instagram.com/"
                  value={instagramHandle}
                  onChange={(v) => setInstagramHandle(v.replace(/^@/, ''))}
                  placeholder="seu.restaurante"
                />
              </Field>

              <Field label="Facebook (link da página)">
                <input
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="https://facebook.com/seu.restaurante"
                  className={INPUT}
                />
              </Field>

              <Field label="YouTube (link do canal)">
                <input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/@seu.restaurante"
                  className={INPUT}
                />
              </Field>

              <Field label="TikTok">
                <PrefixedInput
                  prefix="tiktok.com/@"
                  value={tiktokHandle}
                  onChange={(v) => setTiktokHandle(v.replace(/^@/, ''))}
                  placeholder="seu.restaurante"
                />
              </Field>

              <Field label="X (Twitter)">
                <PrefixedInput
                  prefix="x.com/"
                  value={twitterHandle}
                  onChange={(v) => setTwitterHandle(v.replace(/^@/, ''))}
                  placeholder="seu.restaurante"
                />
              </Field>

              <Field label="Messenger">
                <PrefixedInput
                  prefix="m.me/"
                  value={messengerUsername}
                  onChange={(v) => setMessengerUsername(v.replace(/^@/, ''))}
                  placeholder="seu.restaurante"
                />
              </Field>
            </Card>

            <Card title="E-mail de contato">
              <Field label="Gmail (e-mail de contato)">
                <input
                  type="email"
                  name="tenant-contact-gmail"
                  autoComplete="off"
                  value={gmailAddress}
                  onChange={(e) => setGmailAddress(e.target.value)}
                  placeholder="contato@seurestaurante.com"
                  className={INPUT}
                />
              </Field>
            </Card>

            {hasPermission('locations:view') && (
              <ShortcutCard
                to="/lojas"
                icon={Store}
                title="WhatsApp, telefone e atendimento"
                text="Cada loja tem o seu próprio WhatsApp, Telegram, telefone, endereço e horário de atendimento. Eles ficam na aba Lojas."
              />
            )}
          </>
        )}

        {section.id === 'pagamentos' && (
          <>
            <Card
              title="Chave Pix"
              description="Usada só pra gerar o QR code de cobrança — o pagamento cai direto na conta vinculada a essa chave. Nunca passa pela nossa infra."
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <Field label="Tipo de chave" className="sm:flex-1 min-w-0">
                  <select
                    value={pixKeyType}
                    onChange={(e) => setPixKeyType(e.target.value)}
                    className={INPUT}
                  >
                    <option value="">Selecione</option>
                    <option value="email">E-mail</option>
                    <option value="telefone">Celular</option>
                    <option value="cpf">CPF</option>
                    <option value="aleatoria">Chave aleatória</option>
                  </select>
                </Field>

                <Field label="Chave Pix" className="sm:flex-1 min-w-0">
                  <input
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Ex: contato@restaurante.com"
                    className={INPUT}
                  />
                </Field>
              </div>

              <Field label="Cidade (exigida pelo padrão do QR Pix)">
                <input
                  value={pixMerchantCity}
                  onChange={(e) => setPixMerchantCity(e.target.value)}
                  placeholder="Ex: ARARANGUA"
                  maxLength={15}
                  className={INPUT}
                />
              </Field>

              <label className="flex items-start gap-2.5 bg-gray-50 rounded-lg p-3">
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
                  Com isso ligado, quando o cliente escolher Pix no carrinho, o pedido só entra na
                  cozinha depois que você clicar em "Confirmar pagamento recebido" no Painel. Sem
                  isso, Pix continua só uma preferência informada pelo cliente — o pagamento é
                  combinado em pessoa, como já era.
                </span>
              </label>
            </Card>

            <Card
              title="Mercado Pago (Pix confirmado automaticamente)"
              description="Quando configurado, tem prioridade sobre a chave Pix acima: o pagamento é confirmado sozinho (igual iFood), sem você precisar clicar em nada. Vale pra balcão/entrega E pro fechamento de conta de mesa. O dinheiro cai direto na sua conta Mercado Pago — nunca passa pela nossa infra."
            >
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Access Token</p>
                {tenant?.mercadoPagoConfigured && !showMercadoPagoField ? (
                  <ConfiguredBadge
                    label="Access Token configurado"
                    onReplace={() => {
                      dirtyRef.current = true;
                      setShowMercadoPagoField(true);
                    }}
                  />
                ) : (
                  <input
                    type="password"
                    value={mercadoPagoAccessToken}
                    onChange={(e) => setMercadoPagoAccessToken(e.target.value)}
                    placeholder="Cole aqui o Access Token (TEST-... ou APP_USR-...)"
                    className={INPUT}
                  />
                )}
              </div>

              {/* Sem isso configurado, todo webhook de pagamento chega SEM
                  verificação de assinatura — o backend recusa confirmar
                  pagamento nesse caso (correção de segurança: antes aceitava
                  sem assinatura, o que deixava a porta aberta pra qualquer POST
                  forjado nessa URL). Só aparece depois que o Access Token já foi
                  configurado — não faz sentido pedir antes. */}
              {tenant?.mercadoPagoConfigured && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">
                    Segredo do webhook (Assinatura secreta)
                  </p>
                  <p className="text-xs text-gray-400 mb-2">
                    No painel do Mercado Pago: Suas integrações → sua aplicação → Webhooks →
                    Assinatura secreta. Sem isso, a confirmação automática de pagamento fica
                    bloqueada por segurança.
                  </p>
                  {tenant?.mercadoPagoWebhookSecretConfigured && !showWebhookSecretField ? (
                    <ConfiguredBadge
                      label="Configurado"
                      onReplace={() => {
                        dirtyRef.current = true;
                        setShowWebhookSecretField(true);
                      }}
                    />
                  ) : (
                    <>
                      <input
                        type="password"
                        value={mercadoPagoWebhookSecret}
                        onChange={(e) => setMercadoPagoWebhookSecret(e.target.value)}
                        placeholder="Cole aqui a assinatura secreta do webhook"
                        className={INPUT}
                      />
                      {!tenant?.mercadoPagoWebhookSecretConfigured && (
                        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 mt-2">
                          Ainda não configurado — pagamentos via Mercado Pago não confirmam sozinhos
                          até isso ser preenchido.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>

            {/* Prazo pra fazer o primeiro pedido depois de escanear o QR da
                mesa — passou do prazo sem NENHUM pedido, a sessão expira
                sozinha (o cliente precisa escanear de novo). Um único pedido
                já cancela o prazo pra sempre naquela sessão específica. */}
            <Card
              title="Prazo pra pedir na mesa"
              description="Se o cliente escanear o QR e não fizer nenhum pedido dentro desse tempo, a mesa libera sozinha e ele precisa escanear de novo. Depois do primeiro pedido, esse prazo deixa de valer."
            >
              <select
                value={tableSessionTimeoutMinutes ?? ''}
                onChange={(e) =>
                  setTableSessionTimeoutMinutes(e.target.value ? Number(e.target.value) : null)
                }
                className={`${INPUT} bg-white`}
              >
                <option value="">Desativado (nunca expira sozinho)</option>
                <option value="10">10 minutos</option>
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="120">2 horas</option>
              </select>
            </Card>
          </>
        )}

        {section.id === 'financeiro' && (
          <>
            {/* Parâmetros que a aba Análise usa nos cálculos financeiros. */}
            <Card
              title="Parâmetros financeiros (Análise)"
              description="O CMV estimado vale só para itens sem custo cadastrado (o custo real, quando existe, sempre vence). Taxas e imposto em 0% não são deduzidos da receita líquida."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    ['CMV estimado (%)', defaultCmvPercent, setDefaultCmvPercent],
                    ['Imposto médio (%)', taxPercent, setTaxPercent],
                    ['Taxa do cartão (%)', cardFeePercent, setCardFeePercent],
                    ['Taxa do Pix (%)', pixFeePercent, setPixFeePercent],
                  ] as Array<[string, string, (v: string) => void]>
                ).map(([label, value, set]) => (
                  <label key={label} className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
                    {label}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.01"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none font-normal text-gray-900"
                    />
                  </label>
                ))}
              </div>
            </Card>

            {hasPermission('analytics:view') && (
              <ShortcutCard
                to="/analise"
                icon={TrendingUp}
                title="Relatórios financeiros"
                text="DRE, CMV, matriz do cardápio, projeção e exportação (CSV/XLSX) ficam na aba Análise."
              />
            )}
          </>
        )}

        {section.id === 'atendimento' && (
          <Card
            title="Funcionamento e notificações"
            description="Estes itens têm página própria, porque cada um tem muitos campos. Aqui ficam só os atalhos."
          >
            <div className="flex flex-col gap-3">
              {hasPermission('locations:view') && (
                <ShortcutCard
                  to="/lojas"
                  icon={Store}
                  title="Lojas: horário, entrega e contatos"
                  text="Horário de funcionamento, abrir/fechar a loja, endereço, taxa de entrega, WhatsApp, Telegram e telefone — por loja."
                />
              )}
              <ShortcutCard
                to="/configuracoes?secao=notificacoes"
                icon={Bell}
                title="Configurações de Notificações"
                text="Quem recebe os alertas internos (anotações) e como ativar o aviso neste aparelho."
              />
            </div>
          </Card>
        )}

        {section.id === 'notificacoes' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-400">
              Quem recebe os alertas internos da equipe (anotações) e como ativar o aviso neste aparelho.
              Os clientes nunca recebem nada daqui.
            </p>
            <NotificationPreferences />
          </div>
        )}
      </div>

      {/* Barra de salvar: fixa no rodapé da área rolável, só nas abas com campos. */}
      {section.savable && (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-6 px-6 py-3 bg-gray-50/90 backdrop-blur border-t border-gray-100 flex items-center justify-end gap-4">
          {savedMessage && (
            <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
              <Check size={14} strokeWidth={2} />
              Salvo com sucesso!
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-gray-900 text-white rounded-lg px-6 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {isSaving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl p-5 border border-gray-100 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = 'w-full',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function PrefixedInput({
  prefix,
  value,
  onChange,
  placeholder,
}: {
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
      <span className="pl-3 text-sm text-gray-400 select-none shrink-0">{prefix}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 py-2.5 pr-3 text-sm outline-none min-w-0"
      />
    </div>
  );
}

function ConfiguredBadge({ label, onReplace }: { label: string; onReplace: () => void }) {
  return (
    <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
      <span className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
        <Check size={14} strokeWidth={2} />
        {label}
      </span>
      <button type="button" onClick={onReplace} className="text-xs font-semibold text-gray-500 underline">
        Substituir
      </button>
    </div>
  );
}

function ShortcutCard({
  to,
  icon: Icon,
  title,
  text,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 hover:bg-gray-50 transition-colors"
    >
      <span className="w-10 h-10 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
        <Icon size={18} strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-400 mt-0.5">{text}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-gray-400" />
    </Link>
  );
}
