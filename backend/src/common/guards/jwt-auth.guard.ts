import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protege rotas do painel admin. Aplicado com @UseGuards(JwtAuthGuard).
// Depois de validado, request.user = { userId, tenantId, email, role }
// e o @CurrentTenant() decorator usa isso pra filtrar tudo por tenant.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
