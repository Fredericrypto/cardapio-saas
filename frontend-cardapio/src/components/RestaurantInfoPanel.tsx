import { useI18n } from '../i18n/I18nContext';
import { useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, MapPin, Clock, Phone, Info } from 'lucide-react';
import type { Tenant, Location } from '../types';
import { getWeekScheduleLines } from '../lib/openingHours';
import {
  WhatsAppOutlineIcon,
  InstagramOutlineIcon,
  YoutubeOutlineIcon,
  FacebookOutlineIcon,
  TikTokOutlineIcon,
  XOutlineIcon,
  TelegramOutlineIcon,
  MessengerOutlineIcon,
  EmailOutlineIcon,
} from './SocialOutlineIcons';
import { ACTION_BUTTON_BASE } from '../lib/uiClasses';
import { Tooltip } from './Tooltip';
import { useAccentColor } from '../hooks/useAccentColor';
import {
  buildWhatsappLink,
  buildInstagramLink,
  buildYoutubeLink,
  buildFacebookLink,
  buildTiktokLink,
  buildTwitterLink,
  buildTelegramLink,
  buildMessengerLink,
  buildGmailLink,
  buildPhoneLink,
} from '../lib/socialLinks';
import {
  MENU_BORDER,
  MENU_TEXT_BODY,
  MENU_TEXT_MUTED,
} from '../lib/menuTheme';

interface RestaurantInfoPanelProps {
  tenant: Tenant;
  location: Location | null;
}

// Pedido do Felipe (19/09): "Rua X, Bairro" numa linha, "Cidade: Y -
// Estado, CEP" na outra. O endereço geocodificado sempre vem como
// "rua, bairro, cidade, estado, CEP" (ver GeocodingService no backend)
// — quando bate esse formato exato, separa bonito; caso venha
// diferente (endereço digitado manualmente antes de existir
// geocodificação, por exemplo), mostra inteiro numa linha só em vez de
// arriscar cortar errado.
// Nome do estado por extenso (como vem do geocoding) → sigla de 2
// letras, pro formato compacto que o Felipe pediu ("Araranguá - SC").
const BR_STATE_ABBREVIATIONS: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapá: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceará: 'CE',
  'distrito federal': 'DF',
  'espírito santo': 'ES',
  goiás: 'GO',
  maranhão: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  pará: 'PA',
  paraíba: 'PB',
  paraná: 'PR',
  pernambuco: 'PE',
  piauí: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondônia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'são paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

function abbreviateState(state: string): string {
  return BR_STATE_ABBREVIATIONS[state.trim().toLowerCase()] ?? state;
}

// Pedido do Felipe (19/09): "Rua X, Bairro" numa linha, "Cidade -
// Estado, CEP" na outra (estado abreviado, sem o prefixo "Cidade:").
// O endereço geocodificado sempre vem como "rua, bairro, cidade,
// estado, CEP" (ver GeocodingService no backend) — quando bate esse
// formato exato, separa bonito; caso venha diferente (endereço
// digitado manualmente antes de existir geocodificação, por exemplo),
// mostra inteiro numa linha só em vez de arriscar cortar errado.
function formatAddressLines(address: string): string[] {
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length === 5) {
    const [street, neighborhood, city, state, zip] = parts;
    return [`${street}, ${neighborhood}`, `${city} - ${abbreviateState(state)}, ${zip}`];
  }
  return [address];
}

// Telefone brasileiro legível: "(48) 99999-9999" (celular), "(48) 3333-4444"
// (fixo), "4003-1234" (sem DDD) e "0800 123 4567". Aceita o número já com
// máscara, com +55/55 na frente ou só dígitos; qualquer coisa que não bata
// com esses formatos volta INTACTA (nunca inventa nem corta dígito). Só
// afeta o que é MOSTRADO — o link `tel:` continua usando o valor cru.
function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && /^0[38]00/.test(digits)) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  const national = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.startsWith('0')) return raw;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  if (national.length === 9) return `${national.slice(0, 5)}-${national.slice(5)}`;
  if (national.length === 8) return `${national.slice(0, 4)}-${national.slice(4)}`;
  return raw;
}

interface SocialLinkItem {
  key: string;
  href: string;
  label: string;
  Icon: ComponentType<{ size: number }>;
  // Gmail abre o app de e-mail na mesma aba; as demais abrem em nova aba.
  external: boolean;
}

// Painel "Informações" do cabeçalho. Recolhido por padrão; ao abrir mostra
// endereço, horário de funcionamento (7 dias), redes sociais e telefone de
// contato — só o que o restaurante preencheu (campo vazio nem aparece).
// WhatsApp, Telegram, telefone de contato e endereço/horário vêm da LOJA
// escolhida (cada filial tem os seus); as outras redes sociais são da MARCA
// inteira.
//
// Celular: coluna centralizada (desenho original). Desktop (md+): colunas de
// mesma largura, com título e conteúdo centralizados e um divisor vertical
// fino entre elas — endereço | horário | contato (redes + telefone). O número
// de colunas acompanha os blocos preenchidos.
//
// Vive dentro do cabeçalho (MenuHeader / TableMenuHeader); cores vêm de
// lib/menuTheme, com par claro/escuro explícito.
export function RestaurantInfoPanel({ tenant, location }: RestaurantInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  // Cor do restaurante legivel no tema atual: alimenta o brilho do botao de telefone (--glow).
  const accent = useAccentColor(tenant.primaryColor ?? '#3d3846');
  const weekSchedule = getWeekScheduleLines(location?.openingHours ?? null, t);
  // O texto de dia fechado vem do dicionário ("Fechado" / "Closed" / "Cerrado"); comparar com o
  // literal em português deixava o dia fechado sem o vermelho em inglês e espanhol.
  const closedDayLabel = t('store.hoursClosedDay');


  // Só os ícones (sem número/usuário escrito do lado). Desde a z6-09 todos são
  // OUTLINED, do mesmo tamanho e na cor do texto do tema (SocialOutlineIcons),
  // sem cores de marca. Admin escolhe quais usar preenchendo (ou não) cada
  // campo nas configurações — o que não foi preenchido nem aparece.
  // Os links abrem no app nativo de cada plataforma quando ele está instalado
  // (o domínio oficial de cada uma já é reconhecido pelo celular como link do
  // app) e caem no site normal quando não está.
  const socialLinks: SocialLinkItem[] = [];
  if (location?.whatsappNumber) {
    socialLinks.push({ key: 'whatsapp', href: buildWhatsappLink(location.whatsappNumber), label: 'WhatsApp', Icon: WhatsAppOutlineIcon, external: true });
  }
  if (location?.telegramUsername) {
    socialLinks.push({ key: 'telegram', href: buildTelegramLink(location.telegramUsername), label: 'Telegram', Icon: TelegramOutlineIcon, external: true });
  }
  if (tenant.instagramHandle) {
    socialLinks.push({ key: 'instagram', href: buildInstagramLink(tenant.instagramHandle), label: 'Instagram', Icon: InstagramOutlineIcon, external: true });
  }
  if (tenant.facebookUrl) {
    socialLinks.push({ key: 'facebook', href: buildFacebookLink(tenant.facebookUrl), label: 'Facebook', Icon: FacebookOutlineIcon, external: true });
  }
  if (tenant.youtubeUrl) {
    socialLinks.push({ key: 'youtube', href: buildYoutubeLink(tenant.youtubeUrl), label: 'YouTube', Icon: YoutubeOutlineIcon, external: true });
  }
  if (tenant.tiktokHandle) {
    socialLinks.push({ key: 'tiktok', href: buildTiktokLink(tenant.tiktokHandle), label: 'TikTok', Icon: TikTokOutlineIcon, external: true });
  }
  if (tenant.twitterHandle) {
    socialLinks.push({ key: 'twitter', href: buildTwitterLink(tenant.twitterHandle), label: 'X / Twitter', Icon: XOutlineIcon, external: true });
  }
  if (tenant.messengerUsername) {
    socialLinks.push({ key: 'messenger', href: buildMessengerLink(tenant.messengerUsername), label: 'Messenger', Icon: MessengerOutlineIcon, external: true });
  }
  if (tenant.gmailAddress) {
    socialLinks.push({ key: 'gmail', href: buildGmailLink(tenant.gmailAddress), label: t('info.email'), Icon: EmailOutlineIcon, external: false });
  }

  const hasSocialLinks = socialLinks.length > 0;
  const hasContactPhone = Boolean(location?.contactPhoneNumber);
  const hasContactBlock = hasSocialLinks || hasContactPhone;

  // Redes sociais moram DENTRO de "Informações" (junto do telefone).
  const hasCollapsibleInfo = Boolean(location?.address) || Boolean(weekSchedule) || hasContactBlock;

  if (!hasCollapsibleInfo) return null;

  // Colunas presentes (só as preenchidas). Cada coluna, exceto a primeira,
  // desenha o divisor vertical à sua esquerda.
  const showAddress = Boolean(location?.address);
  const showHours = Boolean(weekSchedule);
  const columnCount = [showAddress, showHours, hasContactBlock].filter(Boolean).length;

  return (
    <div className={`mt-3 md:mt-4 pt-4 border-t flex flex-col gap-4 ${MENU_BORDER}`}>
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={`flex items-center justify-center gap-1.5 w-full text-xs font-semibold py-1 ${MENU_TEXT_BODY}`}
        >
          <Info size={15} strokeWidth={1.5} className="shrink-0" />
          <span>{t('info.title')}</span>
          <ChevronDown size={14} strokeWidth={1.5} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div
            className={`mt-3 px-2 pb-1 flex flex-col items-center gap-4 text-xs text-center md:grid ${INFO_GRID_COLS[columnCount]} md:items-stretch md:gap-x-8 md:gap-y-6 md:px-1 ${MENU_TEXT_BODY}`}
          >
            {location?.address && (
              <InfoColumn title={t('info.address')}>
                <div className="flex flex-col items-center gap-1 md:flex-row md:justify-center md:gap-2.5">
                  <MapPin size={13} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
                  {/* Endereço em duas linhas (rua e bairro / cidade - UF, CEP);
                      formato diferente do geocodificado cai numa linha só. */}
                  <div className="flex flex-col items-center text-center">
                    {formatAddressLines(location.address).map((line, idx) => (
                      <span key={idx}>{line}</span>
                    ))}
                  </div>
                </div>
              </InfoColumn>
            )}

            {weekSchedule && (
              <InfoColumn title={t('info.hours')} divider={showAddress}>
                <div className="flex flex-col gap-1 text-left">
                  {/* Relógio em TODAS as linhas; dia fechado em vermelho. */}
                  {weekSchedule.map((line) => (
                    <span key={line.day} className="flex items-center gap-1.5">
                      <Clock size={13} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
                      <span className={line.hours === closedDayLabel ? 'text-red-500 dark:text-red-400 font-medium' : ''}>
                        {line.day}: {line.hours}
                      </span>
                    </span>
                  ))}
                </div>
              </InfoColumn>
            )}

            {hasContactBlock && (
              <InfoColumn
                title={hasSocialLinks ? t('info.social') : t('info.contact')}
                divider={showAddress || showHours}
              >
                {hasSocialLinks && (
                  <div className="flex flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-2 md:gap-x-2">
                    {socialLinks.map(({ key, href, label: linkLabel, Icon, external }) => (
                      <Tooltip key={key} label={linkLabel} className="inline-flex shrink-0">
                        <a
                          href={href}
                          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className={`info-social-link w-9 h-9 md:w-10 md:h-10 shrink-0 rounded-full flex items-center justify-center transition-colors active:opacity-70 ${MENU_TEXT_BODY} md:hover:text-[#111827] dark:md:hover:text-[#E3E2E6]`}
                          aria-label={linkLabel}
                        >
                          <Icon size={24} />
                        </a>
                      </Tooltip>
                    ))}
                  </div>
                )}

                {/* Telefone de contato "puro" (não WhatsApp), formatado; abre o
                    discador com o número original. */}
                {location?.contactPhoneNumber && (
                  <Tooltip label={t('tooltip.call')} className="flex w-full justify-center">
                    <a
                      href={buildPhoneLink(location.contactPhoneNumber)}
                      // Vidro do cabecalho (transparente + blur) com SO a borda MENU_BORDER: sem sombra interna.
                      // Brilho no hover/foco identico ao dos cartoes de unidade (.loc-card, via --glow).
                      className={`info-phone-btn w-[9.75rem] max-w-full border bg-transparent backdrop-blur-md text-[#374151] dark:text-white ${MENU_BORDER} ${ACTION_BUTTON_BASE}`}
                      style={{ '--glow': accent } as CSSProperties}
                    >
                      <Phone size={14} strokeWidth={1.5} className="shrink-0" />
                      <span>{formatPhoneBR(location.contactPhoneNumber)}</span>
                    </a>
                  </Tooltip>
                )}
              </InfoColumn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Número de colunas do desktop por quantidade de blocos preenchidos (classes
// literais pro Tailwind enxergar).
const INFO_GRID_COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

// Coluna do painel de informações. No desktop: título centralizado no topo e o
// conteúdo centralizado (horizontal e vertical) na área abaixo dele. O divisor
// vertical (só desktop) mora nessa área, no meio do espaço entre colunas, e
// usa só ~76% da altura — nunca encosta no título nem na base do painel. No
// celular o título fica oculto e o desenho centralizado original é mantido.
function InfoColumn({
  title,
  divider = false,
  children,
}: {
  title: string;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 w-full md:h-full">
      <h3
        className={`hidden md:block w-full text-center text-[11px] font-semibold uppercase tracking-wider ${MENU_TEXT_MUTED}`}
      >
        {title}
      </h3>
      <div className="relative flex flex-col items-center justify-center gap-4 w-full text-center md:flex-1">
        {divider && (
          <span
            aria-hidden="true"
            className="hidden md:block absolute -left-4 top-[12%] bottom-[12%] w-px bg-[#E5E7EB] dark:bg-white/10"
          />
        )}
        {children}
      </div>
    </div>
  );
}
