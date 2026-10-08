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
  Header,
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
    mercadoPagoWebhookSecretConfigured: Boolean(mercadoPagoWebhookSecretEncrypted),
  };
}

// Rota PÚBLICA (cardápio do cliente): além dos segredos, tira os parâmetros
// financeiros da aba Análise (CMV estimado, taxas de pagamento, imposto) e a
// preferência de alertas internos — são dados de gestão do dono, nunca do cliente final.
function toPublicTenant(tenant: Tenant) {
  const { defaultCmvPercent, cardFeePercent, pixFeePercent, taxPercent, internalNotificationTarget, ...rest } = toSafeTenant(tenant);
  void defaultCmvPercent;
  void cardFeePercent;
  void pixFeePercent;
  void taxPercent;
  void internalNotificationTarget;
  return rest;
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
  // BUG REAL SUSPEITO (19/09): ícones de rede social apareciam no
  // cardápio genérico mas não no fluxo de mesa, mesmo os dois usando
  // exatamente o mesmo componente/dados — o padrão bate com o
  // navegador guardando em cache uma resposta ANTIGA (de antes dessas
  // colunas existirem) dessa rota específica, já que nada aqui dizia
  // pro navegador pra nunca cachear. Dados do restaurante podem mudar
  // a qualquer momento (o admin acabou de salvar uma rede nova, por
  // exemplo) — nunca devia ser cacheável pra começo de conversa.
  @Header('Cache-Control', 'no-store')
  async findPublicBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    return toPublicTenant(tenant);
  }

  // Rota PROTEGIDA: o dono logado vendo os próprios dados no painel admin.
  // Mesmo raciocínio do `no-store` nas rotas públicas (19/09) — sem isso,
  // o navegador podia servir uma resposta em cache de ANTES de uma foto
  // ser trocada, fazendo logo/capa "sumirem" de volta na próxima vez que
  // esse endpoint fosse consultado (ex: ao trocar de aba no painel),
  // mesmo com o dado certo salvo no banco o tempo todo.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @Header('Cache-Control', 'no-store')
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
