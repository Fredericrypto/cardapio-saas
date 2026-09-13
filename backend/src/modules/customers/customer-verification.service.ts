import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Customer } from './customer.entity';
import { Tenant } from '../tenants/tenant.entity';
import { StorageService } from '../../common/services/storage.service';
import { PushService } from '../push/push.service';
import type { VerificationRejectionReason } from './verification-rejection-reasons';
import { VERIFICATION_REJECTION_REASON_LABELS } from './verification-rejection-reasons';
import { signVerification, verifyVerificationSignature } from '../../common/utils/verification-signature';

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

  // ---------- Integridade (a garantia real, não visual) ----------
  //
  // Resposta direta à preocupação do Felipe: "isVerified" sozinho no
  // banco não prova nada — qualquer acesso direto ao banco (falha de
  // segurança em outra camada, alguém mal-intencionado com acesso de
  // infra) poderia virar esse campo pra true sem passar pela aprovação
  // de verdade. Essa função PURA (sem escrever no banco, rápida,
  // síncrona) é o que TODO lugar do sistema que for MOSTRAR o selo
  // (perfil, "Aí na Mesa", avaliações) precisa chamar — nunca ler
  // `customer.isVerified` cru direto.
  //
  // Recalcula a assinatura HMAC esperada a partir dos campos de
  // auditoria já gravados (quando decidido + qual admin decidiu) e
  // compara com a que foi salva no momento exato da aprovação. Só as
  // duas coisas batendo prova que esse `true` passou pela aprovação de
  // verdade — forjar isso exigiria saber a chave secreta do servidor
  // (VERIFICATION_SIGNING_SECRET), que nunca sai do backend.
  verifyIntegritySync(customer: Customer): boolean {
    if (!customer.isVerified) return false;
    return (
      customer.verificationDecidedAt !== null &&
      customer.verificationReviewedByAdminId !== null &&
      verifyVerificationSignature(
        customer.id,
        customer.tenantId,
        customer.verificationDecidedAt.toISOString(),
        customer.verificationReviewedByAdminId,
        customer.verificationIntegritySignature,
      )
    );
  }

  // Mesma checagem acima, mas com efeito colateral: marca
  // `verificationTamperFlaggedAt` no banco na primeira vez que encontra
  // uma violação (idempotente depois disso) — usada pelo cron de
  // varredura (flagTamperedVerifications) e pela ferramenta de consulta
  // do admin (checkIntegrity), nunca nos caminhos de LEITURA comuns
  // (perfil, mesa, avaliações — esses usam a versão pura acima, pra não
  // precisar de uma escrita no banco só pra MOSTRAR uma tela).
  private async isGenuinelyVerified(customer: Customer): Promise<boolean> {
    const valid = this.verifyIntegritySync(customer);
    if (!valid && customer.isVerified && !customer.verificationTamperFlaggedAt) {
      const flaggedAt = new Date();
      await this.customerRepo.update(customer.id, { verificationTamperFlaggedAt: flaggedAt });
      // Reflete no objeto em memória também — sem isso, quem chamou
      // essa função (ex: checkIntegrity) continuaria vendo o valor
      // antigo (null) mesmo tendo acabado de gravar o novo no banco,
      // já que `.update()` não muda o objeto já carregado.
      customer.verificationTamperFlaggedAt = flaggedAt;
    }
    return valid;
  }

  // Roda junto do cron de hora em hora (ver runMaintenanceSweep) —
  // varre TODOS os clientes com `isVerified=true` e flagra qualquer um
  // cuja assinatura não bate, mesmo que ninguém tenha ido conferir
  // manualmente ainda. Detecção automática, não só sob demanda.
  private async flagTamperedVerifications() {
    const verifiedCustomers = await this.customerRepo.find({
      where: { isVerified: true, verificationTamperFlaggedAt: IsNull() },
    });
    for (const customer of verifiedCustomers) {
      await this.isGenuinelyVerified(customer);
    }
  }

  // Ferramenta de consulta pro admin — "esse cliente é REALMENTE
  // verificado ou não?", com o motivo técnico por trás da resposta,
  // nunca só um selinho bonito. Pedido explícito do Felipe: "deve ter
  // algo que se o estabelecimento precisar ir verificar eles vão
  // realmente saber". Aceita id, e-mail ou telefone.
  async checkIntegrity(tenantId: string, query: string) {
    const customer = await this.customerRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('(c.id::text = :query OR c.email ILIKE :query OR c.phone = :query)', { query })
      .getOne();
    if (!customer) throw new NotFoundException('Cliente não encontrado.');

    const genuinelyVerified = await this.isGenuinelyVerified(customer);
    return {
      customerId: customer.id,
      name: customer.name,
      email: customer.email,
      // Três respostas possíveis, nunca só um true/false genérico:
      // - 'legitimate': isVerified=true E a assinatura bate — selo real.
      // - 'tampered': isVerified=true mas a assinatura NÃO bate — sinal
      //   de adulteração, recomendação de revogar.
      // - 'not_verified': isVerified=false — nunca foi verificado (ou já
      //   foi revogado), nada de suspeito nisso.
      verdict: customer.isVerified
        ? genuinelyVerified
          ? 'legitimate'
          : 'tampered'
        : 'not_verified',
      isVerified: customer.isVerified,
      verificationStatus: customer.verificationStatus,
      verificationDecidedAt: customer.verificationDecidedAt,
      reviewedByAdminId: customer.verificationReviewedByAdminId,
      tamperFlaggedAt: customer.verificationTamperFlaggedAt,
      revokedAt: customer.verificationRevokedAt,
      revokedReason: customer.verificationRevokedReason,
      isSuspended: customer.isSuspended,
      suspendedReason: customer.suspendedReason,
    };
  }

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
    // só existe o caminho pra frente (a única saída depois é REVOGAR,
    // ver revoke() abaixo — ação manual e auditada, não um "desfazer").
    const decidedAt = new Date();
    customer.isVerified = true;
    customer.verificationStatus = 'approved';
    customer.verificationDecidedAt = decidedAt;
    customer.verificationRejectionReason = null;
    customer.verificationReviewedByAdminId = adminUserId;
    customer.verificationCongratsPending = true;
    // Prova criptográfica de que ESSA aprovação passou por aqui de
    // verdade — ver verification-signature.ts. Gravada nesse exato
    // instante, nunca recalculável depois sem os mesmos dados exatos.
    customer.verificationIntegritySignature = signVerification(
      customer.id,
      customer.tenantId,
      decidedAt.toISOString(),
      adminUserId,
    );
    customer.verificationTamperFlaggedAt = null;

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

  // A ÚNICA forma de tirar o selo de alguém já aprovado, além de
  // excluir a conta inteira — pedido explícito do Felipe: "remover a
  // verificação e puni-lo" quando o estabelecimento descobrir que
  // alguém burlou o sistema. Sempre ação manual (nunca automática),
  // sempre com motivo obrigatório, sempre auditada (quem revogou e
  // quando). Some com a assinatura de integridade — se alguém tentasse
  // reverter isso direto no banco, a checagem de isGenuinelyVerified
  // pegaria de novo (voltaria a aparecer como violação).
  async revoke(tenantId: string, customerId: string, adminUserId: string, reason: string) {
    const customer = await this.findCustomer(tenantId, customerId);
    if (!customer.isVerified) {
      throw new ConflictException('Esse cliente não está verificado no momento.');
    }
    if (!reason.trim()) {
      throw new BadRequestException('Informe o motivo da revogação.');
    }

    customer.isVerified = false;
    customer.verificationStatus = 'revoked';
    customer.verificationIntegritySignature = null;
    customer.verificationRevokedAt = new Date();
    customer.verificationRevokedReason = reason.trim();
    customer.verificationRevokedByAdminId = adminUserId;
    await this.customerRepo.save(customer);

    const { slug, logoUrl } = await this.tenantSlugAndLogo(tenantId);
    await this.pushService.sendToCustomer(tenantId, customer.id, {
      title: 'Sua verificação foi revogada',
      body: `O estabelecimento revogou seu selo de verificado. Motivo: ${reason.trim()}`,
      url: `/${slug}/conta-cliente/perfil`,
      tag: 'verification_revoked',
      icon: logoUrl ?? undefined,
    });

    return { verificationStatus: customer.verificationStatus, isVerified: customer.isVerified };
  }

  // "Puni-lo" (pedido do Felipe) além de tirar o selo — bloqueia login
  // enquanto ativo (ver CustomersAuthService.login), sem apagar conta
  // nem histórico. Independente de revogar verificação — o admin pode
  // fazer um sem o outro (ex: suspender por outro motivo qualquer, não
  // só fraude de verificação).
  async suspend(tenantId: string, customerId: string, adminUserId: string, reason: string) {
    const customer = await this.findCustomer(tenantId, customerId);
    if (!reason.trim()) {
      throw new BadRequestException('Informe o motivo da suspensão.');
    }
    customer.isSuspended = true;
    customer.suspendedAt = new Date();
    customer.suspendedReason = reason.trim();
    customer.suspendedByAdminId = adminUserId;
    await this.customerRepo.save(customer);
    return { isSuspended: true };
  }

  async unsuspend(tenantId: string, customerId: string) {
    const customer = await this.findCustomer(tenantId, customerId);
    customer.isSuspended = false;
    customer.suspendedAt = null;
    customer.suspendedReason = null;
    customer.suspendedByAdminId = null;
    await this.customerRepo.save(customer);
    return { isSuspended: false };
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
    await this.flagTamperedVerifications();
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
