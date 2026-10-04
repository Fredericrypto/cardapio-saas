import { MigrationInterface, QueryRunner } from 'typeorm';

// 03/10/2026 — Toggle "Loja aberta" acompanhando o horário de funcionamento.
// `schedule_open_state` guarda o último estado do horário já refletido no
// toggle; o cron do LocationsService o preenche na primeira passada.
export class LocationScheduleState1757100000003 implements MigrationInterface {
  name = 'LocationScheduleState1757100000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "schedule_open_state" boolean NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "locations" DROP COLUMN IF EXISTS "schedule_open_state"`);
  }
}
