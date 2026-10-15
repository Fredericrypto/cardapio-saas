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
