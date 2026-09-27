# Production Readiness Audit — Timelly

**Status: re-verified against the current working tree on 2026-09-27** (the
first pass below was read-only; since then two of the original Blocker/High
findings were fixed in-tree and re-checked here — see "Resolved since initial
pass"). Scope: `app/api/**/route.ts` (178 route files), `lib/`,
`socket-server/`, `middleware.ts`, `prisma/`, CI config, and env files. Two
areas are explicitly out of scope per current workstream ownership: RLS
policies / bulk-route edits (owned elsewhere — noted factually only), and the
two known dormant fee-logic bugs in `lib/fees/` (pinned by tests, zero
affected prod rows — see memory `fee-known-issues-dormant`).

## Resolved since initial pass (verified in current diff)

- ✅ **Discount-approvals `schoolId` fallback removed.**
  `app/api/fees/discount-approvals/route.ts` now calls
  `requireSchoolId(session)` unconditionally and no longer reads
  `searchParams.get("schoolId")` at all. Verified by reading the current
  diff — the vulnerable branch is gone. Original Blocker #1 is closed.
- ✅ **Superadmin "deactivate school" now persists.**
  `app/api/superadmin/schools/[id]/active/route.ts` now calls
  `prisma.school.update({ where: { id }, data: { isActive } })` and returns
  the updated row. Original High #3 is closed.
- ⚠️ Neither fix has an accompanying regression test yet (see Testing
  section) — re-flagging as a Medium follow-up so the fix doesn't silently
  regress.

## Executive summary — top 5 (current, post-fix)

1. **BLOCKER — Realtime socket server still has no auth or tenant scoping.**
   `socket-server/index.ts` (28 lines total, unchanged) accepts any
   connection, lets any client `join-room` on any string, and broadcasts
   `send-message` to that room with no session/JWT verification and no
   `schoolId` check. Still hardcodes CORS `origin: "http://localhost:3000"`.
   Not touched by the recent fixes — still the top blocker.

2. **HIGH — No rate limiting or brute-force protection anywhere.**
   Repo-wide search for rate-limit primitives (`rateLimit`, `RateLimit`,
   throttling, lockout/attempt counters) returns zero hits. This covers
   `/api/auth/[...nextauth]` (credentials login), all public-facing routes
   (`qr`, `screen`, `download`, `events/register`), and the payment
   create-order/verify endpoints. Unchanged from initial pass.

3. **HIGH — `zod` validation still absent from the highest-risk mutating
   routes.** `zod` is now imported in 34 files repo-wide (up from 0 at the
   initial pass — clearly being adopted), but a spot-check of the exact
   routes flagged as highest priority still shows none: `fees/discount-
   approvals/route.ts`, `fees/offline-payment/route.ts`,
   `payment/create-order/route.ts`, and `payment/verify/route.ts` all have
   zero `zod` references. The routes that most need it (money-moving,
   tenant-scoping-relevant) are the ones still on manual validation.

4. **MEDIUM (newly confirmed) — `FeeDiscountApproval.schoolId` has no
   index.** `prisma/schema.prisma:1151-1155` — the model has a `schoolId`
   column and relation but no `@@index([schoolId])`, unlike `NewsFeed`
   (`prisma/schema.prisma:868`, correctly indexed). This is the exact table
   the closed discount-approvals leak (#1 above) reads/writes, and it's
   queried by `schoolId` on every request.

5. **HIGH (carried over, unverified) — Schema drift**: `TeacherDailyAttendance`
   is still created/altered via raw DDL at request time in
   `app/api/teacher/attendance/route.ts` (`ensureTable()`) and still does not
   appear in `prisma/schema.prisma`.

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
| `scripts/checkTenantIsolation.ts` verified — it flags routes with zero `schoolId` mentions, but would **not** have caught the (now-fixed) discount-approvals bug, since that route did mention `schoolId` (via the vulnerable client-supplied fallback) | `scripts/checkTenantIsolation.ts:1-23` (docstring confirms this scope) | High (audit-gap, still open) | Extend the script (or add a second one) to specifically flag `searchParams.get(/[Ss]chool/)` and `body.schoolId` reads outside `app/api/superadmin/**` — this is the exact bug class that slipped through, and the fix pattern is now proven (see the discount-approvals fix). |

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
| Brute-force / login throttling | No rate limiting on credentials login. | High | Add IP+email based throttling (e.g. Upstash Redis, already a dependency, counter with TTL) in front of the NextAuth credentials `authorize()` callback or via middleware on `/api/auth/callback/credentials`. |
| Webhook auth | `app/api/payment/webhook/route.ts` uses HTTP Basic Auth with `crypto.timingSafeEqual`, fails closed if env vars unset, has idempotency via `paymentWebhookEvent.create` unique constraint. Solid. | — | n/a |
| Socket server auth | None. See Executive Summary #2. | Blocker | Require a signed token (reuse NextAuth JWT or a short-lived socket ticket minted by an authenticated API route) on `connection`, and scope `join-room` to a room name derived from `schoolId` + a server-side ACL check, not a client-supplied string. |
| CORS | Socket server hardcodes `localhost:3000` (socket-server/index.ts:4-6); no CORS config found in Next.js API routes (Next same-origin default, acceptable for a first-party app). | Medium | Make socket server CORS origin env-driven per deployment. |
| Session cookie config | Uses NextAuth defaults (no custom cookie config found in `authOptions.ts`) — relies on NextAuth's secure/httpOnly defaults under `NEXTAUTH_URL` with https. No explicit `sameSite`/`secure` override found to verify intentionally. | Medium | Confirm `NEXTAUTH_URL` is https in every deployed env (mumbai/sydney) so NextAuth's `__Secure-` cookie prefix logic activates; add explicit cookie config if any env terminates TLS upstream of Node. |

## 3. Input validation

| Finding | Severity | Fix |
|---|---|---|
| **Updated**: `zod` is now imported in 34 files repo-wide (up from 0 at the initial pass) — adoption is underway. However a targeted re-check of the routes this report calls out as highest priority (`fees/discount-approvals`, `fees/offline-payment`, `payment/create-order`, `payment/verify`) shows **zero** `zod` usage in any of the four. | High (narrowed) | Not "introduce zod" anymore — it's adopted elsewhere. Specifically backfill `zod` schemas onto the four money/tenant-scoping routes named above before treating input validation as resolved; they're the ones a leak or a bad payment amount would actually come through. |
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
| `.env`, `.env.mumbai`, `.env.sydney.bak` exist on disk but `git ls-files | grep env` returns **nothing** — none are tracked, and `.gitignore:37` has `.env*`. | — (confirmed clean) | No action; keep as-is. Recommend a periodic `git log --all --full-history -- .env*` check to confirm no historical commit ever included them (not checked here — read-only, would need to scan full history). |
| `.env.sydney.bak` — a `.bak` extension for an env file sitting in the working tree is unusual; if this or similar bak/backup files are ever copied into a Docker build context or a deploy artifact without respecting `.gitignore` (which only protects git, not arbitrary file copies), secrets could leak into an image layer. | Medium | Move stale/backup env files out of the repo directory entirely (e.g. into a secrets manager or outside the working tree), since `.gitignore` doesn't protect non-git copy operations (`COPY . .` in a naive Dockerfile, zip-and-ship deploy scripts, etc). |
| `next.config.ts` — not reviewed for `env` validation/exposure of server secrets to the client bundle in this pass; recommend a follow-up grep for `NEXT_PUBLIC_` prefixed secrets. | Low | Quick follow-up: `grep -rn "NEXT_PUBLIC_" .env*` to confirm no secret-shaped values are exposed client-side. |

## 6. Database

| Finding | Severity | Fix |
|---|---|---|
| **Schema drift**: `TeacherDailyAttendance` table is created/altered via raw DDL at runtime in `app/api/teacher/attendance/route.ts` (`ensureTable()`), and does **not** appear in `prisma/schema.prisma` at all. | High | This table is invisible to Prisma migrate, to `prisma db pull`, and to any future migration tooling; it also means the "any pending migrations" check is incomplete by definition — a table Prisma doesn't know about can't have a pending migration. Formalize it: add a real Prisma model + migration, then remove the runtime `ensureTable()` DDL (or keep only as an idempotent safety net, not the primary path). |
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
| `payment/create-order` and `payment/verify` not reviewed line-by-line in this pass. | Medium (follow-up) | Follow-up: confirm order amount is computed server-side from the fee/product record, never trusted from client body. |
| No rate limiting on `payment/create-order` / `parent/subscription/create-order` (consistent with global finding in AuthN section). | High | Same fix as #4 — add rate limiting, particularly here since repeated order creation could be used for gateway abuse/testing stolen cards. |

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
| No dedicated payment/webhook or auth-flow test files spotted by name in initial route listing (route-adjacent `*.test.ts` files exist for several routes reviewed: `exam-subjects`, `fees/transactions`, `newsfeed/*`, `payment/refund`, `teacher/attendance` all have `route.test.ts` siblings). Did not confirm `payment/webhook/route.ts` or `discount-approvals/route.ts` themselves have tests. | Medium | Add/confirm `route.test.ts` for `payment/webhook` (idempotency + signature-fail cases) and `fees/discount-approvals` (specifically: a test asserting a client-supplied `schoolId` for a session that has one is *ignored*, once fixed). |

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
| No rate limiting found anywhere in the codebase (repo-wide grep for rate-limit primitives returned zero results), including `app/qr`, `app/screen`, `app/download`, `app/events`, and `events/register` / `events/[id]/registrations` API routes, which are the most likely to be hit by scripted abuse (registration spam, QR/download scraping). | High | Add a shared rate-limit middleware using the existing Upstash Redis dependency (`@upstash/redis` is already in `package.json`), applied at minimum to: login, event registration, payment order creation, and any route under `app/qr`/`app/screen`/`app/download` that serves without auth. |

---

## Prioritized remediation checklist

**Resolved (verified fixed in current working tree, 2026-09-27)**
- [x] ~~Remove the client-supplied `schoolId` fallback in `app/api/fees/discount-approvals/route.ts`~~ — now uses `requireSchoolId(session)` unconditionally.
- [x] ~~Fix `app/api/superadmin/schools/[id]/active/route.ts` to actually persist `isActive`~~ — now calls `prisma.school.update(...)`.

**Blocker (fix before next prod deploy)**
- [ ] Add authentication + tenant/room ACL to `socket-server/index.ts` (or confirm it sits behind an authenticating proxy and downgrade accordingly). File is unchanged since initial pass.

**High**
- [ ] Add rate limiting (login, payment order creation, event registration, public qr/screen/download routes) using the existing Upstash Redis dependency. Still zero hits repo-wide.
- [ ] Backfill `zod` validation onto `fees/discount-approvals`, `fees/offline-payment`, `payment/create-order`, `payment/verify` specifically — `zod` is now used in 34 other files, but not these four highest-risk ones.
- [ ] Formalize `TeacherDailyAttendance` as a real Prisma model/migration instead of runtime DDL in `app/api/teacher/attendance/route.ts` — confirmed still absent from `schema.prisma`.
- [ ] Extend `scripts/checkTenantIsolation.ts` to flag `searchParams.get(/[Ss]chool/)`/`body.schoolId` reads outside the `superadmin/**` allowlist — confirmed by reading the script that it would not have caught the (now-fixed) discount-approvals bug.
- [ ] Move `.env.sydney.bak` (still present in the working tree, confirmed) out of the repo entirely.

**Medium**
- [ ] Add `@@index([schoolId])` to `FeeDiscountApproval` in `prisma/schema.prisma` — confirmed missing (unlike `NewsFeed`, which has it).
- [ ] Sanitize error responses so raw `error.message`/stack details aren't returned to API clients; log full detail via `lib/logger.ts` only.
- [ ] Confirm `NEXTAUTH_URL` is https in all deployed environments so secure cookie flags apply.
- [ ] Audit all `tenantCacheKey(` call sites for correct `schoolId` namespacing (spot-checked 2/many, both fine).
- [ ] Confirm the `payment/refund/route.ts` refundable-amount check runs *inside* the same transaction as the write, not just before it (transaction wrapper confirmed present at line ~243; ordering relative to the aggregation read at line ~84 not yet confirmed).
- [ ] Wire `socket-server/index.ts` logging to a structured logger and make its CORS origin env-driven.
- [ ] Add regression tests: `fees/discount-approvals` (client-supplied `schoolId` is ignored) and `superadmin/schools/[id]/active` (isActive actually persists) for the two fixes above, plus `payment/webhook` idempotency/signature-fail cases.

**Low**
- [ ] Delete the deprecated `app/api/communication/zegoToken/route.ts` once confirmed unused.
- [ ] Optional dead-route sweep against `app/_components/constants/routes.ts`.
- [x] ~~Grep `.env*` for any `NEXT_PUBLIC_`-prefixed secret-shaped values~~ — done: only `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase's publishable anon key, meant to be public). No action needed.
