import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';
import { StorageService } from '../../common/services/storage.service';

// mercadoPagoAccessTokenEncrypted/mercadoPagoWebhookSecretEncrypted
// NUNCA saem daqui — nem criptografados. O frontend só precisa saber SE
// já tem token configurado (pra mostrar "já configurado" vs pedir pra
// colar um), nunca o valor em si.
function toSafeTenant(tenant: Tenant) {
  const { mercadoPagoAccessTokenEncrypted, mercadoPagoWebhookSecretEncrypted, ...safeTenant } =
    tenant;
  return {
    ...safeTenant,
    mercadoPagoConfigured: Boolean(mercadoPagoAccessTokenEncrypted),
  };
}

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly storageService: StorageService,
  ) {}

  // Rota PÚBLICA: o cardápio do cliente final carrega os dados da MARCA
  // (nome, logo, cores) por slug, sem login. Endereço/horário/aberto
  // agora vêm de Location (ver LocationsController) — o cliente escolhe
  // a loja antes de ver o cardápio, e é a location escolhida que
  // responde por isso.
  @Get('public/:slug')
  async findPublicBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    return toSafeTenant(tenant);
  }

  // Rota PROTEGIDA: o dono logado vendo os próprios dados no painel admin.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findMe(@CurrentTenant() tenantId: string) {
    const tenant = await this.tenantsService.findById(tenantId);
    return toSafeTenant(tenant);
  }

  // Rota PROTEGIDA: o dono editando nome, logo, cores, pagamento, etc.
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    const tenant = await this.tenantsService.update(tenantId, dto);
    return toSafeTenant(tenant);
  }

  // Logo — aparece sobrepondo a capa no header do cardápio, e nos
  // avatares onde a foto do estabelecimento é mostrada.
  @UseGuards(JwtAuthGuard)
  @Post('me/logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const logoUrl = await this.storageService.uploadTenantLogo(tenantId, file);
    const tenant = await this.tenantsService.setLogo(tenantId, logoUrl);
    return toSafeTenant(tenant);
  }

  // Banner/capa — a foto grande no topo do header do cardápio, atrás do
  // logo.
  @UseGuards(JwtAuthGuard)
  @Post('me/cover')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCover(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const coverImageUrl = await this.storageService.uploadTenantCoverImage(tenantId, file);
    const tenant = await this.tenantsService.setCoverImage(tenantId, coverImageUrl);
    return toSafeTenant(tenant);
  }
}
