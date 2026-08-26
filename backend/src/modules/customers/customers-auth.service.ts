import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { Customer } from './customer.entity';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { ConfirmCustomerAddressDto } from './dto/confirm-customer-address.dto';
import { GeocodingService } from '../geocoding/geocoding.service';
import { presetAvatarPath } from './preset-avatars';
import type { PresetAvatarId } from './preset-avatars';

const BCRYPT_ROUNDS = 12;

// Tudo aqui é sempre escopado por tenantId — cliente é POR restaurante,
// não global na plataforma (decisão de produto: cada restaurante é uma
// ilha isolada). O mesmo e-mail pode ter contas diferentes em
// restaurantes diferentes, de propósito.
//
// Sobre persistência: TUDO aqui vive no Postgres, não no navegador. O
// único dado guardado no lado do cliente é o token de sessão
// (localStorage) — se ele limpar o cache/dados do navegador, só precisa
// logar de novo; nome, telefone, gênero, avatar e endereço salvo
// continuam intactos no banco.
@Injectable()
export class CustomersAuthService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    // Injetado com o JwtService configurado no CustomersModule, que usa
    // CUSTOMER_JWT_SECRET — NUNCA o JwtService do AuthModule (admin).
    // Ver customers.module.ts.
    private readonly jwtService: JwtService,
    private readonly geocodingService: GeocodingService,
  ) {}

  async register(tenantId: string, dto: RegisterCustomerDto) {
    // E-mail é sempre normalizado (minúsculo, sem espaço nas pontas) antes
    // de checar/salvar — sem isso, "Teste@x.com" e "teste@x.com" viram
    // duas contas diferentes por acaso, o que é confuso e facilita erro
    // de login ("esqueci minha senha" numa conta que nem lembra ter).
    const email = dto.email.trim().toLowerCase();

    const existing = await this.customerRepo.findOne({ where: { tenantId, email } });
    if (existing) {
      throw new ConflictException('Esse e-mail já está cadastrado neste restaurante.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const customer = this.customerRepo.create({
      tenantId,
      email,
      passwordHash,
      name: dto.name.trim(),
      phone: dto.phone ?? null,
    });

    try {
      await this.customerRepo.save(customer);
    } catch (err: any) {
      // Corrida: dois cadastros com o mesmo e-mail (no mesmo restaurante)
      // quase ao mesmo tempo passam pela checagem acima antes de
      // qualquer um salvar — quem chegar depois esbarra na constraint
      // UNIQUE do banco (tenant_id + email). Sem isso, vira um erro 500
      // genérico em vez de uma mensagem que faz sentido.
      if (err?.code === '23505') {
        throw new ConflictException('Esse e-mail já está cadastrado neste restaurante.');
      }
      throw err;
    }

    return this.buildAuthResponse(customer);
  }

  async login(tenantId: string, dto: LoginCustomerDto) {
    const email = dto.email.trim().toLowerCase();
    const customer = await this.customerRepo.findOne({ where: { tenantId, email } });

    // Mensagem genérica de propósito: não revelar se foi o e-mail ou a senha que errou.
    if (!customer) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    return this.buildAuthResponse(customer);
  }

  async findById(tenantId: string, customerId: string) {
    const customer = await this.findEntity(tenantId, customerId);
    return this.toProfileDto(customer);
  }

  async updateProfile(tenantId: string, customerId: string, dto: UpdateCustomerProfileDto) {
    const customer = await this.findEntity(tenantId, customerId);

    if (dto.name !== undefined) customer.name = dto.name.trim();
    if (dto.phone !== undefined) customer.phone = dto.phone;
    if (dto.gender !== undefined) customer.gender = dto.gender;

    await this.customerRepo.save(customer);
    return this.toProfileDto(customer);
  }

  // Geocodifica o endereço estruturado (mesma API — LocationIQ — usada
  // pro endereço do estabelecimento) e salva junto com lat/lng, pra
  // pedidos de entrega futuros preencherem sozinhos, sem recalcular na
  // hora. Roda fora de transação de banco de propósito (chamada de rede
  // externa, mesma regra usada em Tenants/Delivery).
  async confirmAddress(tenantId: string, customerId: string, dto: ConfirmCustomerAddressDto) {
    const customer = await this.findEntity(tenantId, customerId);

    const geocoded = await this.geocodingService.geocodeStructured({
      street: dto.street,
      addressNumber: dto.addressNumber,
      neighborhood: dto.neighborhood,
      city: dto.city,
      state: dto.state,
      postcode: dto.postcode,
    });

    customer.addressStreet = dto.street;
    customer.addressNumber = dto.addressNumber ?? null;
    customer.addressNeighborhood = dto.neighborhood ?? null;
    customer.addressCity = dto.city;
    customer.addressState = dto.state.toUpperCase();
    customer.addressPostcode = dto.postcode ?? null;
    customer.addressReferencePoint = dto.referencePoint ?? null;
    customer.addressFormatted = geocoded.formattedAddress;
    customer.addressLatitude = geocoded.latitude;
    customer.addressLongitude = geocoded.longitude;
    customer.addressPrecise = geocoded.precise;

    await this.customerRepo.save(customer);
    return this.toProfileDto(customer);
  }

  async removeAddress(tenantId: string, customerId: string) {
    const customer = await this.findEntity(tenantId, customerId);
    customer.addressStreet = null;
    customer.addressNumber = null;
    customer.addressNeighborhood = null;
    customer.addressCity = null;
    customer.addressState = null;
    customer.addressPostcode = null;
    customer.addressReferencePoint = null;
    customer.addressFormatted = null;
    customer.addressLatitude = null;
    customer.addressLongitude = null;
    customer.addressPrecise = null;
    await this.customerRepo.save(customer);
    return this.toProfileDto(customer);
  }

  // "Carteira Pix" do cliente — só salva a chave de destino (email,
  // telefone, CPF ou aleatória) pro estabelecimento usar quando precisar
  // devolver dinheiro (reembolso). Nenhum saldo é guardado aqui, nenhum
  // dinheiro passa pela nossa infra — é só um dado de contato, como
  // telefone ou endereço.
  async setPixKey(
    tenantId: string,
    customerId: string,
    pixKeyType: string,
    pixKey: string,
  ) {
    const customer = await this.findEntity(tenantId, customerId);
    customer.pixKeyType = pixKeyType;
    customer.pixKey = pixKey;
    await this.customerRepo.save(customer);
    return this.toProfileDto(customer);
  }

  async removePixKey(tenantId: string, customerId: string) {
    const customer = await this.findEntity(tenantId, customerId);
    customer.pixKeyType = null;
    customer.pixKey = null;
    await this.customerRepo.save(customer);
    return this.toProfileDto(customer);
  }

  async setAvatarUrl(tenantId: string, customerId: string, avatarUrl: string) {
    const customer = await this.findEntity(tenantId, customerId);
    customer.avatarUrl = avatarUrl;
    await this.customerRepo.save(customer);
    return this.toProfileDto(customer);
  }

  // Mesma coisa que setAvatarUrl, mas pra avatar predefinido — o
  // controller já validou que presetId está na whitelist fechada
  // (SetAvatarPresetDto/@IsIn), então aqui só resolve pro caminho real.
  async setAvatarPreset(tenantId: string, customerId: string, presetId: PresetAvatarId) {
    return this.setAvatarUrl(tenantId, customerId, presetAvatarPath(presetId));
  }

  // Usado SÓ pra autenticação opcional na criação de pedido (guest
  // checkout continua funcionando sem token nenhum) — nunca lança
  // exceção, só retorna null se o token estiver ausente/inválido/expirado,
  // não for de fato um token de cliente (claim `type`), OU não pertencer
  // ao MESMO restaurante da URL onde o pedido está sendo criado. Essa
  // última checagem é importante: sem ela, um token válido de cliente do
  // restaurante A poderia, em teoria, ser reaproveitado tentando criar um
  // pedido no restaurante B — aqui isso é tratado como se não houvesse
  // token nenhum (pedido segue como convidado).
  verifyToken(tenantId: string, token: string): { customerId: string } | null {
    try {
      const payload = this.jwtService.verify(token);
      if (payload?.type !== 'customer' || !payload.sub) return null;
      if (payload.tenantId !== tenantId) return null;
      return { customerId: payload.sub };
    } catch {
      return null;
    }
  }

  private async findEntity(tenantId: string, customerId: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new NotFoundException('Conta não encontrada.');
    }
    return customer;
  }

  private toProfileDto(customer: Customer) {
    const hasAddress = Boolean(customer.addressStreet);
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      gender: customer.gender,
      avatarUrl: customer.avatarUrl,
      pixKeyType: customer.pixKeyType,
      pixKey: customer.pixKey,
      address: hasAddress
        ? {
            street: customer.addressStreet,
            number: customer.addressNumber,
            neighborhood: customer.addressNeighborhood,
            city: customer.addressCity,
            state: customer.addressState,
            postcode: customer.addressPostcode,
            referencePoint: customer.addressReferencePoint,
            formatted: customer.addressFormatted,
            latitude: customer.addressLatitude,
            longitude: customer.addressLongitude,
            precise: customer.addressPrecise,
          }
        : null,
    };
  }

  private buildAuthResponse(customer: Customer) {
    const payload = {
      sub: customer.id,
      tenantId: customer.tenantId,
      email: customer.email,
      type: 'customer' as const,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      customer: this.toProfileDto(customer),
    };
  }
}
