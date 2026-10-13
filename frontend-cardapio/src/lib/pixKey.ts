// Chave Pix do cliente: máscara, validação e forma canônica por tipo.
// Só apresentação/normalização — a API recebe o mesmo par { pixKeyType, pixKey }.

export type PixKeyType = 'email' | 'telefone' | 'cpf' | 'aleatoria';

const onlyDigits = (v: string) => v.replace(/\D/g, '');

export function formatCpf(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatPhoneBR(raw: string): string {
  // "+55" só é descartado quando vem explícito (colagem / valor salvo);
  // digitando, "55" é um DDD válido.
  let d = onlyDigits(raw);
  if (raw.trim().startsWith('+55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

function isValidPhone(raw: string): boolean {
  const d = onlyDigits(formatPhoneBR(raw));
  if (d.length !== 10 && d.length !== 11) return false;
  if (!/^[1-9][1-9]$/.test(d.slice(0, 2))) return false;
  return d.length === 10 || d[2] === '9';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RANDOM_RE = /^[A-Za-z0-9-]{8,36}$/;

/** Aplica a máscara do tipo ao que o usuário digitou/colou. */
export function formatPixKeyInput(type: string, raw: string): string {
  switch (type) {
    case 'cpf':
      return formatCpf(raw);
    case 'telefone':
      return formatPhoneBR(raw);
    case 'email':
      return raw.replace(/\s/g, '').slice(0, 77);
    case 'aleatoria':
      return raw.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);
    default:
      return raw;
  }
}

export function isValidPixKey(type: string, raw: string): boolean {
  const value = raw.trim();
  switch (type) {
    case 'email':
      return EMAIL_RE.test(value);
    case 'telefone':
      return isValidPhone(value);
    case 'cpf':
      return isValidCpf(value);
    case 'aleatoria':
      return RANDOM_RE.test(value);
    default:
      return false;
  }
}

/** Forma enviada à API (padrão Pix): e-mail minúsculo, CPF só dígitos, celular +55DDDNÚMERO. */
export function toCanonicalPixKey(type: string, raw: string): string {
  const value = raw.trim();
  switch (type) {
    case 'email':
      return value.toLowerCase();
    case 'cpf':
      return onlyDigits(value);
    case 'telefone':
      return `+55${onlyDigits(formatPhoneBR(value))}`;
    default:
      return value;
  }
}

/** Chave salva (formato antigo ou canônico) -> texto do campo / exibição. */
export function fromStoredPixKey(type: string | null | undefined, stored: string): string {
  if (type === 'telefone') {
    let d = onlyDigits(stored);
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    return formatPhoneBR(d);
  }
  if (type === 'cpf') return formatCpf(stored);
  return stored;
}
