import { Transform } from 'class-transformer';
import { sanitizeText } from './sanitize-text';

// Decorator de DTO: sanitiza strings na entrada (antes da validação).
export const SanitizeText = () =>
  Transform(({ value }) => (typeof value === 'string' ? sanitizeText(value) : value));
