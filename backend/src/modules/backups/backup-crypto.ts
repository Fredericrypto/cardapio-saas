import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

// Formato do arquivo de backup criptografado (versão 1):
//
//   "CSBK" (4) | versão (1) | tenantId (16, uuid binário) | backupId (16) |
//   salt (16) | iv (12) | texto cifrado (N) | tag GCM (16)
//
// - AES-256-GCM (autenticado): qualquer bit alterado — no texto cifrado OU no
//   cabeçalho — faz a decifragem falhar.
// - O cabeçalho inteiro (tudo antes do texto cifrado) entra como AAD: não dá
//   pra trocar tenantId/backupId do cabeçalho nem levar o arquivo de um
//   restaurante para outro.
// - A chave de 256 bits NÃO é a variável de ambiente direta: é derivada por
//   HKDF-SHA256 com um SALT ALEATÓRIO POR ARQUIVO — cada arquivo tem uma chave
//   única, então o limite de uso de uma chave GCM nunca se acumula.
// - tenantId/backupId ficam em claro no cabeçalho de propósito: numa
//   recuperação de desastre (banco perdido) só o arquivo + BACKUP_ENCRYPTION_KEY
//   bastam para decifrar (ver cli/decrypt-backup.ts). Não são segredos.

const MAGIC = Buffer.from('CSBK', 'ascii');
export const BACKUP_FORMAT_VERSION = 1;
const UUID_LEN = 16;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + UUID_LEN + UUID_LEN + SALT_LEN + IV_LEN;
const HKDF_INFO = 'cardapio-saas/tenant-backup/v1';
export const MIN_BACKUP_KEY_LENGTH = 32;

export class BackupCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupCryptoError';
  }
}

// Mensagem ÚNICA para toda falha de decifragem — não revela se foi chave
// errada, adulteração ou arquivo truncado.
const DECRYPT_FAILED =
  'Arquivo de backup corrompido, adulterado ou criptografado com outra chave.';

export function isValidBackupKey(raw: string | undefined | null): raw is string {
  return typeof raw === 'string' && raw.length >= MIN_BACKUP_KEY_LENGTH && raw.trim() === raw;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidToBytes(uuid: string): Buffer {
  if (!UUID_RE.test(uuid)) throw new BackupCryptoError('Identificador inválido.');
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(buf: Buffer): string {
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function deriveKey(keyMaterial: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(keyMaterial, 'utf8'), salt, HKDF_INFO, 32));
}

export interface BackupFileContext {
  tenantId: string;
  backupId: string;
}

export function encryptBackup(plain: Buffer, ctx: BackupFileContext, keyMaterial: string): Buffer {
  if (!isValidBackupKey(keyMaterial)) {
    throw new BackupCryptoError(
      `BACKUP_ENCRYPTION_KEY inválida: use pelo menos ${MIN_BACKUP_KEY_LENGTH} caracteres, sem espaços nas pontas.`,
    );
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([BACKUP_FORMAT_VERSION]),
    uuidToBytes(ctx.tenantId),
    uuidToBytes(ctx.backupId),
    salt,
    iv,
  ]);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(keyMaterial, salt), iv);
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, ciphertext, cipher.getAuthTag()]);
}

// Lê SÓ o cabeçalho (sem chave): quem restaura compara com o tenant/backup esperados.
export function readBackupHeader(file: Buffer): BackupFileContext & { version: number } {
  if (file.length < HEADER_LEN + TAG_LEN || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupCryptoError(DECRYPT_FAILED);
  }
  const version = file[MAGIC.length];
  let offset = MAGIC.length + 1;
  const tenantId = bytesToUuid(file.subarray(offset, offset + UUID_LEN));
  offset += UUID_LEN;
  const backupId = bytesToUuid(file.subarray(offset, offset + UUID_LEN));
  return { version, tenantId, backupId };
}

export function decryptBackup(file: Buffer, expected: BackupFileContext | null, keyMaterial: string): Buffer {
  if (!isValidBackupKey(keyMaterial)) {
    throw new BackupCryptoError('BACKUP_ENCRYPTION_KEY inválida ou não configurada.');
  }
  const header = readBackupHeader(file); // já valida tamanho mínimo e "CSBK"
  if (header.version !== BACKUP_FORMAT_VERSION) {
    throw new BackupCryptoError(`Versão de formato de backup não suportada (${header.version}).`);
  }
  if (expected && (header.tenantId !== expected.tenantId || header.backupId !== expected.backupId)) {
    throw new BackupCryptoError(DECRYPT_FAILED);
  }
  const headerBytes = file.subarray(0, HEADER_LEN);
  const salt = file.subarray(HEADER_LEN - IV_LEN - SALT_LEN, HEADER_LEN - IV_LEN);
  const iv = file.subarray(HEADER_LEN - IV_LEN, HEADER_LEN);
  const tag = file.subarray(file.length - TAG_LEN);
  const ciphertext = file.subarray(HEADER_LEN, file.length - TAG_LEN);
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(keyMaterial, salt), iv);
    decipher.setAAD(headerBytes);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new BackupCryptoError(DECRYPT_FAILED);
  }
}
