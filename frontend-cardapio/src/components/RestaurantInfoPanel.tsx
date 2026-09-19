import { useState } from 'react';
import { ChevronDown, MapPin, Clock } from 'lucide-react';
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
} from '../lib/socialLinks';

interface RestaurantInfoPanelProps {
  tenant: Tenant;
  location: Location | null;
}

// WhatsApp e Instagram ficam sempre visíveis (não fazem sentido escondidos
// atrás de um "ver mais" — são a forma mais rápida do cliente confirmar
// que achou o restaurante certo, e são links tocáveis pro app de verdade).
// Só endereço e horário completo (7 dias) ficam atrás do colapsável
// "Informações do estabelecimento", já que ocupam mais espaço. WhatsApp e
// endereço/horário agora vêm da LOJA escolhida, não da marca — cada
// filial tem os seus.
//
// Vive dentro do sheet branco flutuante do header (ver MenuHeader) —
// por isso as cores são escuras sobre fundo claro, não mais texto branco
// sobre a cor do tenant como na versão anterior.
export function RestaurantInfoPanel({ tenant, location }: RestaurantInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const weekSchedule = getWeekScheduleLines(location?.openingHours ?? null);

  const hasSocialLinks =
    Boolean(location?.whatsappNumber) ||
    Boolean(tenant.instagramHandle) ||
    Boolean(tenant.youtubeUrl) ||
    Boolean(tenant.facebookUrl) ||
    Boolean(tenant.tiktokHandle) ||
    Boolean(tenant.twitterHandle) ||
    Boolean(tenant.telegramUsername) ||
    Boolean(tenant.messengerUsername);
  const hasCollapsibleInfo = Boolean(location?.address) || Boolean(weekSchedule);

  if (!hasSocialLinks && !hasCollapsibleInfo) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2.5">
      {hasSocialLinks && (
        // Pedido do Felipe (18/09): trocado de novo — agora só os
        // ícones (sem número/usuário escrito do lado), maiores e mais
        // visíveis, com a aparência oficial de cada app (ver
        // BrandIcons.tsx). Admin escolhe quais usar simplesmente
        // preenchendo (ou não) cada campo nas configurações — o que
        // não foi preenchido nem aparece aqui.
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
          {tenant.telegramUsername && (
            <a
              href={buildTelegramLink(tenant.telegramUsername)}
              target="_blank"
              rel="noopener noreferrer"
              className="active:opacity-70"
              aria-label="Telegram"
            >
              <TelegramIcon size={30} />
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
        </div>
      )}

      {hasCollapsibleInfo && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500"
          >
            <span>Informações do estabelecimento</span>
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {expanded && (
            <div className="mt-2.5 flex flex-col gap-2 text-xs text-gray-500">
              {location?.address && (
                <p className="flex items-start gap-1.5">
                  <MapPin size={13} className="shrink-0 mt-0.5" />
                  <span>{location.address}</span>
                </p>
              )}

              {weekSchedule && (
                <div className="flex items-start gap-1.5">
                  <Clock size={13} className="shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    {weekSchedule.map((line) => (
                      <span key={line.day}>
                        {line.day}: {line.hours}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
