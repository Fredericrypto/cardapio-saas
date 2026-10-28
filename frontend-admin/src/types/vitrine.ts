// Modo Vitrine — tipos do frontend-admin. A configuração do restaurante guarda só
// REFERÊNCIAS (nunca cópias de nome/foto); o servidor resolve em slides na leitura
// (GET /tenants/me/vitrine). Espelha backend/src/modules/tenants/vitrine-settings.ts.
export const VITRINE_MAX_ITEMS = 12;

export type VitrineItem = { k: 'banner' } | { k: 'product'; id: string };

export interface VitrineSettings {
  v: 1;
  items: VitrineItem[];
}

export interface VitrineSlide {
  id: string;
  kind: 'banner' | 'product';
  imageUrl: string;
  name: string | null;
}

export interface VitrineData {
  name: string;
  logoUrl: string | null;
  slides: VitrineSlide[];
}

// Quais eventos operacionais tiram a vitrine da tela (por aparelho).
export interface WakeOn {
  orders: boolean;
  calls: boolean;
  closings: boolean;
}

// Ids pedindo atenção agora, por categoria (ver hooks/useAttentionStatus).
export interface AttentionIds {
  orders: string[];
  calls: string[];
  closings: string[];
}
