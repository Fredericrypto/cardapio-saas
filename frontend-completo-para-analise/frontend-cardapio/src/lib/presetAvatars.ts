// Precisa bater exatamente com PRESET_AVATAR_IDS no backend
// (backend/src/modules/customers/preset-avatars.ts) e com os arquivos
// em public/avatars/.
export const PRESET_AVATAR_IDS = [
  'female-1', 'female-2', 'female-3', 'female-4', 'female-5',
  'female-6', 'female-7', 'female-8', 'female-9',
  'male-1', 'male-2', 'male-3', 'male-4', 'male-5',
  'male-6', 'male-7', 'male-8', 'male-9',
];

export function presetAvatarPath(presetId: string): string {
  return `/avatars/${presetId}.svg`;
}
