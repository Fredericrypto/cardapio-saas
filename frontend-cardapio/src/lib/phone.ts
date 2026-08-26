// Máscara de telefone brasileiro — formata progressivamente enquanto
// digita: (XX) XXXX-XXXX (fixo, 10 dígitos) ou (XX) XXXXX-XXXX (celular,
// 11 dígitos). Sempre trabalha a partir dos dígitos crus, então cola
// colando texto formatado errado não quebra nada.
export function formatBrazilPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// Válido = vazio (campo opcional) ou 10/11 dígitos (fixo ou celular).
export function isValidBrazilPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return true;
  return digits.length === 10 || digits.length === 11;
}
