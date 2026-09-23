# Security Review — Phase 6 (2026-09-23)

Scope: (1) the "fail open to stale JWT on DB error" tradeoff in auth, and
(2) an audit of the RLS/tenant-isolation model against real cross-tenant
attack scenarios. This follows Phase 4 (architecture normalization),
which is complete.

## 1. Fail-open JWT sync — is it still the right call?

**Location**: `lib/auth/authOptions.ts`, `jwt` callback.

```js
const shouldSyncFromDb = (() => {
  if (!token.id) return false;
  const stale = Date.now() - (token._dbSyncAt ?? 0) > 5 * 60 * 1000;
  const missingCritical = token.schoolId == null || token.allowedFeatures == null;
  return stale || missingCritical;
})();

if (shouldSyncFromDb && token.id) {
  try {
    const dbUser = await prisma.user.findUnique({ where: { id: token.id }, select: {...} });
    if (dbUser) { /* refresh token.schoolId, allowedFeatures, image, schoolIsActive; token._dbSyncAt = Date.now() */ }
  } catch (error) {
    console.error("jwt_db_sync_failed", ...);
    // returns the OLD token unchanged — no rethrow
  }
}
```

**What's stale, and for how long**:
- `schoolId`, `allowedFeatures`, `photoUrl` can lag the DB by up to 5
  minutes under normal conditions, and by the full duration of a DB
  outage if the sync keeps failing (`_dbSyncAt` isn't advanced on
  failure, so it keeps retrying every request but never succeeds until
  the DB recovers).
- `role` is **never** re-synced after login at all — a role change or
  downgrade only takes effect on the user's next login or JWT expiry.
- Account deactivation (`password: null`) is checked only in `authorize()`
  at login — an existing session for a deactivated user keeps working
  until the JWT expires, DB outage or not.

**Verdict: still the right call, with two gaps worth closing.**

The core tradeoff is sound: an auth-layer exception should not turn a
transient DB blip into a full outage for every logged-in user across
every tenant. Swallowing the sync failure and continuing with the
existing token is the standard "availability over freshness" choice for
this kind of best-effort cache refresh, and 5 minutes of staleness on
`schoolId`/`allowedFeatures` is a reasonable bound in the common case.

Two things are worth fixing, independent of RLS:

1. **No staleness ceiling during an outage.** If the DB stays down for an
   hour, a user whose `schoolId` or `allowedFeatures` changed at the
   start of that hour keeps their old permissions for the full hour, not
   just 5 minutes. Consider tracking the number of consecutive sync
   failures (or the age since the *last successful* sync) and forcing
   re-authentication past some hard ceiling (e.g. 30–60 min), rather than
   trusting a token indefinitely just because the DB is unavailable.
2. **Deactivation and role are never re-checked outside login.** A
   SUPERADMIN or SCHOOLADMIN demoted mid-session, or a user deactivated
   mid-session, keeps full access until their token naturally expires.
   If session lifetime is long (check `session.maxAge` in
   `authOptions.ts`), this is a meaningful window. Recommend adding
   `isActive`/`role` to the periodic sync payload (already fetching the
   user row; cheap to include) — that closes both gaps with the existing
   fail-open shape intact, since the sync already has its own error
   handling.

Neither gap changes the fail-open decision itself — they tighten what
gets trusted while the sync is working, and how long the app trusts a
sync that stopped working.

## 2. RLS / tenant-isolation audit — critical finding

**RLS as currently configured provides no tenant isolation.**

Migrations `20260923042848_enable_rls_public_tables` and
`20260923043530_enable_rls_prisma_migrations` run
`ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` on ~50 tables, but attach
**zero policies**. The migration's own comment is explicit about scope:
this was done purely to silence Supabase's security advisor for its
auto-generated PostgREST/GraphQL API, which this app never uses — all
reads/writes go through Prisma using the table-owning role. In Postgres,
the owning role bypasses RLS by default regardless of whether RLS is
enabled or how many policies exist. There is no `SET app.current_school_id`,
no `current_setting()` call, and no per-connection tenant context
anywhere in the codebase (confirmed by grep across `.ts`/`.sql`).

**Real isolation is 100% application-level**: every route handler must
call `requireSchoolId(session)` (`lib/auth/tenant.ts`) and thread that
value into every Prisma `where` clause. This includes ~12 route files
that use `$queryRaw`/`$executeRaw`/`$executeRawUnsafe` (e.g.
`app/api/chairman/dashboard/route.ts`, `app/api/exam-subjects/route.ts`,
`app/api/fees/discount-approvals/route.ts`) — spot-checked, and these do
correctly parameterize `schoolId` into the raw SQL, but there is **no
database-level backstop** if a future raw query, or a future Prisma call,
omits it.

### Attack scenarios

| Scenario | Currently blocked by | Residual risk |
|---|---|---|
| Authenticated SCHOOLADMIN of School A requests `/api/student/list?schoolId=B` (tampered param) | Only if the route ignores the client-supplied `schoolId` and uses `requireSchoolId(session)` instead | **Route-by-route**: any handler that trusts a body/query `schoolId` over the session-derived one is exploitable. Not systematically enforced — needs an audit pass (see recommendation below) or a lint rule. |
| A new route/query added later forgets the `schoolId` filter entirely | Nothing — no DB-level check exists | High: this is a straightforward regression risk with zero automated detection today. |
| A raw SQL query (`$queryRaw`) is added without the `schoolId` predicate | Nothing | Same as above, plus raw SQL is easier to get subtly wrong (e.g. a `JOIN` that reintroduces unscoped rows). |
| Compromised app server / stolen DB credentials used directly (bypassing the Next.js app) | Nothing — Prisma's role has full cross-tenant read/write by design | This is normal for a single-tenant-DB SaaS without DB-enforced RLS; only relevant if the threat model includes "attacker with DB credentials but not app code," which is a different tier of compromise. |

### Recommendation

This is a materially weaker isolation model than "DB-enforced RLS," and
the plan phrasing ("audit the new RLS policies") assumed policies exist
that don't. Two paths forward, not mutually exclusive:

1. **Cheap, do first**: add a test/lint safety net for the isolation the
   app already relies on — e.g. a script that greps every
   `app/api/**/route.ts` touching a tenant-scoped model and asserts it
   calls `requireSchoolId`/uses `schoolId` in its Prisma calls, or
   integration tests per tenant-scoped route that assert a School-A
   session cannot read School-B rows (create two seeded tenants in test
   setup, assert 403/404/empty result). This directly tests the actual
   enforcement mechanism instead of a DB feature that isn't wired up.
2. **Bigger lift, optional**: implement genuine DB-level RLS — have
   Prisma connect as a non-owning role for request-scoped queries, add
   `SET LOCAL app.current_school_id = ...` per request/transaction, and
   write a real policy per tenant-scoped table
   (`USING ("schoolId" = current_setting('app.current_school_id')::int)`).
   This is a real architectural change (connection/role management,
   transaction wrapping every request), not a follow-up migration — size
   it separately if the team decides the defense-in-depth is worth it.

Until one of these lands, tenant isolation depends entirely on every
current and future route handler remembering to filter by `schoolId`.
That's the single most important fact to carry into future work on this
codebase — recorded here and in [`CLAUDE.md`](../CLAUDE.md).
