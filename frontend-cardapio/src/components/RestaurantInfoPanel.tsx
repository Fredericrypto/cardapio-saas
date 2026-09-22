import { useState } from 'react';
import { ChevronDown, MapPin, Clock, Phone } from 'lucide-react';
import type { Tenant, Location } from '../types';
import { getWeekScheduleLines } from '../lib/openingHours';
import {
  WhatsAppIcon,
  InstagramIcon,
  YoutubeIcon,
  FacebookIcon,
  TikTokIcon,
  TwitterXIcon,
  TelegramIcon,
  MessengerIcon,
  GmailIcon,
} from './BrandIcons';
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

// WhatsApp e Instagram ficam sempre visíveis (não fazem sentido escondidos
// atrás de um "ver mais" — são a forma mais rápida do cliente confirmar
// que achou o restaurante certo, e são links tocáveis pro app de verdade).
// Só endereço, horário completo (7 dias) e telefone de contato ficam atrás
// do colapsável "Informações do estabelecimento", já que ocupam mais
// espaço. WhatsApp, Telegram, telefone de contato e endereço/horário vêm
// da LOJA escolhida (cada filial tem os seus); as outras redes sociais são
// da MARCA inteira.
//
// Vive dentro do sheet branco flutuante do header (ver MenuHeader) —
// por isso as cores são escuras sobre fundo claro, não mais texto branco
// sobre a cor do tenant como na versão anterior.
export function RestaurantInfoPanel({ tenant, location }: RestaurantInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const weekSchedule = getWeekScheduleLines(location?.openingHours ?? null);

  const hasSocialLinks =
    Boolean(location?.whatsappNumber) ||
    Boolean(location?.telegramUsername) ||
    Boolean(tenant.instagramHandle) ||
    Boolean(tenant.youtubeUrl) ||
    Boolean(tenant.facebookUrl) ||
    Boolean(tenant.tiktokHandle) ||
    Boolean(tenant.twitterHandle) ||
    Boolean(tenant.messengerUsername) ||
    Boolean(tenant.gmailAddress);
  const hasContactPhone = Boolean(location?.contactPhoneNumber);
  const hasCollapsibleInfo =
    Boolean(location?.address) || Boolean(weekSchedule) || hasContactPhone;

  if (!hasSocialLinks && !hasCollapsibleInfo) return null;

  return (
    <div className="mt-3 pt-4 border-t border-gray-100 flex flex-col gap-4">
      {hasSocialLinks && (
        // Pedido do Felipe (18/09, cores atualizadas 19/09): só os
        // ícones (sem número/usuário escrito do lado), maiores e mais
        // visíveis, com a aparência oficial (e cores atuais) de cada
        // app (ver BrandIcons.tsx). Admin escolhe quais usar
        // simplesmente preenchendo (ou não) cada campo nas
        // configurações — o que não foi preenchido nem aparece aqui.
        // Os links abrem no app nativo de cada plataforma quando ele
        // está instalado (o próprio domínio oficial de cada uma —
        // instagram.com, t.me, m.me etc — já é reconhecido pelo
        // celular como link do app, sem precisar de nada especial
        // aqui) e caem no site normal quando não está.
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {location?.whatsappNumber && (
            <a
              href={buildWhatsappLink(location.whatsappNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="WhatsApp"
            >
              <WhatsAppIcon size={30} />
            </a>
          )}
          {location?.telegramUsername && (
            <a
              href={buildTelegramLink(location.telegramUsername)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="Telegram"
            >
              <TelegramIcon size={30} />
            </a>
          )}
          {tenant.instagramHandle && (
            <a
              href={buildInstagramLink(tenant.instagramHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="Instagram"
            >
              <InstagramIcon size={30} />
            </a>
          )}
          {tenant.facebookUrl && (
            <a
              href={buildFacebookLink(tenant.facebookUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="Facebook"
            >
              <FacebookIcon size={30} />
            </a>
          )}
          {tenant.youtubeUrl && (
            <a
              href={buildYoutubeLink(tenant.youtubeUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="YouTube"
            >
              <YoutubeIcon size={30} />
            </a>
          )}
          {tenant.tiktokHandle && (
            <a
              href={buildTiktokLink(tenant.tiktokHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="TikTok"
            >
              <TikTokIcon size={30} />
            </a>
          )}
          {tenant.twitterHandle && (
            <a
              href={buildTwitterLink(tenant.twitterHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="X (Twitter)"
            >
              <TwitterXIcon size={30} />
            </a>
          )}
          {tenant.messengerUsername && (
            <a
              href={buildMessengerLink(tenant.messengerUsername)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="Messenger"
            >
              <MessengerIcon size={30} />
            </a>
          )}
          {tenant.gmailAddress && (
            <a href={buildGmailLink(tenant.gmailAddress)} className="active:opacity-70" aria-label="E-mail">
              <GmailIcon size={30} />
            </a>
          )}
        </div>
      )}

      {hasCollapsibleInfo && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-gray-500 py-1"
          >
            <span>Informações do estabelecimento</span>
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {expanded && (
            <div className="mt-3 px-2 pb-1 flex flex-col items-center gap-3 text-xs text-gray-500 text-center">
              {location?.address && (
                <div className="flex flex-col items-center gap-1">
                  <MapPin size={13} className="shrink-0 text-gray-400" />
                  {/* Pedido do Felipe (19/09): endereço em duas linhas
                      — rua/bairro numa, cidade/estado/CEP na outra —
                      as duas centralizadas, uma embaixo da outra. O
                      endereço geocodificado sempre vem nesse formato
                      exato (rua, bairro, cidade, estado, CEP — ver
                      GeocodingService.buildFormattedAddress no
                      backend); se por algum motivo vier diferente
                      (menos partes que o esperado), cai de volta pra
                      mostrar o endereço inteiro numa linha só, sem
                      quebrar o layout. */}
                  <div className="flex flex-col items-center">
                    {formatAddressLines(location.address).map((line, idx) => (
                      <span key={idx}>{line}</span>
                    ))}
                  </div>
                </div>
              )}

              {weekSchedule && (
                <div className="flex flex-col gap-1 text-left">
                  {/* Pedido do Felipe (19/09): ícone de relógio em
                      TODAS as linhas dos dias, não só uma vez pro bloco
                      inteiro — e dia marcado como fechado (pelo admin,
                      na aba "Lojas") aparece em vermelho. */}
                  {weekSchedule.map((line) => (
                    <span key={line.day} className="flex items-center gap-1.5">
                      <Clock size={13} className="shrink-0 text-gray-400" />
                      <span className={line.hours === 'Fechado' ? 'text-red-500 font-medium' : ''}>
                        {line.day}: {line.hours}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Pedido do Felipe (19/09): telefone de contato "puro"
                  (sem ser WhatsApp), numa área separada dos ícones de
                  rede social — aqui dentro de "Informações do
                  estabelecimento". Abre o discador nativo do aparelho. */}
              {location?.contactPhoneNumber && (
                <a
                  href={buildPhoneLink(location.contactPhoneNumber)}
                  className="flex items-center gap-1.5 font-medium text-gray-600 active:opacity-70"
                >
                  <Phone size={13} className="shrink-0" />
                  <span>{location.contactPhoneNumber}</span>
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
