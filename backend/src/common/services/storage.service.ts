import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// Tipos MIME aceitos e limite de tamanho — nunca confiar só na extensão do
// nome do arquivo, sempre validar o mimetype real recebido pelo multer.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — avatar é bem menor que foto de produto

// O campo `mimetype` do multer vem do header Content-Type que o PRÓPRIO
// CLIENTE manda — um upload malicioso pode muito bem mandar
// "image/png" no header e um arquivo completamente diferente (ex: um
// script) no corpo. Por isso, além de checar `file.mimetype`, confere os
// primeiros bytes de verdade (assinatura do formato) antes de aceitar
// qualquer upload de imagem.
function detectRealImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function assertValidImage(file: Express.Multer.File, maxSizeBytes: number): string {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException('Formato de imagem inválido. Use JPEG, PNG ou WebP.');
  }
  if (file.size > maxSizeBytes) {
    throw new BadRequestException(
      `Imagem muito grande. Limite de ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB.`,
    );
  }
  const realMime = detectRealImageMime(file.buffer);
  if (!realMime || !ALLOWED_MIME_TYPES.includes(realMime)) {
    throw new BadRequestException(
      'O conteúdo do arquivo não corresponde a uma imagem JPEG, PNG ou WebP válida.',
    );
  }
  return realMime;
}

@Injectable()
export class StorageService {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceKey = this.config.get<string>('SUPABASE_SERVICE_KEY');
    this.bucket = this.config.get<string>('SUPABASE_BUCKET', 'cardapio-images');

    if (!url || !serviceKey) {
      throw new Error(
        'SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar definidos no .env',
      );
    }

    this.supabase = createClient(url, serviceKey);
  }

  // tenantId no caminho do arquivo: garante que imagens de estabelecimentos
  // diferentes nunca colidem, e facilita limpeza/auditoria por tenant depois.
  async uploadProductImage(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const realMime = assertValidImage(file, MAX_FILE_SIZE_BYTES);
    const extension = realMime.split('/')[1];
    const path = `${tenantId}/products/${randomUUID()}.${extension}`;
    return this.uploadBuffer(path, file.buffer, realMime);
  }

  // Avatar do cliente — path inclui tenantId E customerId (cliente é por
  // restaurante, não uma conta global; ver Customer entity), então nunca
  // colide entre clientes de restaurantes diferentes nem entre clientes
  // do mesmo restaurante.
  async uploadCustomerAvatar(
    tenantId: string,
    customerId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const realMime = assertValidImage(file, MAX_AVATAR_SIZE_BYTES);
    const extension = realMime.split('/')[1];
    const path = `${tenantId}/customers/${customerId}/avatar-${randomUUID()}.${extension}`;
    return this.uploadBuffer(path, file.buffer, realMime);
  }

  // Banner de promoção — mesmo tratamento de imagem de produto (mesmo
  // limite de tamanho, mesma validação de assinatura de arquivo).
  async uploadPromotionImage(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const realMime = assertValidImage(file, MAX_FILE_SIZE_BYTES);
    const extension = realMime.split('/')[1];
    const path = `${tenantId}/promotions/${randomUUID()}.${extension}`;
    return this.uploadBuffer(path, file.buffer, realMime);
  }

  // Logo do restaurante — aparece no cardápio do cliente sobrepondo a
  // capa (banner), no formato quadrado.
  async uploadTenantLogo(tenantId: string, file: Express.Multer.File): Promise<string> {
    const realMime = assertValidImage(file, MAX_FILE_SIZE_BYTES);
    const extension = realMime.split('/')[1];
    const path = `${tenantId}/branding/logo-${randomUUID()}.${extension}`;
    return this.uploadBuffer(path, file.buffer, realMime);
  }

  // Banner/capa do header do cardápio — a foto grande no topo, atrás do
  // logo.
  async uploadTenantCoverImage(tenantId: string, file: Express.Multer.File): Promise<string> {
    const realMime = assertValidImage(file, MAX_FILE_SIZE_BYTES);
    const extension = realMime.split('/')[1];
    const path = `${tenantId}/branding/cover-${randomUUID()}.${extension}`;
    return this.uploadBuffer(path, file.buffer, realMime);
  }

  private async uploadBuffer(path: string, buffer: Buffer, contentType: string): Promise<string> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(path, buffer, { contentType, upsert: false });

    if (error) {
      throw new BadRequestException(`Falha no upload: ${error.message}`);
    }

    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
