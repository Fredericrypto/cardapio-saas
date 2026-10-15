import sharp = require('sharp');

// Pipeline único de otimização de imagem para TODO upload (logo, banner,
// itens, promoções, categorias, fotos de cliente).
//
// Regras:
//  - redimensiona para caber no tamanho realmente exibido (nunca amplia);
//  - converte para WebP (qualidade 82 por padrão — visualmente idêntico à
//    original em fotos, 70–95% menor);
//  - respeita a orientação EXIF (gira os pixels) e preserva transparência;
//  - NÃO mexe em SVG nem em GIF animado;
//  - se o resultado ficar MAIOR que o original, mantém o original;
//  - qualquer falha devolve o original: otimizar nunca pode impedir um upload.

export interface ImagePreset {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

export const IMAGE_PRESETS = {
  logo: { maxWidth: 512, maxHeight: 512, quality: 85 },
  banner: { maxWidth: 1920, maxHeight: 1080, quality: 82 },
  product: { maxWidth: 1280, maxHeight: 1280, quality: 82 },
  promotion: { maxWidth: 1280, maxHeight: 1280, quality: 82 },
  category: { maxWidth: 800, maxHeight: 800, quality: 82 },
  avatar: { maxWidth: 512, maxHeight: 512, quality: 85 },
} as const satisfies Record<string, ImagePreset>;

export type ImagePresetName = keyof typeof IMAGE_PRESETS;

export interface OptimizedImage {
  buffer: Buffer;
  mimetype: string;
  extension: string;
  // true quando o arquivo foi de fato reencodado (false = original mantido).
  optimized: boolean;
  originalBytes: number;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

function keep(buffer: Buffer, mimetype: string): OptimizedImage {
  return {
    buffer,
    mimetype,
    extension: EXTENSION_BY_MIME[mimetype] ?? 'bin',
    optimized: false,
    originalBytes: buffer.length,
  };
}

export async function optimizeImage(
  input: Buffer,
  mimetype: string,
  preset: ImagePreset | ImagePresetName,
): Promise<OptimizedImage> {
  const cfg: ImagePreset = typeof preset === 'string' ? IMAGE_PRESETS[preset] : preset;
  try {
    if (!mimetype.startsWith('image/') || mimetype === 'image/svg+xml') return keep(input, mimetype);

    const meta = await sharp(input, { animated: true }).metadata();
    if ((meta.pages ?? 1) > 1) return keep(input, mimetype); // GIF/WebP animado

    const output = await sharp(input)
      .rotate() // aplica a orientação EXIF nos pixels (e descarta o EXIF)
      .resize({ width: cfg.maxWidth, height: cfg.maxHeight, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: cfg.quality, effort: 4 })
      .toBuffer();

    if (output.length >= input.length) return keep(input, mimetype);
    return {
      buffer: output,
      mimetype: 'image/webp',
      extension: 'webp',
      optimized: true,
      originalBytes: input.length,
    };
  } catch {
    return keep(input, mimetype);
  }
}

// ------------------------------------------------------------------ telemetria

// Nome (pt-BR) de cada tipo de upload para os logs e métricas.
const PRESET_LABEL: Record<ImagePresetName, string> = {
  logo: 'Logo',
  banner: 'Banner',
  product: 'Produto',
  promotion: 'Promoção',
  category: 'Categoria',
  avatar: 'Cliente',
};

interface ImageTotals {
  uploads: number;
  optimized: number;
  keptOriginal: number;
  originalBytes: number;
  finalBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Agrega o antes/depois de cada upload. Os contadores zeram quando o processo
// reinicia; cada upload também sai numa linha de log (via `setSink`).
export class ImageTelemetry {
  private readonly byLabel = new Map<string, ImageTotals>();
  private sink: ((line: string) => void) | null = null;

  setSink(sink: ((line: string) => void) | null): void {
    this.sink = sink;
  }

  record(label: string, originalBytes: number, finalBytes: number, optimized: boolean): void {
    let t = this.byLabel.get(label);
    if (!t) {
      t = { uploads: 0, optimized: 0, keptOriginal: 0, originalBytes: 0, finalBytes: 0 };
      this.byLabel.set(label, t);
    }
    t.uploads += 1;
    if (optimized) t.optimized += 1;
    else t.keptOriginal += 1;
    t.originalBytes += originalBytes;
    t.finalBytes += finalBytes;

    if (this.sink) {
      const saved = originalBytes > 0 ? ((originalBytes - finalBytes) / originalBytes) * 100 : 0;
      this.sink(
        `Upload ${label}: original ${formatBytes(originalBytes)} -> final ${formatBytes(finalBytes)} ` +
          `(economia ${saved.toFixed(1)}%${optimized ? '' : ', original mantido'})`,
      );
    }
  }

  snapshot() {
    const total: ImageTotals = { uploads: 0, optimized: 0, keptOriginal: 0, originalBytes: 0, finalBytes: 0 };
    const byLabel: Record<string, ImageTotals & { savedBytes: number; savedPercent: number | null }> = {};
    for (const [label, t] of this.byLabel) {
      byLabel[label] = { ...t, ...this.derive(t) };
      total.uploads += t.uploads;
      total.optimized += t.optimized;
      total.keptOriginal += t.keptOriginal;
      total.originalBytes += t.originalBytes;
      total.finalBytes += t.finalBytes;
    }
    return { total: { ...total, ...this.derive(total) }, byLabel };
  }

  reset(): void {
    this.byLabel.clear();
  }

  private derive(t: ImageTotals): { savedBytes: number; savedPercent: number | null } {
    const savedBytes = t.originalBytes - t.finalBytes;
    return {
      savedBytes,
      savedPercent: t.originalBytes > 0 ? Math.round((savedBytes / t.originalBytes) * 1000) / 10 : null,
    };
  }
}

export const imageTelemetry = new ImageTelemetry();

export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size?: number;
}

export interface PreparedUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
  extension: string;
  optimized: boolean;
}

// Ponto de entrada para os uploads: devolve o arquivo pronto para ir ao
// storage (WebP otimizado, ou o original quando não vale a pena) e registra
// a telemetria. Troca a extensão do nome quando o formato muda.
export async function prepareImageUpload(file: UploadedFileLike, preset: ImagePresetName): Promise<PreparedUpload> {
  const result = await optimizeImage(file.buffer, file.mimetype, preset);
  imageTelemetry.record(PRESET_LABEL[preset], result.originalBytes, result.buffer.length, result.optimized);
  const original = file.originalname ?? 'imagem';
  const name = result.optimized ? original.replace(/\.[^./\\]+$/, '') + '.webp' : original;
  return {
    buffer: result.buffer,
    mimetype: result.mimetype,
    originalname: name,
    size: result.buffer.length,
    extension: result.extension,
    optimized: result.optimized,
  };
}
