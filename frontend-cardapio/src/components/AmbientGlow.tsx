import type { ReactNode } from 'react';
import type { Tenant } from '../types';

// Luz ambiente do cabeçalho (estilo "modo ambiente" do YouTube): uma cópia da
// própria foto do banner, bem desfocada e saturada, fica ATRÁS do cartão inteiro
// (banner + nome + entrega) e vaza suavemente pelas bordas. Sem foto de capa,
// usa o mesmo degradê que o banner usa.
//
// Como funciona:
//   - a camada é `position:absolute` com z-index negativo; a MenuPage tem
//     `isolate`, então ela fica acima do fundo da página e abaixo de TODO o
//     conteúdo (texto, cards, faixa de categorias) — nunca cobre leitura;
//   - não altera layout (o invólucro é um bloco sem estilo próprio) nem recebe
//     toque (pointer-events:none);
//   - é UM único elemento com blur estático (sem animação, sem JS em rolagem);
//   - `muted` (loja fechada, banner em tons de cinza) deixa a luz cinza e mais fraca.
// Estilos: bloco ATMOSFERA do index.css (.amb-*).
interface HeaderAmbientProps {
  tenant: Tenant;
  muted?: boolean;
  children: ReactNode;
}

export function HeaderAmbient({ tenant, muted = false, children }: HeaderAmbientProps) {
  return (
    <div className="relative">
      <div aria-hidden="true" className={`amb-header ${muted ? 'amb-muted' : ''}`}>
        {tenant.coverImageUrl ? (
          <img src={tenant.coverImageUrl} alt="" decoding="async" draggable={false} className="amb-media" />
        ) : (
          <span
            className="amb-media"
            style={{ background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})` }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
