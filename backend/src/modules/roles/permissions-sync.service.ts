import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { PERMISSION_CATALOG } from './permissions.catalog';

// Mantém a tabela `permissions` igual ao catálogo em código a cada boot:
// módulo novo = entrada nova no catálogo, sem migration e sem tocar na lógica
// de autorização. Nunca apaga permissões (cargos podem referenciá-las).
@Injectable()
export class PermissionsSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(@InjectRepository(Permission) private readonly repo: Repository<Permission>) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      // upsert → INSERT ... ON CONFLICT (slug) DO UPDATE, totalmente parametrizado.
      await this.repo.upsert(
        PERMISSION_CATALOG.map((d) => ({
          slug: d.slug,
          name: d.name,
          module: d.module,
          description: d.description,
        })),
        ['slug'],
      );
    } catch (err) {
      // Ex.: migration RBAC ainda não aplicada. Não derruba o boot.
      this.logger.error(`Falha ao sincronizar o catálogo de permissões: ${(err as Error).message}`);
    }
  }
}
