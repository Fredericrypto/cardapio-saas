import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Criptografia simétrica (AES-256-GCM) pra guardar credenciais de
// verdade (tokens de gateway de pagamento) no banco — diferente da
// chave Pix do estabelecimento, que é feita pra ser pública, um access
// token de API é um segredo de verdade e nunca deve ficar em texto puro
// no banco de dados.
//
// A chave de criptografia vem de CREDENTIALS_ENCRYPTION_KEY (env var) —
// se não existir, cai num valor de desenvolvimento (só serve local, e
// avisa no log). Em produção isso É OBRIGATÓRIO estar configurado.

const ENCRYPTION_KEY_SOURCE =
  process.env.CREDENTIALS_ENCRYPTION_KEY ??
  (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY precisa estar configurada em produção — sem ela, credenciais de gateway de pagamento não podem ser guardadas com segurança.',
      );
    }
    console.warn(
      '[aviso] CREDENTIALS_ENCRYPTION_KEY não configurada — usando chave de desenvolvimento. Configure isso antes de ir pra produção.',
    );
    return 'dev-only-insecure-key-troque-em-producao';
  })();

const KEY = scryptSync(ENCRYPTION_KEY_SOURCE, 'cardapio-saas-salt', 32);
const ALGORITHM = 'aes-256-gcm';

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Formato: iv:authTag:conteúdo, tudo em base64, junto numa string só
  // pra caber numa coluna de texto comum.
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(encoded: string): string {
  const [ivB64, authTagB64, dataB64] = encoded.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

// Máscara pra exibir no painel admin sem nunca mandar o token real de
// volta pro frontend depois de salvo (ex: "TEST-...a4-3562391071" vira
// "••••••••3071").
export function maskSecret(plainText: string): string {
  if (plainText.length <= 4) return '••••';
  return `••••${plainText.slice(-4)}`;
}
