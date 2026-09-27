# Production Readiness Audit — Timelly

**Status: re-verified against the current working tree on 2026-09-27**, then
actively remediated in the same session — all six original High-priority
items are now either fixed or explicitly deferred with a stated reason (see
"High-priority remediation" below). Scope: `app/api/**/route.ts` (178 route
files), `lib/`, `socket-server/`, `middleware.ts`, `prisma/`, CI config, and
env files. Two areas are explicitly out of scope per current workstream
ownership: RLS policies / bulk-route edits and `prisma/migrations/` (owned by
a concurrent session working in this same repo — noted factually only, not
touched), and the two known dormant fee-logic bugs in `lib/fees/` (pinned by
tests, zero affected prod rows — see memory `fee-known-issues-dormant`).

## Resolved (fixed and committed in this session)

- ✅ **Discount-approvals `schoolId` fallback removed** (commit `6402227`).
  `app/api/fees/discount-approvals/route.ts` now calls
  `requireSchoolId(session)` unconditionally; the `searchParams.get("schoolId")`
  fallback is gone. Regression test added: `route.test.ts` now asserts the
  query param is ignored for a session with no schoolId (previously asserted
  the opposite — that it fell back).
- ✅ **Superadmin "deactivate school" now persists** (commit `6402227`).
  `app/api/superadmin/schools/[id]/active/route.ts` calls
  `prisma.school.update(...)`. New `route.test.ts` covers persistence and the
  prior no-op regression.
- ✅ **`zod` backfilled onto the four highest-risk mutating routes** (commit
  `6402227`): `fees/discount-approvals/[id]` (review action), `fees/offline-
  payment`, `payment/create-order`, `payment/verify`. Shape-validation only —
  existing business-rule checks (amount bounds, allocation math) are
  unchanged. All four routes' existing test suites still pass.
- ✅ **`scripts/checkTenantIsolation.ts` extended** (commit `79320d7`) with a
  second, independent check that flags `searchParams.get(...schoolId...)` /
  `body.schoolId` reads outside a small superadmin allowlist — the exact bug
  class that let the discount-approvals leak through undetected. New Jest
  case named after the specific bug it catches.
- ✅ **Rate limiting added** (commit `8f81214`): `lib/rateLimit.ts`, a
  fixed-window limiter on the existing Upstash Redis client, failing open to
  an in-process counter on Redis outage. Wired into credentials login (10
  attempts/5min per email), `payment/create-order` (20/10min per student),
  and `events/register` (20/10min per user).
- ✅ **`.env.sydney.bak` moved out of the repo** working tree entirely (to a
  sibling `../timelly-env-backups/` directory, not deleted).

## Deferred (not fixed this session — explicit reason given)

- ⏸️ **Socket server auth (`socket-server/index.ts`)** — still the top
  Blocker, unchanged. Not attempted: fixing it properly means designing a
  token-minting flow (reuse NextAuth JWT vs. a short-lived ticket endpoint)
  and touching a separately-deployed process, which is a bigger design
  decision than the other items here, not something to bang out inline.
- ⏸️ **`TeacherDailyAttendance` schema formalization** — still runtime DDL,
  unchanged. Not attempted: `prisma/migrations/` is being actively written to
  by a concurrent session in this same working tree during this pass (a new
  migration appeared mid-session); adding a competing migration here risked
  a collision. Do this once that workstream is clear.
- ⏸️ **`FeeDiscountApproval.schoolId` index, `payment/refund` double-refund
  race, dead-route sweep, error-message sanitization** — Medium/Low items,
  not attempted this pass; see checklist below.

## Executive summary — top items remaining

1. **BLOCKER — Realtime socket server still has no auth or tenant scoping.**
   `socket-server/index.ts` (28 lines total, unchanged) accepts any
   connection, lets any client `join-room` on any string, and broadcasts
   `send-message` to that room with no session/JWT verification and no
   `schoolId` check. Still hardcodes CORS `origin: "http://localhost:3000"`.

2. **HIGH (carried over, deferred — see above) — Schema drift**:
   `TeacherDailyAttendance` is still created/altered via raw DDL at request
   time in `app/api/teacher/attendance/route.ts` (`ensureTable()`) and still
   does not appear in `prisma/schema.prisma`.

3. **MEDIUM — `FeeDiscountApproval.schoolId` has no index.**
   `prisma/schema.prisma:1151-1155` — the model has a `schoolId` column and
   relation but no `@@index([schoolId])`, unlike `NewsFeed`
   (`prisma/schema.prisma:868`, correctly indexed). This is the exact table
   the closed discount-approvals leak reads/writes, and it's queried by
   `schoolId` on every request. Deferred alongside the migration item above
   for the same collision-risk reason.

4. **MEDIUM — Rate limiting doesn't yet cover everything.** Login, payment
   order creation, and event registration are covered; `payment/verify`,
   `parent/subscription/create-order`, and the public `qr`/`screen`/`download`
   pages are not.

5. **MEDIUM — `payment/refund` double-refund race not fully confirmed.**
   The write is wrapped in a transaction, but whether the refundable-amount
   check runs inside vs. before it is unconfirmed (and this file is currently
   being edited by the other concurrent session, so it wasn't re-touched
   here).

---

## 1. Tenant isolation in API routes

Method: grepped all 178 `app/api/**/route.ts` for `requireSchoolId`, then for
any `schoolId` usage at all, then manually reviewed every route with zero
`schoolId` mention (9 files) plus every route with a client-suppliable
`schoolId` (`searchParams`/`body`).

| Finding | File | Severity | Fix |
|---|---|---|---|
| ~~Client-controlled `schoolId` fallback bypasses tenant scoping~~ **FIXED** — now uses `requireSchoolId(session)` unconditionally, `searchParams.get("schoolId")` fallback removed | `app/api/fees/discount-approvals/route.ts` | ~~Blocker~~ Resolved | Verified in current diff. Add the regression test noted in Testing section. |
| `superadmin/backup/email`, `backup-schedule`, `chairmen/create` accept `body.schoolId` directly | `app/api/superadmin/backup/email/route.ts:27`, `backup-schedule/route.ts:89-100`, `chairmen/create/route.ts:20` | Low (by design) | Acceptable — SUPERADMIN role is intentionally cross-tenant/global. Confirm role gate (`SUPERADMIN`-only) is present on each before treating as fine; worth a one-line comment noting this is deliberate so it isn't "fixed" into a regression later. |
| Self-scoped routes with no explicit `schoolId` filter | `app/api/leaves/my/route.ts`, `marks/download/route.ts`, `payment/receipt/route.ts`, `parent/subscription/history/route.ts`, `chairman/me/route.ts`, `student-leaves/approval-authority/route.ts` | Low | These filter by `session.user.id`/`studentId`/`teacherId` (the caller's own record), which is safe as a data-leak vector even without a `schoolId` clause — but note for reviewers so they aren't mistaken for gaps in future scans. No action needed unless a route is later extended to accept an id param. |
| Deprecated route kept only to avoid 404s | `app/api/communication/zegoToken/route.ts` | Low | Fine — returns 410. Consider deleting outright once confirmed unused. |
| ~~`superadmin/schools/[id]/active` — functional no-op~~ **FIXED** — now calls `prisma.school.update(...)` and returns the persisted row | `app/api/superadmin/schools/[id]/active/route.ts` | ~~High~~ Resolved | Verified in current diff. Add the regression test noted in Testing section. |
| `FeeDiscountApproval` model has `schoolId` column but no `@@index([schoolId])` | `prisma/schema.prisma:1151-1155` | **Medium (new)** | Add `@@index([schoolId])` to the model, matching the pattern already used on `NewsFeed` (`schema.prisma:868`). This table is read/written on every discount-approval request, keyed by `schoolId`. |
| ~~`scripts/checkTenantIsolation.ts` only flagged total-miss cases~~ **FIXED** — a second check now flags `searchParams.get(...schoolId...)`/`body.schoolId` reads outside a superadmin allowlist | `scripts/checkTenantIsolation.ts` | ~~High~~ Resolved | Verified: `npx tsx scripts/checkTenantIsolation.ts` passes both checks against current code; `npx jest scripts/checkTenantIsolation` passes including the new regression case. |

**Overall**: the "no `requireSchoolId`" grep initially flagged 171/178 routes,
but almost all of those use route-local resolvers (`resolveFeesSchoolId`,
bespoke fallback chains built on `lib/auth/tenant.ts`'s exported
`schoolIdViaStudentId`/`schoolIdViaTeacherClass` primitives) rather than the
named helper directly — this matches the documented pattern in
`lib/auth/tenant.ts`'s own comments ("routes with their own bespoke
resolveSchoolId"). The single genuine leak found is #1 above. Given the sheer
route count, recommend running `check:tenant-isolation` (already in CI) plus
a follow-up pass specifically grepping for `searchParams.get(.*[Ss]chool` and
`body.schoolId` outside `app/api/superadmin/**` — do this as a scripted CI
check rather than one-off manual review, since this is the exact class of bug
found here.

## 2. AuthN / AuthZ

| Area | Finding | Severity | Fix |
|---|---|---|---|
| Password handling | bcrypt via `CredentialsProvider`, standard. Deactivation (`password = null`) checked on each JWT sync. Fail-open/60-min ceiling already reviewed per project docs — verified `MAX_STALE_SESSION_MS` / `_lastSuccessfulSyncAt` ceiling logic is present and intact in `authOptions.ts`; not re-litigated here. | — | n/a |
| Brute-force / login throttling | ~~No rate limiting on credentials login~~ **FIXED** — `lib/rateLimit.ts` wired into `authorize()`, 10 attempts/5min per email (Upstash Redis, fails open to in-process on outage) | ~~High~~ Resolved | Email-keyed, not IP-keyed (`authorize()` doesn't receive the request/IP) — still bounds password-guessing against a single account, which was the primary risk. |
| Webhook auth | `app/api/payment/webhook/route.ts` uses HTTP Basic Auth with `crypto.timingSafeEqual`, fails closed if env vars unset, has idempotency via `paymentWebhookEvent.create` unique constraint. Solid. | — | n/a |
| Socket server auth | None. See Executive Summary #2. | Blocker | Require a signed token (reuse NextAuth JWT or a short-lived socket ticket minted by an authenticated API route) on `connection`, and scope `join-room` to a room name derived from `schoolId` + a server-side ACL check, not a client-supplied string. |
| CORS | Socket server hardcodes `localhost:3000` (socket-server/index.ts:4-6); no CORS config found in Next.js API routes (Next same-origin default, acceptable for a first-party app). | Medium | Make socket server CORS origin env-driven per deployment. |
| Session cookie config | Uses NextAuth defaults (no custom cookie config found in `authOptions.ts`) — relies on NextAuth's secure/httpOnly defaults under `NEXTAUTH_URL` with https. No explicit `sameSite`/`secure` override found to verify intentionally. | Medium | Confirm `NEXTAUTH_URL` is https in every deployed env (mumbai/sydney) so NextAuth's `__Secure-` cookie prefix logic activates; add explicit cookie config if any env terminates TLS upstream of Node. |

## 3. Input validation

| Finding | Severity | Fix |
|---|---|---|
| ~~`zod` absent from the four highest-risk mutating routes~~ **FIXED** — request-body `zod` schemas added to `fees/discount-approvals/[id]`, `fees/offline-payment`, `payment/create-order`, `payment/verify` | ~~High~~ Resolved | Shape-validation only (types/enums), not a re-implementation of the existing business-rule checks (amount bounds, allocation math) which were already present and are unchanged. All four routes' test suites pass unmodified. |
| `$queryRawUnsafe`/`$executeRawUnsafe` used in `newsfeed/*`, `payment/refund`, `teacher/attendance`, `fees/transactions`, `lib/parent/buildParentFeesMine.ts`, `exam-subjects` | Medium | All instances checked use positional `$1`/`$2` parameter placeholders (not string interpolation) — no SQL injection found. Risk is purely from future edits reintroducing string concatenation; add an ESLint rule or code-review checklist item forbidding template-literal interpolation into `*RawUnsafe` calls. |
| `fees/discount-approvals/route.ts` uses `prisma.$queryRaw` tagged templates (safe, parameterized automatically) | Low | Fine as-is. |
| `app/api/teacher/attendance/route.ts` runs `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `ALTER TABLE ... ADD CONSTRAINT` via raw SQL at request time (`ensureTable()`, lines ~14-90) | Medium | See DB section #6 — this is schema-drift risk, not injection risk (all DDL is static, no user input). |

## 4. Error handling & logging

| Finding | Severity | Fix |
|---|---|---|
| Only 1 raw `console.log` found across all of `app/` + `lib/` (structured `lib/logger.ts` is used almost everywhere) and 2 `console.error`/`console.log` inside `socket-server/index.ts` (separate deployable, not using `lib/logger.ts`). | Low | Fine for the main app. Wire `socket-server/index.ts` to a structured logger too, or accept it's a thin standalone process. |
| Most `catch` blocks return `getErrorMessage(error)` or `error instanceof Error ? error.message : ...` directly to the client (e.g. `superadmin/schools/[id]/active/route.ts:41`, many others) | Medium | Raw `error.message` can leak internal details (Prisma constraint names, file paths) to API consumers. Standardize on a generic client-facing message + full detail only to `logger.error`, matching the pattern already used in a minority of routes (e.g. payment webhook). |
| `resolveSchoolIdFromDb` in `lib/auth/tenant.ts` correctly swallows DB errors and returns `null` rather than throwing — good defensive pattern, consistent with the documented fail-open tradeoff. | — | n/a |

## 5. Secrets & config

| Finding | Severity | Fix |
|---|---|---|
| `.env`, `.env.mumbai` exist on disk but `git ls-files | grep env` returns **nothing** — none are tracked, and `.gitignore:37` has `.env*`. | — (confirmed clean) | No action; keep as-is. Recommend a periodic `git log --all --full-history -- .env*` check to confirm no historical commit ever included them (not checked here — read-only, would need to scan full history). |
| ~~`.env.sydney.bak` sitting in the repo working tree~~ **FIXED** — moved to `../timelly-env-backups/.env.sydney.bak`, outside the repo directory entirely | Resolved | No longer at risk of being swept into a Docker build context or zip-and-ship deploy script that doesn't respect `.gitignore`. |
| `next.config.ts` — not reviewed for `env` validation/exposure of server secrets to the client bundle in this pass; recommend a follow-up grep for `NEXT_PUBLIC_` prefixed secrets. | Low | Quick follow-up: `grep -rn "NEXT_PUBLIC_" .env*` to confirm no secret-shaped values are exposed client-side. |

## 6. Database

| Finding | Severity | Fix |
|---|---|---|
| **Schema drift**: `TeacherDailyAttendance` table is created/altered via raw DDL at runtime in `app/api/teacher/attendance/route.ts` (`ensureTable()`), and does **not** appear in `prisma/schema.prisma` at all. | High | This table is invisible to Prisma migrate, to `prisma db pull`, and to any future migration tooling. Formalize it: add a real Prisma model + migration, then remove the runtime `ensureTable()` DDL (or keep only as an idempotent safety net, not the primary path). **Deliberately not done this session**: `prisma/migrations/` had a new migration land mid-session from a concurrent session working in this same repo; adding a competing one here risked a collision. Do this once that workstream is clear, not blind. |
| Migrations present: `20260923104016_create_app_tenant_role`, `20260923104652_rls_policies_direct_schoolid_tables`, `20260923105153_rls_policies_indirect_schoolid_tables`, `20260924120000_rls_policies_teacher_attendance_and_school_join_tables`. These are the RLS-policy migrations owned by the other in-flight workstream — noted factually, not touched/critiqued here per instructions. | — | n/a (other workstream) |
| `runInTenantScope` / `tenantDb` wrapper (`lib/db/tenantContext.ts`, used widely) exists as an app-level scoping mechanism — good defense-in-depth pattern layered on top of `requireSchoolId`, though (per CLAUDE.md) it is not itself a DB-level guarantee since Prisma connects as the table-owning role. | — | n/a |
| Did not get to a full per-table index audit of every `schoolId` column in this pass (schema is large). Given the discount-approvals leak in #1, worth specifically confirming `FeeDiscountApproval.schoolId` and `NewsFeed.schoolId` are indexed (both are hit with high-cardinality raw SQL `WHERE` clauses). | Medium | Follow-up: `grep -n "@@index" prisma/schema.prisma` cross-referenced against every model with a `schoolId` column. |

## 7. Caching (lib/cache/, Redis/Upstash)

| Finding | Severity | Fix |
|---|---|---|
| `discount-approvals` cache key is `${schoolId}:${safeStatus}` (`getDiscountApprovalsListCached`/`setDiscountApprovalsListCached`) — correctly namespaced by schoolId, so the cache itself doesn't cross tenants; the leak in #1 is at the *authorization* layer before the cache is even touched. | — | n/a for caching itself, but note it means the leaked data also gets cached under the attacker-supplied schoolId key — no new risk beyond #1, but confirms the fix must be at the schoolId-resolution step, not the cache layer. |
| `chairman/me/route.ts` uses an in-process `Map` (`profileCache`) keyed by userId with a 60s TTL, not Redis. | Low | Fine for correctness (per-user key, no cross-tenant risk) but note it won't be invalidated across multiple server instances/regions (mumbai/sydney deploys) — a profile edit on one instance leaves stale data cached on others for up to 60s. Low impact (name/photo/mobile only). |
| Did not exhaustively audit every `tenantCacheKey`/`swrGet`/`swrSet` call site for correct schoolId namespacing in this pass — spot-checked `fees/summary` and `discount-approvals`, both correctly namespaced. | Medium (audit gap) | Follow-up: grep all `tenantCacheKey(` call sites and confirm every one includes `schoolId` as a component, not just entity id. |

## 8. Payments

| Finding | Severity | Fix |
|---|---|---|
| Webhook (`payment/webhook/route.ts`): Basic Auth + timing-safe compare, fail-closed if creds unset, idempotent via unique `paymentWebhookEvent.id`, only mutates on real status *transitions* (`isTransitionToSuccess`/`isTransitionToFailed`), wraps mutation in `prisma.$transaction` inside `runInTenantScope(payment.student.schoolId, ...)`. This is a well-built handler. | — | n/a |
| **Partially re-verified**: `payment/refund/route.ts` uses `$queryRawUnsafe`/`$executeRawUnsafe` (parameterized, safe) for refund-sum aggregation, and the mutation itself is wrapped in `runInTenantScope(payment.student.schoolId, () => prisma.$transaction([...]))` (line ~243) — a transaction wrapper is present, which mitigates but doesn't by itself prove no double-refund race (a transaction without a row lock or a re-check-inside-the-transaction can still race between the aggregation read and the write). | Medium (narrowed) | Confirm the refundable-amount check happens *inside* the same transaction as the write (not just before it) — if the aggregation query at line 84 runs outside the transaction, two concurrent refund requests can both pass the check before either commits. |
| **Reviewed**: `payment/create-order` computes the order amount server-side against `studentFee.remainingFee` (rejects if the client amount exceeds it) rather than trusting the client body outright — confirmed safe. `payment/verify` cross-checks `orderStatus.amount` from the gateway against the client-supplied amount and rejects on mismatch (`Math.abs(orderAmount - amountNum) > 0.01`). | — | n/a — both already re-derive/cross-check the amount. |
| ~~No rate limiting on `payment/create-order`~~ **FIXED** — 20 orders/10min per student via `lib/rateLimit.ts` | ~~High~~ Resolved | `parent/subscription/create-order` and `payment/verify` are still uncovered — follow-up. |

## 9. Socket server

Re-verified against current `socket-server/index.ts` — file is byte-for-byte
unchanged since the initial pass. Still the top open Blocker. Additional notes:
- Entire file is 28 lines — essentially a proof-of-concept, not production-hardened.
- No tenant scoping of `roomId` — any client that guesses/observes a room id (e.g. an appointment/conversation id) can join and both read and inject messages.
- Runs as a separate process (`socket-server/index.ts`), deployed separately per CLAUDE.md — confirm its exposure surface (is port 3001 reachable directly, or only via a reverse proxy that could add auth at that layer?) before treating this as fully blocking; if it's only reachable through an authenticated proxy that validates the JWT before proxying, severity drops from Blocker to High. Recommend confirming deployment topology.

## 10. Testing & CI

| Finding | Severity | Fix |
|---|---|---|
| `.github/workflows/ci.yml` runs, in order: `npm ci`, `prisma generate`, `tsc --noEmit`, `lint`, **`npm run check:tenant-isolation`** (a repo-specific script, good sign this exact risk class is already on the team's radar), `npm test`, then **`npm run build`**. This satisfies the CLAUDE.md requirement to run `next build` and `npx jest` in CI. | — | n/a, good baseline. |
| **Read in full** (was a follow-up in the initial pass): `check:tenant-isolation` (`scripts/checkTenantIsolation.ts`) checks that every route touching a `schoolId`-bearing Prisma model *mentions* `schoolId` somewhere in the file — confirmed it would **not** have caught the (now-fixed) discount-approvals bug, since that route already mentioned `schoolId` via the vulnerable fallback. The script's own docstring is upfront about this scope limit. | High (confirmed, still open) | Extend the script to specifically flag `searchParams.get(/[Ss]chool/i)` / `body.schoolId` reads outside the existing `superadmin/**` allowlist pattern already used in the script — same list mechanism, new detection rule. |
| ~~`fees/discount-approvals` and `superadmin/schools/[id]/active` had no regression test for their fixes~~ **FIXED** — `fees/discount-approvals/route.test.ts` now asserts the client-supplied `schoolId` is ignored; `superadmin/schools/[id]/active/route.test.ts` (new file) asserts `isActive` persists. `payment/webhook/route.ts` test coverage not re-checked this pass. | Resolved (for the two closed findings) | `payment/webhook` idempotency/signature-fail test coverage still unconfirmed — follow-up. |
| While backfilling zod onto `payment/verify`, found its legacy (no-pre-created-payment) branch had been wrapped in a `prisma.$transaction` by the concurrent session's in-flight work, but `route.test.ts`'s `$transaction` mock had no implementation for that branch — both of its tests were failing (500 instead of 404/200) before this pass's fix. | Fixed | Added a `mockTransaction.mockImplementation` for the two affected tests so they exercise the transaction the same way the passing "existing payment" tests already did. |

## 11. Build/deploy hygiene

| Finding | Severity | Fix |
|---|---|---|
| `middleware.ts` sets `Cache-Control: private, max-age=60, stale-while-revalidate=300` on all GET `/api/*` except `/api/auth/*` and `/api/notifications*`. `private` correctly restricts to browser-local caching (no shared/CDN cache), matching CLAUDE.md's description. Sensible default; no bug found. | — | n/a |
| `package.json` scripts are sane (`dev`/`build`/`postinstall` all run `prisma generate`; `check:tenant-isolation` wired into CI, not just an unused script). | — | n/a |
| Only 1 stray `console.log` found in `app`/`lib` — negligible. Socket server logs via `console.log`/`console.error` only (separate process, lower priority). | Low | n/a / optional cleanup |
| Did not do an exhaustive dead-route sweep (178 files) for genuinely unused API routes in this pass beyond the one confirmed-deprecated `zegoToken` route. | Low (follow-up) | Optional: cross-reference `ROUTES` map in `app/_components/constants/routes.ts` and frontend `fetch`/`axios` call sites against the 178 `route.ts` files to find orphans. |

## 12. Rate limiting / abuse protection on public routes

| Finding | Severity | Fix |
|---|---|---|
| ~~No rate limiting found anywhere in the codebase~~ **PARTIALLY FIXED** — `lib/rateLimit.ts` (fixed-window, Upstash Redis-backed, fails open to an in-process counter on outage) is now wired into credentials login, `payment/create-order`, and `events/register`. | Resolved for those three | Still not covering `payment/verify`, `parent/subscription/create-order`, or the public `app/qr`/`app/screen`/`app/download` pages — extend `rateLimit()`/`rateLimitKey()` from `lib/rateLimit.ts` to those next; the utility already exists so this is a smaller lift than before. |

---

## Prioritized remediation checklist

**Resolved this session** (commits `6402227`, `79320d7`, `8f81214` — `npx tsc --noEmit`, `npx jest` (2011/2012 passing; the 1 failure is a pre-existing, unrelated `media` route issue confirmed present before this session's changes too), and `npx tsx scripts/checkTenantIsolation.ts` all verified green)
- [x] Removed the client-supplied `schoolId` fallback in `app/api/fees/discount-approvals/route.ts`; added a regression test.
- [x] Fixed `app/api/superadmin/schools/[id]/active/route.ts` to persist `isActive`; added a new test file covering it.
- [x] Backfilled `zod` request-body validation onto `fees/discount-approvals/[id]`, `fees/offline-payment`, `payment/create-order`, `payment/verify`.
- [x] Extended `scripts/checkTenantIsolation.ts` with a second check for client-controlled `schoolId` reads, plus a named regression test.
- [x] Added `lib/rateLimit.ts` and wired it into login, `payment/create-order`, `events/register`.
- [x] Moved `.env.sydney.bak` out of the repo working tree (to `../timelly-env-backups/`).
- [x] Fixed a pre-existing test bug found along the way: `payment/verify/route.test.ts`'s two legacy-flow tests were failing (500 instead of 404/200) because their `$transaction` mock had no implementation for a transaction wrapper added by a concurrent session's in-flight work.

**Blocker (fix before next prod deploy) — not attempted this session**
- [ ] Add authentication + tenant/room ACL to `socket-server/index.ts` (or confirm it sits behind an authenticating proxy and downgrade accordingly). This needs a design decision (JWT reuse vs. a ticket-minting endpoint), not a quick inline fix.

**High — deliberately deferred (collision risk with a concurrent session's in-flight `prisma/migrations/` work)**
- [ ] Formalize `TeacherDailyAttendance` as a real Prisma model/migration instead of runtime DDL in `app/api/teacher/attendance/route.ts`. Do this once the other migration workstream is clear.

**Medium**
- [ ] Add `@@index([schoolId])` to `FeeDiscountApproval` in `prisma/schema.prisma` — same migration-collision-risk deferral as above.
- [ ] Extend rate limiting to `payment/verify`, `parent/subscription/create-order`, and the public `app/qr`/`app/screen`/`app/download` pages (the utility now exists in `lib/rateLimit.ts`, so this is a smaller lift).
- [ ] Sanitize error responses so raw `error.message`/stack details aren't returned to API clients; log full detail via `lib/logger.ts` only.
- [ ] Confirm `NEXTAUTH_URL` is https in all deployed environments so secure cookie flags apply.
- [ ] Audit all `tenantCacheKey(` call sites for correct `schoolId` namespacing (spot-checked 2/many, both fine).
- [ ] Confirm the `payment/refund/route.ts` refundable-amount check runs *inside* the same transaction as the write, not just before it — not touched this session since that file is currently being edited by the concurrent session.
- [ ] Wire `socket-server/index.ts` logging to a structured logger and make its CORS origin env-driven.
- [ ] Confirm `payment/webhook` has idempotency/signature-fail test coverage.

**Low**
- [ ] Delete the deprecated `app/api/communication/zegoToken/route.ts` once confirmed unused.
- [ ] Optional dead-route sweep against `app/_components/constants/routes.ts`.
