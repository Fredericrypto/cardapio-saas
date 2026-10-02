// Regra do nome do VISITANTE (sem conta), decisão final do Felipe
// (01/10/2026). A mesma regra existe no app do cliente
// (frontend-cardapio/src/lib/guestName.ts) — o servidor é quem manda.
//   - nunca só espaços; sem espaço nas pontas;
//   - de 4 a 16 caracteres;
//   - começa com uma letra;
//   - sem caracteres especiais (só letras, números e espaço simples);
//   - exatamente 4 caracteres → todos letras; 5 ou mais → pode ter números.
export const GUEST_NAME_MIN = 4;
export const GUEST_NAME_MAX = 16;

export function validateGuestName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').trim();
  if (name.length === 0) return 'Informe seu nome.';
  if (name.length < GUEST_NAME_MIN) return `O nome precisa ter pelo menos ${GUEST_NAME_MIN} caracteres.`;
  if (name.length > GUEST_NAME_MAX) return `O nome pode ter no máximo ${GUEST_NAME_MAX} caracteres.`;
  if (!/^\p{L}/u.test(name)) return 'O nome precisa começar com uma letra.';
  if (!/^[\p{L}0-9]+(?: [\p{L}0-9]+)*$/u.test(name)) {
    return 'Use só letras e números, sem caracteres especiais.';
  }
  if (name.length === GUEST_NAME_MIN && !/^\p{L}+$/u.test(name)) {
    return 'Com 4 caracteres, o nome só pode ter letras.';
  }
  return null;
}
