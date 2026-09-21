// Pedido do Felipe (19/09): campo de telefone aceitava dígitos
// infinitos, sem formato nenhum. Máscara padrão brasileiro: DDD entre
// parênteses + traço no meio, cobrindo tanto celular (9 dígitos depois
// do DDD, o padrão atual) quanto fixo (8 dígitos) — detecta sozinho
// pelo QUANTO já foi digitado, não trava numa contagem fixa caso o
// padrão mude no futuro (o próprio Felipe não tem certeza se ainda vai
// ser 9 dígitos daqui a uns anos). Sempre limita em 11 dígitos numéricos
// no total (2 do DDD + 9 do número), o máximo usado no Brasil hoje.
export function formatBrPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  // 8 dígitos restantes = fixo (4+4); 9 dígitos = celular (5+4).
  const splitAt = rest.length > 8 ? rest.length - 4 : Math.ceil(rest.length / 2);
  return `(${ddd}) ${rest.slice(0, splitAt)}-${rest.slice(splitAt)}`;
}
