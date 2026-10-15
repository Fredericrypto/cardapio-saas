import { ALL_TENANTS } from './tenant-cache';
import type { CacheScope, TenantCache } from './tenant-cache';

type TenantResolver = (args: unknown[]) => string | typeof ALL_TENANTS | null | undefined;

// Marca um método (async) do service que ESCREVE dados: quando ele termina —
// com sucesso ou com erro, porque uma escrita parcial também deixa o cache
// velho — o cache do restaurante nos escopos informados é invalidado.
//
// Convenção: por padrão o restaurante é o 1º argumento do método (todos os
// métodos de OrdersService/TablesService/ProductsService escopados por
// restaurante começam com `tenantId`). Para métodos sem tenantId (ex.: mesa
// por QR code) passe `() => ALL_TENANTS`.
//
// O service precisa ter a propriedade `tenantCache` (injetada com @Optional()).
// Sem ela (ex.: teste que instancia o service à mão) o decorator não faz nada.
export function InvalidatesTenantCache(
  scopes: CacheScope[],
  resolveTenant: TenantResolver = (args) => args[0] as string,
) {
  return function (_target: object, _key: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = async function (this: { tenantCache?: TenantCache }, ...args: unknown[]) {
      try {
        return await original.apply(this, args);
      } finally {
        const cache = this.tenantCache;
        if (cache) {
          const tenant = resolveTenant(args);
          if (tenant === ALL_TENANTS) cache.invalidateAll(scopes);
          else if (typeof tenant === 'string' && tenant) cache.invalidate(tenant, scopes);
        }
      }
    };
    return descriptor;
  };
}
