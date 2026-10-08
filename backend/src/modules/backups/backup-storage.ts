import { promises as fs } from 'fs';
import * as path from 'path';
import type { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const BACKUP_STORAGE = Symbol('BACKUP_STORAGE');

// Armazenamento dos arquivos JÁ CRIPTOGRAFADOS. O conteúdo nunca sai daqui em
// claro, e o bucket NUNCA é público.
export interface BackupStorage {
  readonly driver: 'supabase' | 'local';
  put(objectPath: string, data: Buffer): Promise<void>;
  get(objectPath: string): Promise<Buffer>;
  remove(objectPath: string): Promise<void>; // idempotente: não existir não é erro
}

export class BackupStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupStorageError';
  }
}

// Os caminhos são sempre gerados pelo servidor ("<uuid>/<uuid>.csbk"); mesmo
// assim valida: nada de "..", barras iniciais ou caracteres fora do esperado.
const SAFE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.csbk$/i;
function assertSafePath(objectPath: string): void {
  if (!SAFE_PATH.test(objectPath)) throw new BackupStorageError('Caminho de armazenamento inválido.');
}

// ---- Supabase Storage (bucket PRIVADO) ------------------------------------

export class SupabaseBackupStorage implements BackupStorage {
  readonly driver = 'supabase' as const;
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly client: Pick<SupabaseClient, 'storage'>,
    private readonly bucket: string,
  ) {}

  // Garante que o bucket existe E é privado. Se alguém tiver deixado público,
  // RECUSA (falha fechada): um backup nunca pode ficar numa URL pública.
  private ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        const { data, error } = await this.client.storage.getBucket(this.bucket);
        if (data) {
          if (data.public) {
            throw new BackupStorageError(
              `O bucket "${this.bucket}" está PÚBLICO. Backups só podem ficar em bucket privado — torne-o privado no painel do Supabase.`,
            );
          }
          return;
        }
        const notFound = !error || /not found|does not exist|404/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`);
        if (!notFound) throw new BackupStorageError(`Falha ao consultar o bucket de backups: ${error.message}`);
        const created = await this.client.storage.createBucket(this.bucket, { public: false });
        if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
          throw new BackupStorageError(`Falha ao criar o bucket privado de backups: ${created.error.message}`);
        }
      })().catch((e) => {
        this.bucketReady = null; // tenta de novo na próxima chamada
        throw e;
      });
    }
    return this.bucketReady;
  }

  async put(objectPath: string, data: Buffer): Promise<void> {
    assertSafePath(objectPath);
    await this.ensureBucket();
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(objectPath, data, { contentType: 'application/octet-stream', upsert: false });
    if (error) throw new BackupStorageError(`Falha ao gravar o backup no storage: ${error.message}`);
  }

  async get(objectPath: string): Promise<Buffer> {
    assertSafePath(objectPath);
    await this.ensureBucket();
    const { data, error } = await this.client.storage.from(this.bucket).download(objectPath);
    if (error || !data) throw new BackupStorageError(`Arquivo de backup não encontrado no storage${error ? `: ${error.message}` : '.'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(objectPath: string): Promise<void> {
    assertSafePath(objectPath);
    await this.ensureBucket();
    const { error } = await this.client.storage.from(this.bucket).remove([objectPath]);
    if (error) throw new BackupStorageError(`Falha ao remover o backup do storage: ${error.message}`);
  }
}

// ---- Disco local (SÓ desenvolvimento/testes) ------------------------------
// Em produção (Render) o disco é efêmero: backups se perderiam a cada deploy.
// Por isso só é usado com BACKUP_STORAGE_DRIVER=local explícito.

export class LocalBackupStorage implements BackupStorage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(objectPath: string): string {
    assertSafePath(objectPath);
    const full = path.resolve(this.root, objectPath);
    if (!full.startsWith(this.root + path.sep)) throw new BackupStorageError('Caminho fora do diretório de backups.');
    return full;
  }

  async put(objectPath: string, data: Buffer): Promise<void> {
    const full = this.resolve(objectPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { flag: 'wx', mode: 0o600 });
  }

  async get(objectPath: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(objectPath));
    } catch {
      throw new BackupStorageError('Arquivo de backup não encontrado no storage.');
    }
  }

  async remove(objectPath: string): Promise<void> {
    await fs.rm(this.resolve(objectPath), { force: true });
  }
}

// Fábrica: devolve null quando nada está configurado (o módulo sobe mesmo
// assim; a tela mostra o aviso e as operações recusam com mensagem clara).
export function createBackupStorage(config: Pick<ConfigService, 'get'>): BackupStorage | null {
  const driver = config.get<string>('BACKUP_STORAGE_DRIVER') ?? 'supabase';
  if (driver === 'local') {
    const dir = config.get<string>('BACKUP_LOCAL_DIR');
    return dir ? new LocalBackupStorage(dir) : null;
  }
  const url = config.get<string>('SUPABASE_URL');
  const key = config.get<string>('SUPABASE_SERVICE_KEY');
  if (!url || !key) return null;
  return new SupabaseBackupStorage(createClient(url, key), config.get<string>('BACKUP_BUCKET') ?? 'tenant-backups');
}
