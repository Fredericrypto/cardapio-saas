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
                <p className="flex items-start gap-1.5">
                  <MapPin size={13} className="shrink-0 mt-0.5" />
                  <span>{location.address}</span>
                </p>
              )}

              {weekSchedule && (
                <div className="flex items-start gap-1.5">
                  <Clock size={13} className="shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5 text-left">
                    {weekSchedule.map((line) => (
                      <span key={line.day}>
                        {line.day}: {line.hours}
                      </span>
                    ))}
                  </div>
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
