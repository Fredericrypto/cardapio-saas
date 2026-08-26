import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CustomersAuthService } from './customers-auth.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { ConfirmCustomerAddressDto } from './dto/confirm-customer-address.dto';
import { SetCustomerPixKeyDto } from './dto/set-customer-pix-key.dto';
import { SetAvatarPresetDto } from './dto/set-avatar-preset.dto';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { RequestCustomer } from '../../common/decorators/current-customer.decorator';
import { StorageService } from '../../common/services/storage.service';

// Rotas do CLIENTE FINAL, sempre por restaurante (/:tenantId na URL) —
// prefixo próprio ('customers'), totalmente separado do controller de
// admin ('auth'). Nenhum destes endpoints importa ou referencia
// AuthModule/AdminUser em lugar nenhum.
@Controller('customers/:tenantId/auth')
export class CustomersController {
  constructor(
    private readonly customersAuthService: CustomersAuthService,
    private readonly storageService: StorageService,
  ) {}

  // Limite mais apertado que o padrão global (60/min) — login e cadastro
  // são exatamente onde faz sentido travar força bruta de senha/e-mail
  // enumeration. 10 tentativas/min por IP é generoso pra uso normal
  // (mesmo errando a senha algumas vezes) e incômodo o bastante pra
  // inviabilizar tentativa automatizada.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  async register(@Param('tenantId') tenantId: string, @Body() dto: RegisterCustomerDto) {
    return this.customersAuthService.register(tenantId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Param('tenantId') tenantId: string, @Body() dto: LoginCustomerDto) {
    return this.customersAuthService.login(tenantId, dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Get('me')
  async me(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(tenantId, customer);
    return this.customersAuthService.findById(tenantId, customer.customerId);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Patch('me')
  async updateProfile(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    this.assertSameTenant(tenantId, customer);
    return this.customersAuthService.updateProfile(tenantId, customer.customerId, dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Patch('me/address')
  async confirmAddress(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Body() dto: ConfirmCustomerAddressDto,
  ) {
    this.assertSameTenant(tenantId, customer);
    return this.customersAuthService.confirmAddress(tenantId, customer.customerId, dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Delete('me/address')
  async removeAddress(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(tenantId, customer);
    return this.customersAuthService.removeAddress(tenantId, customer.customerId);
  }

  // "Carteira Pix" — chave de destino do cliente pra reembolsos, ver
  // comentário no service.
  @UseGuards(CustomerJwtAuthGuard)
  @Patch('me/pix-key')
  async setPixKey(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Body() dto: SetCustomerPixKeyDto,
  ) {
    this.assertSameTenant(tenantId, customer);
    return this.customersAuthService.setPixKey(
      tenantId,
      customer.customerId,
      dto.pixKeyType,
      dto.pixKey,
    );
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Delete('me/pix-key')
  async removePixKey(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    this.assertSameTenant(tenantId, customer);
    return this.customersAuthService.removePixKey(tenantId, customer.customerId);
  }

  // Upload separado do resto do perfil — o cliente escolhe/tira a foto,
  // recebe a URL, e só então ela é salva (mesmo padrão de
  // ProductsController.uploadImage).
  @UseGuards(CustomerJwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertSameTenant(tenantId, customer);
    const avatarUrl = await this.storageService.uploadCustomerAvatar(
      tenantId,
      customer.customerId,
      file,
    );
    return this.customersAuthService.setAvatarUrl(tenantId, customer.customerId, avatarUrl);
  }

  // Avatar predefinido (18 opções fixas) — alternativa ao upload de
  // foto, pra quem prefere não usar uma foto real. `presetId` é validado
  // contra a whitelist fechada no DTO; o cliente nunca manda URL nenhuma
  // diretamente.
  @UseGuards(CustomerJwtAuthGuard)
  @Patch('me/avatar-preset')
  async setAvatarPreset(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
    @Body() dto: SetAvatarPresetDto,
  ) {
    this.assertSameTenant(tenantId, customer);
    return this.customersAuthService.setAvatarPreset(
      tenantId,
      customer.customerId,
      dto.presetId as any,
    );
  }

  // O token pertence a OUTRO restaurante — nunca deixa passar, mesmo que
  // a assinatura seja válida (ela só prova "é um cliente de algum
  // restaurante", não "é cliente DESTE restaurante").
  private assertSameTenant(tenantId: string, customer: RequestCustomer) {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
  }
}
