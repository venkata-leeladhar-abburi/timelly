import { AsyncLocalStorage } from "async_hooks";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";

/**
 * Request-scoped tenant transaction, for routes whose queries go through
 * shared helpers (lib/fees, lib/school, ...) that import `prisma` directly.
 *
 * `runInTenantScope(schoolId, fn)` opens ONE app_tenant transaction with
 * `app.current_school_id` set (see `withTenantScopedClient`) and stores it in
 * AsyncLocalStorage for the duration of `fn`. Helpers import `tenantDb`
 * instead of `prisma`: inside a scope every call runs on that RLS-restricted
 * transaction; outside a scope (scripts, cron, not-yet-migrated routes) it
 * falls back to the normal owner-role client, i.e. the pre-migration
 * behaviour. Migrating a route = wrapping its DB work in `runInTenantScope`.
 *
 * Limits: one transaction runs its queries serially (no parallelism, no
 * read-collapsing from the shared prisma extension), the transaction cannot
 * open nested `$transaction`s, and it is bounded by TENANT_SCOPE_TIMEOUT_MS.
 */
type TenantTx = Parameters<Parameters<typeof withTenantScopedClient>[1]>[0];

const scopeStorage = new AsyncLocalStorage<TenantTx>();

export const TENANT_SCOPE_TIMEOUT_MS = Number(process.env.TENANT_SCOPE_TIMEOUT_MS) || 30_000;
const TENANT_SCOPE_MAX_WAIT_MS = 10_000;

export function runInTenantScope<T>(schoolId: string, fn: () => Promise<T>): Promise<T> {
  // Already inside a scope (nested helper) - reuse it; never open a second tx.
  if (scopeStorage.getStore()) return fn();
  return withTenantScopedClient(schoolId, (tx) => scopeStorage.run(tx, fn), {
    timeout: TENANT_SCOPE_TIMEOUT_MS,
    maxWait: TENANT_SCOPE_MAX_WAIT_MS,
  });
}

export function isInTenantScope(): boolean {
  return scopeStorage.getStore() !== undefined;
}

export const tenantDb: typeof prisma = new Proxy(prisma, {
  get(_target, prop) {
    const active = (scopeStorage.getStore() ?? prisma) as unknown as Record<string | symbol, unknown>;
    const value = active[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(active) : value;
  },
});

/**
 * For routes with a legitimate unscoped path (a student reading their OWN record,
 * a SUPERADMIN reading across tenants): scope when a schoolId applies, otherwise
 * run on the owner connection exactly as before. Callers must pass a null/undefined
 * schoolId only for those deliberate cases.
 */
export function runInOptionalTenantScope<T>(
  schoolId: string | null | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return schoolId ? runInTenantScope(schoolId, fn) : fn();
}
