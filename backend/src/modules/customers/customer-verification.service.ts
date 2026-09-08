import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Customer } from './customer.entity';
import { Tenant } from '../tenants/tenant.entity';
import { StorageService } from '../../common/services/storage.service';
import { PushService } from '../push/push.service';
import type { VerificationRejectionReason } from './verification-rejection-reasons';
import { VERIFICATION_REJECTION_REASON_LABELS } from './verification-rejection-reasons';

// Janela de análise: o admin tem esse prazo pra decidir depois que o
// cliente manda a foto. Passado isso sem decisão, a solicitação é
// recusada automaticamente (nunca aprovada sozinha — decisão tomada
// junto com o Felipe: aprovar automaticamente por inércia do admin
// tornaria "verificado" um selo sem nenhum valor real, já que bastaria
// esperar o prazo passar sem ninguém olhar a foto).
const REVIEW_WINDOW_DAYS = 10;
// Prazo de retenção da própria foto, independente de já ter sido
// decidida ou não — igual ao processo do YouTube citado pelo Felipe:
// nada da imagem em si fica salvo depois desse prazo, só o resultado
// (aprovado/recusado) permanece.
const PHOTO_RETENTION_DAYS = 10;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

@Injectable()
export class CustomerVerificationService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly storageService: StorageService,
    private readonly pushService: PushService,
  ) {}

  private async findCustomer(tenantId: string, customerId: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
    return customer;
  }

  private async tenantSlugAndLogo(tenantId: string): Promise<{ slug: string; logoUrl: string | null }> {
    const tenant = await this.customerRepo.manager
      .getRepository(Tenant)
      .findOne({ where: { id: tenantId }, select: { slug: true, logoUrl: true } });
    return { slug: tenant?.slug ?? '', logoUrl: tenant?.logoUrl ?? null };
  }

  // --- Lado do cliente ---

  async submit(tenantId: string, customerId: string, file: Express.Multer.File) {
    const customer = await this.findCustomer(tenantId, customerId);

    // Regra do Felipe: uma vez verificado, `isVerified` nunca muda de
    // novo por essa via — nem pra reenviar foto faz sentido, já que o
    // selo já está concedido e é permanente (só some excluindo a conta
    // inteira). Bloqueia aqui pra nunca depender só do frontend escondendo
    // o botão.
    if (customer.isVerified) {
      throw new ConflictException('Esse perfil já é verificado.');
    }
    if (customer.verificationStatus === 'pending') {
      throw new ConflictException('Já existe uma verificação em análise pra esse perfil.');
    }

    const photoUrl = await this.storageService.uploadVerificationPhoto(tenantId, customerId, file);
    const now = new Date();

    customer.verificationStatus = 'pending';
    customer.verificationPhotoUrl = photoUrl;
    customer.verificationPhotoDeleteAt = addDays(now, PHOTO_RETENTION_DAYS);
    customer.verificationRequestedAt = now;
    customer.verificationDecidedAt = null;
    customer.verificationRejectionReason = null;
    await this.customerRepo.save(customer);

    return { verificationStatus: customer.verificationStatus };
  }

  async markCongratsSeen(tenantId: string, customerId: string) {
    const customer = await this.findCustomer(tenantId, customerId);
    customer.verificationCongratsPending = false;
    await this.customerRepo.save(customer);
    return { ok: true };
  }

  // --- Lado do admin ---

  async findPending(tenantId: string) {
    const customers = await this.customerRepo.find({
      where: { tenantId, verificationStatus: 'pending' },
      order: { verificationRequestedAt: 'ASC' },
    });
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      gender: c.gender,
      avatarUrl: c.avatarUrl,
      verificationPhotoUrl: c.verificationPhotoUrl,
      verificationRequestedAt: c.verificationRequestedAt,
      // O prazo de 10 dias corre a partir do PEDIDO — devolve pro admin
      // já calculado, pra não duplicar essa conta em cada tela do
      // frontend.
      reviewDeadline: c.verificationRequestedAt
        ? addDays(c.verificationRequestedAt, REVIEW_WINDOW_DAYS)
        : null,
      photoDeleteAt: c.verificationPhotoDeleteAt,
    }));
  }

  // Números do topo da aba — quantos já têm o selo, quantos aguardam
  // análise. Contagem simples, tenant inteiro, sem paginação (não tem
  // motivo de crescer a ponto de pesar — é só um COUNT).
  async countStats(tenantId: string) {
    const [verifiedCount, pendingCount] = await Promise.all([
      this.customerRepo.count({ where: { tenantId, isVerified: true } }),
      this.customerRepo.count({ where: { tenantId, verificationStatus: 'pending' } }),
    ]);
    return { verifiedCount, pendingCount };
  }

  async approve(tenantId: string, customerId: string, adminUserId: string) {
    const customer = await this.findCustomer(tenantId, customerId);
    if (customer.verificationStatus !== 'pending') {
      throw new ConflictException('Essa verificação já foi decidida ou não está em análise.');
    }

    // Regra final do Felipe: a decisão não pode ser desfeita. Aprovar
    // NUNCA reverte pra 'pending'/'rejected' de novo por essa função —
    // só existe o caminho pra frente.
    customer.isVerified = true;
    customer.verificationStatus = 'approved';
    customer.verificationDecidedAt = new Date();
    customer.verificationRejectionReason = null;
    customer.verificationReviewedByAdminId = adminUserId;
    customer.verificationCongratsPending = true;

    // Foto excluída AGORA, não só depois dos 10 dias — pedido explícito
    // do Felipe pra manter o ambiente limpo assim que a decisão sai. O
    // resultado (`photoDeleted`) volta pro admin confirmar que sumiu de
    // verdade.
    const photoDeleted = await this.deletePhotoNow(customer);
    await this.customerRepo.save(customer);

    const { slug, logoUrl } = await this.tenantSlugAndLogo(tenantId);
    await this.pushService.sendToCustomer(tenantId, customer.id, {
      title: 'Você foi verificado!',
      body: 'Seu perfil agora tem o selo de cliente verificado. Toque pra ver.',
      url: `/${slug}/conta-cliente/perfil`,
      tag: 'verification_approved',
      icon: logoUrl ?? undefined,
    });

    return { verificationStatus: customer.verificationStatus, isVerified: customer.isVerified, photoDeleted };
  }

  async reject(
    tenantId: string,
    customerId: string,
    adminUserId: string,
    reason: VerificationRejectionReason,
  ) {
    const customer = await this.findCustomer(tenantId, customerId);
    if (customer.verificationStatus !== 'pending') {
      throw new ConflictException('Essa verificação já foi decidida ou não está em análise.');
    }

    customer.verificationStatus = 'rejected';
    customer.verificationDecidedAt = new Date();
    customer.verificationRejectionReason = VERIFICATION_REJECTION_REASON_LABELS[reason];
    customer.verificationReviewedByAdminId = adminUserId;

    // Mesma lógica do approve — foto sai na hora, não espera os 10 dias.
    const photoDeleted = await this.deletePhotoNow(customer);
    await this.customerRepo.save(customer);

    const { slug, logoUrl } = await this.tenantSlugAndLogo(tenantId);
    await this.pushService.sendToCustomer(tenantId, customer.id, {
      title: 'Sua verificação não foi aprovada',
      body: VERIFICATION_REJECTION_REASON_LABELS[reason] + '. Você pode tentar de novo.',
      url: `/${slug}/conta-cliente/perfil`,
      tag: 'verification_rejected',
      icon: logoUrl ?? undefined,
    });

    return {
      verificationStatus: customer.verificationStatus,
      verificationRejectionReason: customer.verificationRejectionReason,
      photoDeleted,
    };
  }

  // Usado tanto por approve() quanto reject() (decisão manual) quanto
  // pela recusa automática por prazo — sempre que o status deixa de ser
  // 'pending', a foto não tem mais motivo de existir. "Melhor esforço":
  // se o Supabase falhar nesse instante, a decisão AINDA é gravada (não
  // trava aprovar/recusar por causa disso) — o cron de limpeza pega essa
  // foto de qualquer forma quando o prazo de 10 dias vencer, então nada
  // fica esquecido pra sempre, só potencialmente um pouco além do "na
  // hora" nesse caso raro.
  private async deletePhotoNow(customer: Customer): Promise<boolean> {
    if (!customer.verificationPhotoUrl) return true;
    try {
      await this.storageService.deleteByPublicUrl(customer.verificationPhotoUrl);
      customer.verificationPhotoUrl = null;
      customer.verificationPhotoDeleteAt = null;
      return true;
    } catch {
      return false;
    }
  }

  // --- Limpeza automática (cron) ---

  // Roda a cada hora — nem toda instalação vai ter fotos/prazos vencendo
  // o tempo todo, então rodar com essa frequência (em vez de, por
  // exemplo, uma vez por dia) só faz a exclusão/recusa acontecer mais
  // perto da hora exata do prazo, sem custo relevante (a query só faz
  // algo quando existe pelo menos um registro vencido).
  @Cron(CronExpression.EVERY_HOUR)
  async runMaintenanceSweep() {
    await this.autoRejectExpiredReviews();
    await this.purgeExpiredPhotos();
  }

  private async autoRejectExpiredReviews() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.customerRepo.find({
      where: { verificationStatus: 'pending', verificationRequestedAt: LessThanOrEqual(cutoff) },
    });
    for (const customer of expired) {
      customer.verificationStatus = 'rejected';
      customer.verificationDecidedAt = now;
      customer.verificationRejectionReason =
        'O prazo de análise (10 dias) terminou sem uma decisão do estabelecimento. Você pode tentar de novo.';
      await this.deletePhotoNow(customer);
      await this.customerRepo.save(customer);
      try {
        const { slug, logoUrl } = await this.tenantSlugAndLogo(customer.tenantId);
        await this.pushService.sendToCustomer(customer.tenantId, customer.id, {
          title: 'Sua verificação expirou',
          body: 'O prazo de análise terminou sem decisão. Você pode tentar de novo.',
          url: `/${slug}/conta-cliente/perfil`,
          tag: 'verification_rejected',
          icon: logoUrl ?? undefined,
        });
      } catch {
        // Melhor esforço — nunca deixa a notificação falhar impedir a
        // decisão em si de ser gravada (já foi, na linha de cima).
      }
    }
  }

  private async purgeExpiredPhotos() {
    const now = new Date();
    const expired = await this.customerRepo.find({
      where: { verificationPhotoDeleteAt: LessThanOrEqual(now) },
    });
    for (const customer of expired) {
      if (customer.verificationPhotoUrl) {
        try {
          await this.storageService.deleteByPublicUrl(customer.verificationPhotoUrl);
        } catch {
          // Não zera os campos se a exclusão de verdade falhou — melhor
          // tentar de novo na próxima passada do que perder a referência
          // do arquivo e nunca mais conseguir apagá-lo.
          continue;
        }
      }
      // NUNCA mexe em `isVerified`/`verificationStatus` aqui — a foto
      // sumir não desfaz uma decisão já tomada, só remove a imagem em
      // si (regra explícita do Felipe).
      customer.verificationPhotoUrl = null;
      customer.verificationPhotoDeleteAt = null;
      await this.customerRepo.save(customer);
    }
  }
}
