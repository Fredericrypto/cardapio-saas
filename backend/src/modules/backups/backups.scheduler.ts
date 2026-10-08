import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { BackupsService } from './backups.service';
import { nextRunAfterCompletion, RETRY_AFTER_FAILURE_MS } from './backup-schedule';

interface ClaimedRow {
  tenant_id: string;
  frequency_days: number;
  run_time: string;
  next_run_at: Date;
}

// Agendador dos backups automáticos. Roda a cada 10 minutos e pega só o que
// está VENCIDO (next_run_at <= agora) — isso dá "catch-up" de graça: se o
// Render (plano grátis) estava dormindo às 04:00, o backup sai assim que o
// servidor acordar e o próximo ciclo passar, em vez de ser perdido.
//
// Cada restaurante vencido é REIVINDICADO por um UPDATE atômico que já
// empurra o próximo horário em 1 h: duas instâncias do servidor (ou dois
// ciclos sobrepostos) nunca fazem o mesmo backup duas vezes, e uma falha vira
// nova tentativa em 1 h (não em 30 dias).
@Injectable()
export class BackupsScheduler {
  private running = false;

  constructor(
    private readonly ds: DataSource,
    private readonly service: BackupsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledTick(): Promise<void> {
    await this.tick(new Date());
  }

  async tick(now: Date): Promise<{ attempted: number; succeeded: number }> {
    if (this.running) return { attempted: 0, succeeded: 0 };
    this.running = true;
    let attempted = 0;
    let succeeded = 0;
    try {
      await this.service.recoverStaleOperations(now).catch((e) => console.error('[backups] recover', e));

      const due: { tenant_id: string }[] = await this.ds.query(
        `SELECT tenant_id FROM tenant_backup_settings WHERE frequency_days > 0 AND next_run_at <= $1 ORDER BY next_run_at`,
        [now],
      );
      for (const { tenant_id: tenantId } of due) {
        const retryAt = new Date(now.getTime() + RETRY_AFTER_FAILURE_MS);
        const [claimedRows]: [ClaimedRow[], number] = await this.ds.query(
          `UPDATE tenant_backup_settings SET next_run_at = $2, updated_at = now()
           WHERE tenant_id = $1 AND frequency_days > 0 AND next_run_at <= $3
           RETURNING tenant_id, frequency_days, run_time, next_run_at`,
          [tenantId, retryAt, now],
        );
        if (!claimedRows || claimedRows.length !== 1) continue; // outra instância pegou
        attempted++;
        const claimed = claimedRows[0];
        try {
          const backup = await this.service.createBackupAndWait(tenantId, 'automatico', null, null);
          if (backup.status !== 'concluido') continue; // fica o retry de +1 h
          // Só avança a agenda se o dono não mexeu nela nesse meio-tempo.
          await this.ds.query(
            `UPDATE tenant_backup_settings
             SET next_run_at = $2, last_auto_backup_at = $3, updated_at = now()
             WHERE tenant_id = $1 AND next_run_at = $4`,
            [
              tenantId,
              nextRunAfterCompletion(now, claimed.frequency_days, claimed.run_time),
              now,
              retryAt,
            ],
          );
          succeeded++;
        } catch (err) {
          console.error('[backups] backup automático falhou', tenantId, err);
        }
      }

      await this.service.purgeExpired(now).catch((e) => console.error('[backups] purge', e));
    } finally {
      this.running = false;
    }
    return { attempted, succeeded };
  }
}
