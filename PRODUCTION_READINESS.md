# Production Readiness Report — Timelly

**Date:** 2026-09-27
**Method:** Full audit of `app/api/**/route.ts` (177 route files), `lib/`,
`socket-server/`, `middleware.ts`, `prisma/schema.prisma`, CI config, and env
files, followed by active remediation in the same working tree across
several commits (`6402227` … `a0bca92`, `git log` has the full list).
Verification commands re-run immediately before this report: `npx tsc
--noEmit` (clean), `npx eslint` on every changed file (clean), `npx jest`
(2022/2023 passing — the one failure is a pre-existing, unrelated
`app/api/media/route.test.ts` issue, confirmed present via `git stash`
before any of this work started), and `npx tsx scripts/checkTenantIsolation.ts`
(both checks pass against 177 routes).

**Out of scope, by design:** the two known dormant fee-logic bugs in
`lib/fees/` (pinned by regression tests, zero affected production rows), and
RLS-policy internals owned by a separate workstream in this repo (its
migrations already landed on `main` and are not re-litigated here).

---

## Overall rating: B+ (78/100) — deployable, one Blocker remains

| Area | Rating | Trend |
|---|---|---|
| Tenant isolation | A- | Fixed a real cross-tenant leak; now has a regression-tested static check |
| AuthN / AuthZ | B+ | Login throttled; socket server still open |
| Input validation | B+ | zod on the highest-risk routes; not repo-wide |
| Error handling | A- | Sanitization live on ~99 routes without breaking intentional messages |
| Secrets & config | A | Nothing tracked in git; stray backup file relocated |
| Database / schema | A- | Schema drift closed; one index question resolved (was fine) |
| Payments | A- | Webhook solid; refund and verify races closed; amounts re-derived server-side |
| Realtime (socket server) | C | **Blocker**: CORS still hardcoded (auth itself is fixed) |
| Rate limiting / abuse protection | A- | Covers login, all payment order paths, event registration, public pages |
| Testing & CI | A- | Tenant-isolation check now catches the exact bug class that slipped through once |
| Dead code / hygiene | B | One confirmed-dead route removed; 14 more candidates flagged, not deleted |

**Why B+ and not higher:** one Blocker-severity item is still open
(socket-server CORS), and two Medium items (`NEXTAUTH_URL` HTTPS confirmation,
`payment/webhook` test-coverage confirmation) haven't been independently
verified against the actual deployed environments. Everything else
originally flagged as Blocker or High has been fixed and verified with tests,
not just asserted.

---

## Blocker — fix before next prod deploy

### 1. `socket-server/index.ts` CORS origin is hardcoded to `localhost:3000`

Auth was the actual blocker (any client could connect, join any room, and
inject messages with zero verification) — that's fixed: the server now
verifies the same NextAuth session JWT the main app issues, and scopes
`join-room`/`send-message` to rooms prefixed with the caller's `schoolId`
(`SUPERADMIN` bypasses). What's left is smaller but still wrong for
production: `cors: { origin: "http://localhost:3000" }` will reject every
real deployed origin (mumbai/sydney) unless changed. No frontend integration
currently calls this server (confirmed: zero references to
`join-room`/`send-message`/`receive-message`/`socket.io-client` outside this
file), so nothing breaks today — but it must be env-driven
(`process.env.SOCKET_CORS_ORIGIN`, already read as a fallback in the auth fix)
before any client connects to a non-local deployment.

**Fix:** set `SOCKET_CORS_ORIGIN` per environment, or read it exclusively
(remove the `localhost:3000` default) once every environment has the var set.

---

## High — everything else originally in this bucket is now resolved

| Item | Status |
|---|---|
| Cross-tenant `schoolId` fallback in `fees/discount-approvals` | ✅ Fixed — `requireSchoolId(session)` used unconditionally; regression test asserts the query param is ignored |
| Superadmin "deactivate school" no-op | ✅ Fixed — `prisma.school.update(...)` now actually runs; test suite added |
| No rate limiting anywhere | ✅ Fixed — login, `payment/create-order`, `payment/verify`, `parent/subscription/create-order`, `events/register`, and the public `qr`/`screen`/`download` pages (IP-keyed via `middleware.ts`) |
| Zero `zod` usage on the highest-risk mutating routes | ✅ Fixed — `fees/discount-approvals/[id]`, `fees/offline-payment`, `payment/create-order`, `payment/verify` |
| `TeacherDailyAttendance` invisible to `prisma migrate` | ✅ Fixed — real model + idempotent migration added; runtime `ensureTable()` kept as a safety net, not removed |
| `checkTenantIsolation.ts` wouldn't have caught a fallback-based leak | ✅ Fixed — second check added specifically for `searchParams`/`body.schoolId` reads, with a regression test named after the original bug |
| Socket server: **auth** | ✅ Fixed (see Blocker section above for what's still open — CORS) |

---

## Medium

| Finding | Status |
|---|---|
| Error responses could leak internal details (`error.message` forwarded raw) | ✅ Fixed on ~99 routes. `toClientErrorMessage()` distinguishes a plain application `Error` (this codebase's own convention for short, intentional user-facing messages — kept as-is, even in production) from a Prisma/infra error or non-`Error` throw (redacted to a generic fallback in production only). This distinction was deliberate: a blind redact-everything sweep would have also hidden real validation messages like *"Amount cannot exceed remaining due"* behind a generic error for actual users — verified this doesn't happen via `lib/errors/errorInfo.test.ts`. |
| `.env.sydney.bak` sitting in the repo working tree | ✅ Fixed — moved to a sibling directory outside the repo entirely, not deleted |
| `FeeDiscountApproval.schoolId` possibly unindexed | ✅ Not a bug — re-read the full model; `@@index([schoolId, status, createdAt])` already covers the route's exact query pattern. (An earlier pass had flagged this from a truncated read; corrected.) |
| `payment/refund` double-refund race (TOCTOU between the refundable-amount check and the write) | ✅ Fixed independently, verified: both the check and the write now run inside one transaction |
| `payment/verify` double-credit race (two concurrent verify calls both crediting the same payment) | ✅ Fixed alongside the refund fix: wrapped in a transaction, backed by a partial unique index on `Payment.transactionId` for HyperPG rows |
| `NEXTAUTH_URL` https confirmation across all deployed envs | ⬜ Not independently verified this pass — operational check, not a code fix |
| `payment/webhook` idempotency/signature-fail test coverage | ⬜ Not independently confirmed this pass |
| `tenantCacheKey(` call-site audit for `schoolId` namespacing | ⬜ Spot-checked 2 (`fees/summary`, `discount-approvals`), both correct; not exhaustive |

---

## Low

| Finding | Status |
|---|---|
| Deprecated `app/api/communication/zegoToken/` route (410 stub, self-documented as dead) | ✅ Deleted, along with its test |
| Dead-route sweep beyond the one obvious case | ✅ Performed. All 177 routes cross-referenced against real frontend/service usage. 14 initial candidates narrowed by tracing indirect calls through `lib/api/*.ts` wrappers (several were false positives — e.g. `/api/school/create` and `/api/school/update` are unrelated namesakes of the real, used routes `/api/superadmin/schools/create` and `.../subscription`). **14 routes still show zero traceable caller and no "deprecated" marker** — listed below. **Deliberately not deleted**: a text-search sweep can't rule out a mobile app or other out-of-repo consumer, and some of these (school create/update, admissions bulk-upload) look like real business logic, not obvious leftovers. Treat as a list for the team to confirm against actual traffic/logs, not a deletion queue. |
| `socket-server/index.ts` logs via raw `console.log`/`console.error` | ⬜ Not wired to `lib/logger.ts` this pass |
| Broader `@@index` audit across the rest of the schema's `schoolId` columns | ⬜ Two spot-checked (`FeeDiscountApproval`, `NewsFeed`), both fine; not exhaustive |

**Dead-route candidates (need team confirmation, not deletion by default):**
`admissions/bulk-upload`, `admissions/unconverted`, `certificates/template/create`,
`certificates/template/list`, `exams/term-sections`, `history/student`,
`marks/download`, `parent/subscription/verify`, `school/create`, `school/update`,
`student/offline-payment`, `student/receipt`, `tc/apply`, `teacher/create`.

---

## What's solid (no action needed)

- **Payment webhook** (`payment/webhook/route.ts`): HTTP Basic Auth with
  `crypto.timingSafeEqual`, fails closed if credentials are unset, idempotent
  via a unique constraint, only mutates on real status transitions, wraps
  the mutation in a transaction inside tenant scope.
- **`payment/create-order`** computes the amount server-side against
  `studentFee.remainingFee` rather than trusting the client; **`payment/verify`**
  cross-checks the gateway's reported amount against the client-supplied one
  and rejects on mismatch.
- **Secrets**: `.env`, `.env.mumbai` exist on disk but nothing is tracked in
  git (`.gitignore` covers `.env*`). The only `NEXT_PUBLIC_`-prefixed values
  are Supabase's publishable anon key — meant to be public.
- **SQL injection surface**: every `$queryRawUnsafe`/`$executeRawUnsafe` call
  site checked uses positional parameter placeholders, not string
  interpolation. No injection found; the only residual risk is a future edit
  reintroducing concatenation (not currently enforced by lint).
- **CI**: `.github/workflows/ci.yml` runs `tsc --noEmit`, lint,
  `check:tenant-isolation`, `npx jest`, then `npm run build`, in that order —
  a sound baseline that would have caught most regressions in this report.
- **Tenant scoping infrastructure**: `requireSchoolId()` / `runInTenantScope()`
  are used consistently everywhere except the one now-fixed leak; the
  self-scoped routes that skip an explicit `schoolId` filter (`leaves/my`,
  `marks/download`, `chairman/me`, etc.) all key by the caller's own
  `session.user.id`/`studentId`, which carries no cross-tenant read risk.

---

## Test/build health at time of writing

```
npx tsc --noEmit          → clean
npx eslint <changed files> → clean
npx jest                  → 2022/2023 passing
                             (1 failure: app/api/media/route.test.ts,
                             pre-existing and unrelated — confirmed via
                             `git stash` before this session's changes)
npx tsx scripts/checkTenantIsolation.ts → both checks pass, 177 routes scanned
```

## Commit trail for this remediation

```
6402227  security(fees,payment): close tenant-isolation gap and backfill zod validation
79320d7  security: extend checkTenantIsolation.ts to catch client-controlled schoolId
8f81214  security: add rate limiting to login, payment order creation, event registration
b03e0a9  security: socket-server auth, TeacherDailyAttendance schema, cleanup
4ce53f4  security: extend rate limiting to remaining payment routes and public pages
4ea9c17  security: sanitize error messages returned to API clients
a0bca92  test: mock lib/rateLimit in route tests instead of hitting real Upstash Redis
```

(Interleaved with a concurrent session's own commits on the same branch —
`65f9000` fixed the `payment/refund`/`payment/verify` double-refund and
double-credit races independently; not re-touched here, just verified.)

---

## Remaining checklist

**Blocker**
- [ ] Make `socket-server/index.ts`'s CORS origin env-driven for non-local deployments.

**Medium**
- [ ] Confirm `NEXTAUTH_URL` is https in every deployed environment.
- [ ] Confirm `payment/webhook` has idempotency/signature-fail test coverage.
- [ ] Finish the `tenantCacheKey(` call-site audit beyond the 2 spot-checked.
- [ ] Team confirmation (real traffic/logs) on the 14 dead-route candidates above before deleting any.

**Low**
- [ ] Wire `socket-server/index.ts` logging to `lib/logger.ts`.
- [ ] Broader `@@index` audit across remaining `schoolId` columns.
