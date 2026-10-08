import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AdminUser } from '../auth/admin-user.entity';
import { BackupAuditService } from './backup-audit.service';
import { BackupAuditLog } from './backup-audit-log.entity';
import { BACKUP_STORAGE, BackupStorage, BackupStorageError } from './backup-storage';
import { BackupCryptoError, decryptBackup, encryptBackup, isValidBackupKey, readBackupHeader } from './backup-crypto';
import {
  BackupFormatError,
  parseSnapshot,
  serializeSnapshot,
  sha256Hex,
  type SnapshotDocument,
} from './backup-container';
import {
  BackupPlan,
  BackupPlanError,
  buildPlan,
  loadCatalog,
} from './backup-plan';
import {
  checkCompatibility,
  countTenantRows,
  exportTenantSnapshot,
  restoreTenantSnapshot,
  RestoreIncompatibleError,
  RestoreVerificationError,
} from './backup-engine';
import {
  BACKUP_TIMEZONE,
  nextOccurrenceAfter,
  selectBackupsToPurge,
} from './backup-schedule';
import { TenantBackup } from './tenant-backup.entity';
import type { BackupType } from './tenant-backup.entity';
import {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_RUN_TIME,
  TenantBackupSettings,
} from './tenant-backup-settings.entity';
import type { UpdateBackupSettingsDto, RestoreBackupDto } from './dto/backup-dtos';
import type { BackupActorInfo, RequestContext } from './backup-request-context';
import {
  RESTORE_CONFIRMATION_WORD,
  type BackupAuditItem,
  type BackupItem,
  type BackupOverview,
  type BackupSettingsView,
  type RestorePreview,
  type RestoreSummary,
} from './backups.types';

export class BackupConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupConfigError';
  }
}
class BackupTooLargeError extends Error {}
class SafetyBackupFailedError extends Error {}

const USABLE_STATUSES = ['concluido', 'restaurado'];
const STALE_AFTER_MS = 30 * 60 * 1000;

export interface BackupTuning {
  restoreLockTimeoutMs: number;
  restoreStatementTimeoutMs: number;
  maxEncryptedBytes: number;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof QueryFailedError && (err as unknown as { driverError?: { code?: string } }).driverError?.code === '23505';
}
function pgCode(err: unknown): string | undefined {
  return (err as { driverError?: { code?: string }; code?: string })?.driverError?.code ?? (err as { code?: string })?.code;
}

// Mensagem segura para guardar/mostrar: só erros NOSSOS (mensagens escritas de
// propósito); qualquer outra coisa (driver, rede) vira texto genérico — nunca
// vaza string de conexão, caminho ou stack para a tela.
function safeMessage(err: unknown, fallback: string): string {
  if (
    err instanceof BackupConfigError ||
    err instanceof BackupStorageError ||
    err instanceof BackupCryptoError ||
    err instanceof BackupFormatError ||
    err instanceof BackupPlanError ||
    err instanceof BackupTooLargeError ||
    err instanceof RestoreIncompatibleError ||
    err instanceof RestoreVerificationError ||
    err instanceof SafetyBackupFailedError
  ) {
    return err.message.slice(0, 500);
  }
  return fallback;
}

function fileStamp(date: Date): string {
  // "20261007-040000" no horário de Brasília.
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: BACKUP_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  const digits = s.replace(/\D/g, '');
  return `${digits.slice(0, 8)}-${digits.slice(8, 14)}`;
}

@Injectable()
export class BackupsService {
  readonly tuning: BackupTuning;
  private readonly jobs = new Set<Promise<unknown>>();

  constructor(
    private readonly ds: DataSource,
    @InjectRepository(TenantBackup) private readonly backups: Repository<TenantBackup>,
    @InjectRepository(TenantBackupSettings) private readonly settingsRepo: Repository<TenantBackupSettings>,
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
    private readonly audit: BackupAuditService,
    @Inject(BACKUP_STORAGE) private readonly storage: BackupStorage | null,
    private readonly config: ConfigService,
  ) {
    const num = (key: string, dflt: number) => {
      const n = Number(this.config.get<string>(key));
      return Number.isFinite(n) && n > 0 ? n : dflt;
    };
    this.tuning = {
      restoreLockTimeoutMs: num('BACKUP_RESTORE_LOCK_TIMEOUT_MS', 15_000),
      restoreStatementTimeoutMs: num('BACKUP_RESTORE_STATEMENT_TIMEOUT_MS', 300_000),
      // Limite padrão do plano gratuito do Supabase Storage: 50 MB por arquivo.
      maxEncryptedBytes: num('BACKUP_MAX_FILE_BYTES', 45 * 1024 * 1024),
    };
  }

  // ------------------------------------------------------------ configuração

  private key(): string {
    const key = this.config.get<string>('BACKUP_ENCRYPTION_KEY');
    if (!isValidBackupKey(key)) {
      throw new BackupConfigError(
        'Backups indisponíveis: BACKUP_ENCRYPTION_KEY não está configurada (mínimo 32 caracteres, sem espaços nas pontas).',
      );
    }
    return key;
  }

  private assertConfigured(): void {
    try {
      this.key();
      this.requireStorage();
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private requireStorage(): BackupStorage {
    if (!this.storage) {
      throw new BackupConfigError(
        'Backups indisponíveis: armazenamento não configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY).',
      );
    }
    return this.storage;
  }

  private async loadPlan(): Promise<BackupPlan> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      return buildPlan(await loadCatalog(qr));
    } finally {
      await qr.release();
    }
  }

  private toItem(b: TenantBackup): BackupItem {
    return {
      id: b.id,
      fileName: b.fileName,
      fileSize: b.fileSize,
      backupType: b.backupType,
      status: b.status,
      totalRows: b.totalRows,
      errorMessage: b.errorMessage,
      createdByName: b.createdByName,
      restoreCount: b.restoreCount,
      restoredAt: b.restoredAt ? b.restoredAt.toISOString() : null,
      completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
    };
  }

  private toSettingsView(s: TenantBackupSettings | null): BackupSettingsView {
    return {
      frequencyDays: s?.frequencyDays ?? 0,
      runTime: s?.runTime ?? DEFAULT_RUN_TIME,
      retentionDays: s?.retentionDays ?? DEFAULT_RETENTION_DAYS,
      nextRunAt: s?.nextRunAt ? s.nextRunAt.toISOString() : null,
      lastAutoBackupAt: s?.lastAutoBackupAt ? s.lastAutoBackupAt.toISOString() : null,
    };
  }

  async getOverview(tenantId: string): Promise<BackupOverview> {
    const [settings, rows] = await Promise.all([
      this.settingsRepo.findOne({ where: { tenantId } }),
      this.backups.find({ where: { tenantId }, order: { createdAt: 'DESC' } }),
    ]);
    return {
      settings: this.toSettingsView(settings),
      config: {
        encryptionConfigured: isValidBackupKey(this.config.get<string>('BACKUP_ENCRYPTION_KEY')),
        storageConfigured: this.storage !== null,
        storageDriver: this.storage?.driver ?? null,
      },
      backups: rows.map((b) => this.toItem(b)),
      totalBytes: rows
        .filter((b) => b.status !== 'falhou')
        .reduce((sum, b) => sum + b.fileSize, 0),
      operationInProgress: rows.some((b) => b.status === 'processando' || b.status === 'restaurando'),
    };
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateBackupSettingsDto,
    actor: BackupActorInfo,
    ctx: RequestContext,
  ): Promise<BackupSettingsView> {
    const existing = await this.settingsRepo.findOne({ where: { tenantId } });
    const scheduleChanged =
      !existing || existing.frequencyDays !== dto.frequencyDays || existing.runTime !== dto.runTime;

    let nextRunAt: Date | null;
    if (dto.frequencyDays === 0) nextRunAt = null;
    else if (scheduleChanged || !existing?.nextRunAt) nextRunAt = nextOccurrenceAfter(new Date(), dto.runTime);
    else nextRunAt = existing.nextRunAt; // só a retenção mudou: não reinicia a agenda

    await this.settingsRepo.save(
      this.settingsRepo.create({
        tenantId,
        frequencyDays: dto.frequencyDays,
        runTime: dto.runTime,
        retentionDays: dto.retentionDays,
        nextRunAt,
        lastAutoBackupAt: existing?.lastAutoBackupAt ?? null,
        updatedByUserId: actor.userId,
      }),
    );
    await this.audit.log({
      tenantId,
      action: 'settings_updated',
      userId: actor.userId,
      userEmail: actor.email,
      userRole: actor.role,
      ctx,
      detail: {
        before: existing
          ? { frequencyDays: existing.frequencyDays, runTime: existing.runTime, retentionDays: existing.retentionDays }
          : null,
        after: { frequencyDays: dto.frequencyDays, runTime: dto.runTime, retentionDays: dto.retentionDays },
      },
    });
    return this.toSettingsView(await this.settingsRepo.findOneOrFail({ where: { tenantId } }));
  }

  // ----------------------------------------------------------- criar backup

  // Cria o registro (status "processando") e dispara o trabalho em segundo
  // plano — a requisição responde na hora e a tela acompanha por polling.
  async createBackup(
    tenantId: string,
    type: BackupType,
    actor: BackupActorInfo | null,
    ctx: RequestContext | null,
  ): Promise<TenantBackup> {
    this.assertConfigured(); // falha cedo e claro (503), antes de criar registro
    const row = await this.insertProcessingRow(tenantId, type, actor, ctx);
    const job = this.runBackupJob(row.id).finally(() => this.jobs.delete(job));
    this.jobs.add(job);
    return row;
  }

  // Mesmo fluxo, mas espera terminar (usado pelo backup de segurança antes de
  // restaurar e pelo agendador).
  async createBackupAndWait(
    tenantId: string,
    type: BackupType,
    actor: BackupActorInfo | null,
    ctx: RequestContext | null,
  ): Promise<TenantBackup> {
    this.assertConfigured();
    const row = await this.insertProcessingRow(tenantId, type, actor, ctx);
    await this.runBackupJob(row.id);
    return this.backups.findOneOrFail({ where: { id: row.id } });
  }

  // Testes (e shutdown): espera os trabalhos em segundo plano terminarem.
  async idle(): Promise<void> {
    while (this.jobs.size > 0) await Promise.allSettled([...this.jobs]);
  }

  private async insertProcessingRow(
    tenantId: string,
    type: BackupType,
    actor: BackupActorInfo | null,
    ctx: RequestContext | null,
  ): Promise<TenantBackup> {
    const [tenant] = await this.ds.query(`SELECT slug FROM tenants WHERE id = $1`, [tenantId]);
    if (!tenant) throw new NotFoundException('Estabelecimento não encontrado.');
    const id = randomUUID();
    const now = new Date();
    try {
      await this.backups.insert({
        id,
        tenantId,
        fileName: `${String(tenant.slug).slice(0, 100)}-${fileStamp(now)}.json.gz.enc`,
        storagePath: `${tenantId}/${id}.csbk`,
        backupType: type,
        status: 'processando',
        createdByUserId: actor?.userId ?? null,
        createdByName: actor ? (actor.name ?? actor.email).slice(0, 150) : null,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Já existe um backup ou uma restauração em andamento. Aguarde terminar.');
      }
      throw err;
    }
    await this.audit.log({
      tenantId,
      action: 'backup_started',
      backupId: id,
      userId: actor?.userId ?? null,
      userEmail: actor?.email ?? null,
      userRole: actor?.role ?? null,
      ctx,
      detail: { type },
    });
    return this.backups.findOneOrFail({ where: { id } });
  }

  // Executa o snapshot. Nunca lança: qualquer falha vira status "falhou".
  async runBackupJob(backupId: string): Promise<void> {
    const row = await this.backups.findOne({ where: { id: backupId } });
    if (!row || row.status !== 'processando') return;
    const storage = this.storage;
    try {
      const key = this.key();
      if (!storage) throw new BackupConfigError('Armazenamento de backups não configurado.');
      const plan = await this.loadPlan();
      const doc = await exportTenantSnapshot(this.ds, plan, row.tenantId);
      const enc = encryptBackup(serializeSnapshot(doc), { tenantId: row.tenantId, backupId: row.id }, key);
      if (enc.length > this.tuning.maxEncryptedBytes) {
        throw new BackupTooLargeError(
          `O backup (${(enc.length / 1024 / 1024).toFixed(1)} MB) excede o limite de ${(this.tuning.maxEncryptedBytes / 1024 / 1024).toFixed(0)} MB do armazenamento.`,
        );
      }
      const checksum = sha256Hex(enc);
      await storage.put(row.storagePath, enc);
      // Prova de durabilidade: lê de volta do storage e confere o SHA-256 antes
      // de declarar "concluído" — um backup que não dá pra reler não é backup.
      const back = await storage.get(row.storagePath);
      if (sha256Hex(back) !== checksum) {
        throw new BackupStorageError('O arquivo gravado no storage não confere com o gerado (SHA-256).');
      }
      const tableCounts = Object.fromEntries(doc.tables.map((t) => [t.name, t.rowCount]));
      const totalRows = doc.tables.reduce((s, t) => s + t.rowCount, 0);
      await this.backups.update(
        { id: row.id },
        {
          status: 'concluido',
          fileSize: enc.length,
          checksumSha256: checksum,
          totalRows,
          tableCounts,
          schemaHead: doc.schemaHead,
          completedAt: new Date(),
          errorMessage: null,
        },
      );
      await this.audit.log({
        tenantId: row.tenantId,
        action: 'backup_completed',
        backupId: row.id,
        detail: { bytes: enc.length, totalRows, type: row.backupType },
      });
    } catch (err) {
      console.error('[backups] falha ao gerar backup', row.id, err);
      const message = safeMessage(err, 'Falha inesperada ao gerar o backup. Tente novamente.');
      await this.backups
        .update({ id: row.id }, { status: 'falhou', errorMessage: message, completedAt: new Date() })
        .catch((e) => console.error('[backups] falha ao marcar backup como falhou', e));
      if (storage) await storage.remove(row.storagePath).catch(() => undefined);
      await this.audit.log({
        tenantId: row.tenantId,
        action: 'backup_failed',
        success: false,
        backupId: row.id,
        detail: { message },
      });
    }
  }

  // ----------------------------------------------------------------- leitura

  private async findOwned(tenantId: string, id: string): Promise<TenantBackup> {
    // Sempre filtra por tenant: id de outro restaurante é "não encontrado" (nunca "proibido").
    const row = await this.backups.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Backup não encontrado.');
    return row;
  }

  async listAudit(tenantId: string, limit = 30): Promise<BackupAuditItem[]> {
    const rows: BackupAuditLog[] = await this.audit.list(tenantId, limit);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      success: r.success,
      userEmail: r.userEmail,
      userRole: r.userRole,
      backupId: r.backupId,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getRestorePreview(tenantId: string, backupId: string): Promise<RestorePreview> {
    const backup = await this.findOwned(tenantId, backupId);
    if (!USABLE_STATUSES.includes(backup.status) || !backup.tableCounts) {
      throw new ConflictException('Este backup não está disponível para restauração.');
    }
    const plan = await this.loadPlan();
    const current = await countTenantRows(this.ds, plan, tenantId);
    const names = [...new Set([...plan.tables.map((t) => t.name), ...Object.keys(backup.tableCounts)])].sort();
    const rows = names.map((table) => ({
      table,
      current: current[table] ?? 0,
      inBackup: backup.tableCounts![table] ?? 0,
    }));
    return {
      backupId,
      createdAt: backup.createdAt.toISOString(),
      rows,
      currentTotal: rows.reduce((s, r) => s + r.current, 0),
      backupTotal: rows.reduce((s, r) => s + r.inBackup, 0),
    };
  }

  async downloadBackup(
    tenantId: string,
    backupId: string,
    actor: BackupActorInfo,
    ctx: RequestContext,
  ): Promise<{ file: Buffer; fileName: string }> {
    const backup = await this.findOwned(tenantId, backupId);
    if (!USABLE_STATUSES.includes(backup.status)) {
      throw new ConflictException('Este backup não está disponível para download.');
    }
    await this.audit.logStrict({
      tenantId,
      action: 'backup_downloaded',
      backupId,
      userId: actor.userId,
      userEmail: actor.email,
      userRole: actor.role,
      ctx,
    });
    const file = await this.fetchVerifiedFile(backup);
    return { file, fileName: backup.fileName };
  }

  private async fetchVerifiedFile(backup: TenantBackup): Promise<Buffer> {
    try {
      const file = await this.requireStorage().get(backup.storagePath);
      if (!backup.checksumSha256 || sha256Hex(file) !== backup.checksumSha256) {
        throw new BackupStorageError('O arquivo no storage foi alterado ou está corrompido (SHA-256 não confere).');
      }
      return file;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async deleteBackup(tenantId: string, backupId: string, actor: BackupActorInfo, ctx: RequestContext): Promise<void> {
    const backup = await this.findOwned(tenantId, backupId);
    if (backup.status === 'processando' || backup.status === 'restaurando') {
      throw new ConflictException('Não é possível excluir um backup enquanto ele está em uso.');
    }
    await this.audit.logStrict({
      tenantId,
      action: 'backup_deleted',
      backupId,
      userId: actor.userId,
      userEmail: actor.email,
      userRole: actor.role,
      ctx,
      detail: { fileName: backup.fileName, status: backup.status },
    });
    try {
      await this.requireStorage().remove(backup.storagePath);
    } catch (err) {
      throw this.mapError(err);
    }
    await this.backups.delete({ id: backup.id, tenantId });
  }

  // --------------------------------------------------------------- restaurar

  async restoreBackup(
    tenantId: string,
    backupId: string,
    actor: BackupActorInfo,
    dto: RestoreBackupDto,
    ctx: RequestContext,
  ): Promise<RestoreSummary> {
    const base = {
      tenantId,
      backupId,
      userId: actor.userId,
      userEmail: actor.email,
      userRole: actor.role,
      ctx,
    };
    const backup = await this.findOwned(tenantId, backupId);

    // 1) Palavra de segurança — validada NO SERVIDOR (o botão desabilitado da tela não é segurança).
    if (dto.confirmationWord !== RESTORE_CONFIRMATION_WORD) {
      await this.audit.log({ ...base, action: 'restore_denied', success: false, detail: { reason: 'palavra_incorreta' } });
      throw new BadRequestException(`Digite exatamente ${RESTORE_CONFIRMATION_WORD} para confirmar.`);
    }

    // 2) Senha do administrador logado. 403 (e NÃO 401): o painel desloga o
    //    usuário em qualquer 401, e errar a senha aqui não pode derrubar a sessão.
    const user = await this.users.findOne({ where: { id: actor.userId, tenantId } });
    const passwordOk = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!passwordOk) {
      await this.audit.log({ ...base, action: 'restore_denied', success: false, detail: { reason: 'senha_incorreta' } });
      throw new ForbiddenException('Senha incorreta.');
    }

    if (!USABLE_STATUSES.includes(backup.status)) {
      throw new ConflictException('Este backup não está disponível para restauração.');
    }

    // 3) Sem auditoria, sem restauração.
    await this.audit.logStrict({ ...base, action: 'restore_started', detail: { fileName: backup.fileName } });

    let claimed = false;
    try {
      // 4) Valida TUDO antes de tocar no banco: integridade do arquivo, dono,
      //    descriptografia, formato, hashes por tabela, compatibilidade de schema.
      const file = await this.fetchVerifiedFile(backup);
      const header = readBackupHeader(file);
      if (header.tenantId !== tenantId || header.backupId !== backup.id) {
        throw new BackupCryptoError('Arquivo de backup corrompido, adulterado ou criptografado com outra chave.');
      }
      const doc: SnapshotDocument = parseSnapshot(
        decryptBackup(file, { tenantId, backupId: backup.id }, this.key()),
        tenantId,
      );
      const plan = await this.loadPlan();
      const problems = checkCompatibility(plan, doc);
      if (problems.length > 0) throw new RestoreIncompatibleError(problems.join(' '));

      // 5) Backup de segurança do estado ATUAL — se falhar, nada é restaurado.
      const safety = await this.createBackupAndWait(tenantId, 'pre_restauracao', actor, ctx);
      if (safety.status !== 'concluido') {
        throw new SafetyBackupFailedError(
          `Não foi possível criar o backup de segurança do estado atual (${safety.errorMessage ?? 'erro desconhecido'}). Nada foi restaurado.`,
        );
      }

      // 6) Reivindica o backup-alvo (trava de operação única, no banco).
      const [, claimedRows] = await this.ds.query(
        `UPDATE tenant_backups SET status = 'restaurando', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND status IN ('concluido', 'restaurado')`,
        [backup.id, tenantId],
      );
      if (Number(claimedRows) !== 1) throw new ConflictException('Este backup mudou de estado. Atualize a tela e tente de novo.');
      claimed = true;

      // 7) A restauração atômica propriamente dita.
      const result = await restoreTenantSnapshot(this.ds, plan, tenantId, doc, {
        lockTimeoutMs: this.tuning.restoreLockTimeoutMs,
        statementTimeoutMs: this.tuning.restoreStatementTimeoutMs,
      });

      const restoredAt = new Date();
      await this.backups.update(
        { id: backup.id },
        {
          status: 'restaurado',
          restoredAt,
          restoreCount: backup.restoreCount + 1,
          restoredByUserId: actor.userId,
          restoredByName: (actor.name ?? actor.email).slice(0, 150),
        },
      );
      claimed = false;
      await this.audit.log({
        ...base,
        action: 'restore_completed',
        detail: { totalRows: result.totalRows, safetyBackupId: safety.id },
      });
      return {
        restoredAt: restoredAt.toISOString(),
        totalRows: result.totalRows,
        safetyBackupId: safety.id,
        tables: result.tables,
      };
    } catch (err) {
      if (claimed) {
        // Voltou tudo (ROLLBACK): devolve o backup ao estado anterior.
        const previous = backup.restoreCount > 0 ? 'restaurado' : 'concluido';
        await this.backups
          .update({ id: backup.id, status: 'restaurando' }, { status: previous })
          .catch((e) => console.error('[backups] falha ao reverter status após restore falho', e));
      }
      const mapped = this.mapError(err);
      console.error('[backups] restauração falhou', backupId, err);
      await this.audit.log({
        ...base,
        action: 'restore_failed',
        success: false,
        detail: { message: mapped.message, code: pgCode(err) ?? null },
      });
      throw mapped;
    }
  }

  private mapError(err: unknown): HttpException {
    if (err instanceof HttpException) return err;
    if (err instanceof RestoreIncompatibleError) return new ConflictException(err.message);
    if (err instanceof BackupCryptoError || err instanceof BackupFormatError) {
      return new UnprocessableEntityException(`${err.message} Nenhum dado foi alterado.`);
    }
    if (err instanceof BackupConfigError || err instanceof BackupStorageError) {
      return new ServiceUnavailableException(err.message);
    }
    if (err instanceof RestoreVerificationError || err instanceof SafetyBackupFailedError || err instanceof BackupPlanError) {
      return new InternalServerErrorException(err.message);
    }
    const code = pgCode(err);
    if (code === '55P03' || code === '57014') {
      return new ServiceUnavailableException(
        'O sistema está ocupado (pedidos em andamento). Nenhum dado foi alterado — tente novamente em instantes.',
      );
    }
    return new InternalServerErrorException('Falha na restauração. Nenhum dado foi alterado.');
  }

  // --------------------------------------------- manutenção (usada pelo cron)

  // Operações que ficaram "em andamento" (servidor reiniciou no meio) são
  // encerradas — senão a trava de operação única bloquearia o restaurante pra sempre.
  async recoverStaleOperations(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
    const stale = await this.backups
      .createQueryBuilder('b')
      .where(`b.status IN ('processando', 'restaurando') AND b.updated_at < :cutoff`, { cutoff })
      .getMany();
    for (const b of stale) {
      if (b.status === 'processando') {
        await this.backups.update(
          { id: b.id, status: 'processando' },
          { status: 'falhou', errorMessage: 'Interrompido (o servidor reiniciou ou parou de responder).', completedAt: now },
        );
        if (this.storage) await this.storage.remove(b.storagePath).catch(() => undefined);
      } else {
        await this.backups.update(
          { id: b.id, status: 'restaurando' },
          { status: b.restoreCount > 0 ? 'restaurado' : 'concluido' },
        );
      }
      await this.audit.log({
        tenantId: b.tenantId,
        action: 'stale_operation_recovered',
        success: false,
        backupId: b.id,
        detail: { was: b.status },
      });
    }
    return stale.length;
  }

  // Retenção: apaga os backups mais antigos que o prazo do restaurante (ver
  // selectBackupsToPurge para as regras de proteção).
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const tenantRows: { tenant_id: string }[] = await this.ds.query(`SELECT DISTINCT tenant_id FROM tenant_backups`);
    let deleted = 0;
    for (const { tenant_id: tenantId } of tenantRows) {
      const settings = await this.settingsRepo.findOne({ where: { tenantId } });
      const retention = settings?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      const rows = await this.backups.find({ where: { tenantId } });
      const ids = selectBackupsToPurge(rows, retention, now);
      const removed: string[] = [];
      for (const id of ids) {
        const row = rows.find((r) => r.id === id)!;
        try {
          if (this.storage) await this.storage.remove(row.storagePath);
          await this.backups.delete({ id, tenantId });
          removed.push(id);
        } catch (err) {
          console.error('[backups] retenção: falha ao remover', id, err); // tenta de novo no próximo ciclo
        }
      }
      if (removed.length > 0) {
        deleted += removed.length;
        await this.audit.log({
          tenantId,
          action: 'retention_purged',
          detail: { retentionDays: retention, removed: removed.length, ids: removed.slice(0, 50) },
        });
      }
    }
    return deleted;
  }
}
