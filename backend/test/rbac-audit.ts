// Auditoria da lógica PURA do RBAC (sem banco): matcher de permissões wildcard,
// regra anti-escalada (canGrant) e sanitização. Uso:  npm run test:rbac
import { canGrant, canGrantAll, hasAllPermissions, hasPermission, isValidPermissionSlug, permissionMatches } from '../src/common/permissions/permission-matcher';
import { sanitizeText } from '../src/common/sanitize/sanitize-text';
import { PERMISSION_CATALOG, SYSTEM_ROLES, legacyRoleFor } from '../src/modules/roles/permissions.catalog';
import { createChecker } from './helpers';

const t = createChecker();

console.log('— matcher');
t.ok(hasPermission(['*'], 'stock:view'), '"*" concede qualquer permissão');
t.ok(hasPermission(['*'], 'modulo-futuro:qualquer'), '"*" cobre módulo que ainda não existe');
t.ok(hasPermission(['stock:view'], 'stock:view'), 'slug exato concede');
t.ok(!hasPermission(['stock:view'], 'stock:manage'), 'view NÃO concede manage');
t.ok(hasPermission(['stock:*'], 'stock:edit'), 'sub-wildcard stock:* cobre stock:edit');
t.ok(hasPermission(['stock:*'], 'stock:view'), 'sub-wildcard cobre stock:view');
t.ok(!hasPermission(['stock:*'], 'stockroom:view'), 'stock:* NÃO cobre stockroom:view (prefixo parcial)');
t.ok(!hasPermission(['stock:*'], 'orders:view'), 'stock:* NÃO cobre outro módulo');
t.ok(!hasPermission(['stock:*'], 'stock:'), 'stock:* NÃO cobre slug vazio');
t.ok(!hasPermission([], 'orders:view'), 'sem permissões nega');
t.ok(!hasPermission(['orders:view'], '*'), 'quem não tem "*" não satisfaz uma rota que exige "*"');
t.ok(!permissionMatches('orders:*x', 'orders:view'), 'coringa no meio não vale');
t.ok(hasAllPermissions(['a:x', 'b:y'], ['a:x', 'b:y']) && !hasAllPermissions(['a:x'], ['a:x', 'b:y']), 'múltiplas exigidas = TODAS');

console.log('— anti-escalada (canGrant)');
t.ok(canGrant(['*'], '*'), 'wildcard concede "*"');
t.ok(!canGrant(['roles:manage', 'orders:view'], '*'), 'sem "*" NUNCA concede "*"');
t.ok(!canGrant(['orders:view'], 'orders:*'), 'orders:view não concede orders:*');
t.ok(canGrant(['orders:*'], 'orders:*'), 'orders:* concede orders:*');
t.ok(canGrant(['orders:*'], 'orders:manage'), 'orders:* concede orders:manage');
t.ok(!canGrant(['orders:view'], 'orders:manage'), 'não concede o que não possui');
t.ok(canGrantAll(['orders:view', 'tables:view'], ['orders:view']) && !canGrantAll(['orders:view'], ['orders:view', 'tables:view']), 'canGrantAll exige cobrir todas');

console.log('— slugs');
for (const ok of ['*', 'orders:view', 'stock:*', 'rh:view', 'a-b:c-d']) t.ok(isValidPermissionSlug(ok), `válido: ${ok}`);
for (const bad of ['', '**', ':view', 'orders:', 'Orders:view', "orders:view'; DROP TABLE roles;--", 'a:b:c', 'orders view', '*:view', 'x'.repeat(100) + ':a']) t.ok(!isValidPermissionSlug(bad), `inválido: ${bad.slice(0, 30)}`);
t.ok(!isValidPermissionSlug(null) && !isValidPermissionSlug(42), 'não-string é inválido');

console.log('— sanitização (XSS)');
t.ok(sanitizeText('<script>alert(1)</script>Gerente') === 'alert(1)Gerente', 'remove <script>');
t.ok(!/[<>]/.test(sanitizeText('<<script>script>alert(1)<</script>/script>')), 'tags aninhadas não sobrevivem');
t.ok(!/[<>]/.test(sanitizeText('<img src=x onerror=alert(1)>Ola')), 'remove <img onerror>');
t.ok(sanitizeText('  Atendente   Noite \u200B ') === 'Atendente Noite', 'colapsa espaços e zero-width');
t.ok(sanitizeText('a<b') === 'ab', '"<" solto é removido');

console.log('— catálogo / cargos de sistema');
const slugs = new Set(PERMISSION_CATALOG.map((p) => p.slug));
t.ok(slugs.size === PERMISSION_CATALOG.length, 'slugs do catálogo são únicos');
t.ok(PERMISSION_CATALOG.every((p) => isValidPermissionSlug(p.slug)), 'todos os slugs do catálogo são válidos');
t.ok(SYSTEM_ROLES.every((r) => r.permissions.every((s) => slugs.has(s))), 'cargos de sistema só usam permissões do catálogo');
t.ok(SYSTEM_ROLES.find((r) => r.slug === 'admin')?.permissions.join() === '*', 'admin = apenas "*"');
const manager = SYSTEM_ROLES.find((r) => r.slug === 'manager')!;
t.ok(!manager.permissions.includes('roles:manage') && !manager.permissions.includes('settings:manage') && !manager.permissions.includes('*'), 'gerente não gerencia acessos nem configurações');
t.ok(legacyRoleFor('admin', true) === 'owner' && legacyRoleFor('manager', true) === 'manager' && legacyRoleFor('admin', false) === 'staff', 'perfil legado: sistema 1:1; personalizado vira staff');

process.exit(t.finish());
