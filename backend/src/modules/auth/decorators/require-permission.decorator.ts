import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { isValidPermissionSlug } from '../../../common/permissions/permission-matcher';
import { PermissionsGuard } from '../guards/permissions.guard';

export const PERMISSIONS_KEY = 'required_permissions';

// Exige TODAS as permissões listadas. Já inclui JwtAuthGuard + PermissionsGuard
// (nessa ordem), então não é possível usar o decorator "sem o guard" por
// esquecimento.  Ex.:  @RequirePermission('stock:view')
//
// Slug inválido (typo) derruba o boot — melhor do que uma rota silenciosamente
// protegida por uma permissão que nunca existirá.
export const RequirePermission = (...permissions: string[]) => {
  if (permissions.length === 0) {
    throw new Error('@RequirePermission precisa de ao menos uma permissão.');
  }
  for (const slug of permissions) {
    if (!isValidPermissionSlug(slug)) {
      throw new Error(`@RequirePermission: slug de permissão inválido "${slug}".`);
    }
  }
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    UseGuards(JwtAuthGuard, PermissionsGuard),
  );
};
