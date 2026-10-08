import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestContext {
  ip: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
}

export interface BackupActorInfo {
  userId: string;
  tenantId: string;
  email: string;
  name: string | null;
  role: string;
}

const clip = (v: string | undefined | null, n: number): string | null => (v ? v.slice(0, n) : null);

// IP de origem para a auditoria. Atrás do proxy do Render, req.ip é o IP do
// próprio proxy; o cliente real vem em X-Forwarded-For. O proxy confiável
// ACRESCENTA o IP que viu ao FIM da lista (o começo pode ter sido forjado pelo
// cliente), então usamos a ÚLTIMA entrada como `ip` — e gravamos a lista
// inteira em `forwardedFor`, para que a cadeia completa nunca se perca.
export function extractRequestContext(req: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): RequestContext {
  const rawXff = req.headers?.['x-forwarded-for'];
  const xff = Array.isArray(rawXff) ? rawXff.join(',') : rawXff;
  const chain = (xff ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = chain.length > 0 ? chain[chain.length - 1] : (req.ip ?? req.socket?.remoteAddress ?? null);
  const ua = req.headers?.['user-agent'];
  return {
    ip: clip(ip, 64),
    forwardedFor: clip(xff, 300),
    userAgent: clip(Array.isArray(ua) ? ua[0] : ua, 300),
  };
}

export const RequestCtx = createParamDecorator((_d: unknown, ctx: ExecutionContext): RequestContext =>
  extractRequestContext(ctx.switchToHttp().getRequest()),
);

export const BackupActor = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): BackupActorInfo => ctx.switchToHttp().getRequest().backupActor,
);
