// Modo Vitrine — preferências DESTE APARELHO (localStorage). Valem só para este
// navegador: o painel também roda em celular de equipe, e a vitrine de um PC de
// balcão não pode aparecer no celular do garçom. Padrão: desligada.
import type { WakeOn } from '../../types/vitrine';

export const VITRINE_DEVICE_KEY = 'cardapio-admin-vitrine';
export const IDLE_MINUTES_OPTIONS = [2, 5, 10, 15, 30] as const;
export const DEFAULT_IDLE_MINUTES = 5;

export interface VitrineDeviceSettings {
  v: 1;
  enabled: boolean;
  idleMinutes: number;
  wakeOn: WakeOn;
}

function defaults(): VitrineDeviceSettings {
  return { v: 1, enabled: false, idleMinutes: DEFAULT_IDLE_MINUTES, wakeOn: { orders: true, calls: true, closings: true } };
}

function isIdleOption(n: unknown): n is number {
  return typeof n === 'number' && (IDLE_MINUTES_OPTIONS as readonly number[]).includes(n);
}

// Leitura DEFENSIVA (pura): JSON corrompido, chave ausente ou valor fora da lista
// voltam ao padrão. Opção de acordar ausente = LIGADA (o lado seguro: nunca esconder
// um pedido por falta de configuração).
export function parseDeviceSettings(raw: string | null): VitrineDeviceSettings {
  const out = defaults();
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;
  out.enabled = d.enabled === true;
  if (isIdleOption(d.idleMinutes)) out.idleMinutes = d.idleMinutes;
  const w = typeof d.wakeOn === 'object' && d.wakeOn !== null ? (d.wakeOn as Record<string, unknown>) : {};
  out.wakeOn = {
    orders: typeof w.orders === 'boolean' ? w.orders : true,
    calls: typeof w.calls === 'boolean' ? w.calls : true,
    closings: typeof w.closings === 'boolean' ? w.closings : true,
  };
  return out;
}

// ---- store externo (padrão do lib/theme.ts) para useSyncExternalStore ----
let current: VitrineDeviceSettings | null = null;
const listeners = new Set<() => void>();
let storageHooked = false;

function readFromStorage(): VitrineDeviceSettings {
  try {
    return parseDeviceSettings(window.localStorage.getItem(VITRINE_DEVICE_KEY));
  } catch {
    return defaults();
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getDeviceSettings(): VitrineDeviceSettings {
  if (current === null) current = readFromStorage();
  return current;
}

export function updateDeviceSettings(patch: {
  enabled?: boolean;
  idleMinutes?: number;
  wakeOn?: Partial<WakeOn>;
}): void {
  const prev = getDeviceSettings();
  const next = parseDeviceSettings(
    JSON.stringify({ ...prev, ...patch, wakeOn: { ...prev.wakeOn, ...patch.wakeOn } }),
  );
  current = next;
  try {
    window.localStorage.setItem(VITRINE_DEVICE_KEY, JSON.stringify(next));
  } catch {
    /* storage cheio/bloqueado: vale só até recarregar */
  }
  emit();
}

export function subscribeDeviceSettings(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageHooked && typeof window !== 'undefined') {
    storageHooked = true;
    window.addEventListener('storage', (e) => {
      if (e.key === VITRINE_DEVICE_KEY) {
        current = readFromStorage();
        emit();
      }
    });
  }
  return () => {
    listeners.delete(listener);
  };
}
