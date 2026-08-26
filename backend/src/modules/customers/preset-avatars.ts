// Lista fechada dos avatares predefinidos disponíveis — o cliente nunca
// manda uma URL de avatar direto (isso abriria a porta pra qualquer
// link arbitrário virar "avatar"); ele só manda um `presetId` dessa
// lista, e o SERVIDOR resolve pro caminho de verdade. Precisa bater
// exatamente com os arquivos em frontend-cardapio/public/avatars/.
export const PRESET_AVATAR_IDS = [
  'female-1', 'female-2', 'female-3', 'female-4', 'female-5',
  'female-6', 'female-7', 'female-8', 'female-9',
  'male-1', 'male-2', 'male-3', 'male-4', 'male-5',
  'male-6', 'male-7', 'male-8', 'male-9',
] as const;

export type PresetAvatarId = (typeof PRESET_AVATAR_IDS)[number];

// Caminho público servido pelo frontend-cardapio (Vite serve arquivos de
// /public na raiz) — guardamos só esse caminho relativo no banco, nunca
// um domínio fixo, pra funcionar igual em dev/produção.
export function presetAvatarPath(presetId: PresetAvatarId): string {
  return `/avatars/${presetId}.svg`;
}
