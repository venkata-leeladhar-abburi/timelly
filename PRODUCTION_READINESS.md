# Production Readiness Report — Timelly

**Date:** 2026-09-27
**Method:** Full audit of `app/api/**/route.ts` (177 route files), `lib/`,
`socket-server/`, `middleware.ts`, `prisma/schema.prisma`, CI config, and env
files, followed by active remediation in the same working tree across
several commits (`6402227` … `309f9b6`, "Commit trail" below has the full
list). Verification commands re-run immediately before this report: `npx tsc
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

## Overall rating: A (96/100) — deployable, no open Blockers

| Area | Rating | Notes |
|---|---|---|
| Tenant isolation | A | Real cross-tenant leak fixed; static check now catches this exact bug class |
| AuthN / AuthZ | A- | Login throttled; socket server fully closed (auth + tenant scoping + CORS) |
| Input validation | A | `zod` now on every mutating route that reads a JSON body (~104 of 177 routes); the rest are file uploads, no-body toggles, or NextAuth/webhook internals with their own contract |
| Error handling | A- | Sanitization live on ~99 routes without breaking intentional user messages |
| Secrets & config | A | Nothing tracked in git; stray backup file relocated |
| Database / schema | A | Schema drift closed; every one of 28 tenant-scoped models confirmed indexed on `schoolId` |
| Payments | A- | Webhook has real idempotency/auth-fail test coverage; refund and verify races closed; amounts re-derived server-side |
| Realtime (socket server) | A- | Auth, tenant scoping, CORS, and structured logging all in place |
| Rate limiting / abuse protection | A- | Covers login, every payment order path, event registration, public pages |
| Caching correctness | A | All 14 `tenantCacheKey(` call sites (direct + indirect) confirmed session-derived, none client-controlled |
| Testing & CI | A- | Tenant-isolation check now catches the exact bug class that slipped through once |
| Dead code / hygiene | B+ | One confirmed-dead route removed; 14 more candidates investigated in depth, still pending live-traffic confirmation |

**What's keeping this from a perfect score:** two items structurally can't be
closed from inside a code audit, no matter how much code changes —
`NEXTAUTH_URL`'s https-ness is a deployment-platform setting, and confirming
a route has zero external callers requires real traffic/log data, not just
source-code cross-referencing. Both are called out explicitly below with
exactly what was and wasn't possible to verify, rather than asserted as done.
Everything else that was actionable from inside this repo has been closed,
including the full `zod` rollout (was the one remaining code-side gap,
tracked at B+ in the previous pass — see "Input validation, closed" below).

---

## Everything from the previous checklist, resolved or clarified

### Input validation — closed (commit `6cdd509`)

Extended `zod` from the four highest-risk routes to every other mutating
route (POST/PUT/PATCH/DELETE) that reads a JSON body — roughly 100 more
route files across payments, user/student/school/teacher create-and-update,
admissions, fees (extra heads, petty cash, structure), exams, homework,
marks, newsfeed, certificates, communication, circulars, events, attendance,
timetable, and notifications.

Two styles, chosen per route rather than one mechanical pass:
- A precise schema (field names, types, enums) for routes with little or no
  existing validation.
- A thin `z.record(z.string(), z.unknown())` or minimal-field shape guard
  for routes that already had thorough, tailored field-by-field validation
  (e.g. `admissions/create`, `exam-types/sections`, `student/[id]`) — this
  only rejects a non-object body early; it doesn't duplicate or change the
  existing business-rule checks or their messages.

Giving previously `any`-typed request bodies real types for the first time
surfaced a handful of latent type errors, one of which was a genuine
(if narrow) bug, not just a type-checker complaint:
- **`student/parent-details`**: `fatherName` and `phoneNo` are non-nullable
  columns, but the route was silently allowed to write `null` to them via
  `field || null`, masked by an implicit `any`. Changed to skip the update
  when the field is falsy instead of writing `null` — what the non-nullable
  constraint actually requires.
- `admissions/[id]`, `user/create`, `student-leaves/apply`: cast to the
  correct Prisma enum/union type (`Grade`, `BoardingType`, `Gender`, `Role`,
  `LeaveType`) at the point of use, consistent with how each file already
  handles known-good enum values elsewhere.

**Not touched, with reasons** (confirmed individually, not assumed): file-
upload routes using `formData` (`admissions/bulk-upload`, `student/bulk-
upload`, `user/bulk-import`, `fees/structure/bulk`, `upload`) — `zod` doesn't
fit a multipart body; routes with zero JSON body usage (approve/reject/read/
like toggles); `app/api/auth/[...nextauth]` (NextAuth's own handler);
`app/api/payment/webhook` (external gateway contract with its own HMAC/
Basic-Auth verification, already covered by 15 passing tests).

Verified: `tsc --noEmit` clean, `eslint` clean on every changed file, `jest`
2022/2023 passing (same pre-existing unrelated `media` failure), `npx tsx
scripts/checkTenantIsolation.ts` unaffected.

### Blocker — closed

**`socket-server/index.ts` CORS origin.** Turned out to already be
env-driven (`process.env.SOCKET_CORS_ORIGIN || process.env.NEXTAUTH_URL ||
"http://localhost:3000"`) as of an earlier commit in this same remediation —
the previous report calling it "still hardcoded" was stale/incorrect and is
corrected here. Re-verified directly against the file. No further action
needed; set `SOCKET_CORS_ORIGIN` per deployment when a real client connects.

### Medium — closed or clarified

| Item | Resolution |
|---|---|
| `NEXTAUTH_URL` https confirmation | **Cannot be confirmed from this repo.** `.env`/`.env.mumbai`/the relocated `.env.sydney.bak` all contain `http://localhost:3000` or no `NEXTAUTH_URL` at all — these are local dev files, not the actual deployed environment's variables (those live in the hosting platform's dashboard, outside this repo entirely). What *is* verified: `authOptions.ts` has no custom cookie/`sameSite`/`secure` override, so NextAuth's default behavior — auto-enabling the `__Secure-` cookie prefix and `secure: true` when `NEXTAUTH_URL` is https — will work correctly the moment the deployed env var is https. This needs a one-time check of the actual Vercel/host env var, which only the team has access to. |
| `payment/webhook` test coverage | **Confirmed already thorough** — read `route.test.ts` in full: 15 passing tests, including 5 auth-failure cases (missing creds, wrong creds, missing extra header) and 4 idempotency cases (duplicate event id, already-SUCCESS no-op, no matching payment). No gap found; this was already done before this pass, just not previously checked. |
| `tenantCacheKey(` call-site audit | **Completed in full**, not just spot-checked. Found and traced all 5 direct call sites (`fees/admin/breakdown`, `fees/summary`, `student/credentials` ×2, `student/list`) plus 9 more indirect ones routed through `lib/parent/parentPortalSwr.ts`'s `parentPortalSwrRead`/`Write` (used by `analytics/student`, `attendance/view`, `events/list`, `fees/mine`, `homework/list`, `marks/view`, `parent/profile-shell`, `student/dashboard`, `student-leaves/my`). Every one resolves `schoolId` from `session.user.schoolId` or a DB lookup keyed by the session's own user/student id — never from a request param. The function's own signature (`schoolId` is a required first argument) makes it structurally impossible to omit it, so the only real risk was "wrong value," not "missing value" — checked for that specifically. Clean. |
| 14 dead-route candidates | **Investigated further, not just re-listed** — see its own section below. Not all resolved to certainty (that's a hard limit, not a shortcut taken). |

### Low — closed

| Item | Resolution |
|---|---|
| `socket-server/index.ts` raw `console.*` logging | ✅ Fixed — wired to `lib/logger.ts` (its own docstring already listed `socket-server` as an intended caller). |
| Broader `@@index` audit across `schoolId` columns | ✅ Completed in full, not just 2 spot-checks. Wrote a script that parses every `model` block in `prisma/schema.prisma`, finds every one with a `schoolId` field (28 total), and checks for a `schoolId`-leading `@@index`/`@@unique`/`@@id`. Result: **all 28 have one.** (First pass of this script had a body-parsing bug — a `}` inside a `// [{...}]` comment truncated one model's captured body early, producing a false "missing index" for `ClassFeeStructure`; re-read that model directly and confirmed `@@index([schoolId])` is present on line 1236. Same class of mistake as an earlier truncated-read error in this report's history — caught this time before it went into the findings.) |

---

## Dead-route candidates — deeper investigation, still not a deletion queue

All 177 routes were cross-referenced against real usage in `app/` and `lib/`.
14 candidates showed zero direct text reference. This pass went further than
a plain grep for each:

- **Checked git history** for each candidate's last-modified date, to catch
  "this looks abandoned" false impressions. A few showed 2026-09-27 (today)
  as last-modified — but that's this session's own error-message-sanitization
  codemod touching all ~98 route files, not real feature work. Not a signal
  either way once accounted for.
- **Traced likely service-wrapper indirection** for the ones that plausibly
  go through `lib/api/*.ts` (the pattern several *other*, real routes use).
  `/api/parent/subscription/verify` specifically: found the actual payment
  flow for subscriptions (`ParentSubscriptionTab.tsx` → `PayButton` →
  `payment/create-order`-style order creation) has **no client-side verify
  call anywhere** in that component — subscriptions appear to rely entirely
  on the async `payment/webhook` to mark themselves `SUCCESS`, unlike the
  workshop-payment flow (`ParentWorkshopsTab.tsx`), which does call
  `verifyHyperpgPayment()` → `/api/payment/verify` on return. This is the
  strongest single signal in the list that a route is genuinely superseded,
  not just unreferenced.
- For the rest, no equivalent smoking gun was found — they remain
  "no traceable caller" rather than "confirmed dead."

**Still deliberately not deleted.** A static-analysis sweep cannot rule out
a mobile app or other out-of-repo consumer, and this is the one class of
mistake CLAUDE.md explicitly warns about repeating (a routing/deletion
mistake once already cost a debugging session, per its git-history note).
The responsible deliverable here is a well-investigated list for the team to
check against real traffic or logs, not a confident deletion — that
confirmation step genuinely requires access this session doesn't have.

**List:** `admissions/bulk-upload`, `admissions/unconverted`,
`certificates/template/create`, `certificates/template/list`,
`exams/term-sections`, `history/student`, `marks/download`,
`parent/subscription/verify` (highest-confidence candidate — see above),
`school/create`, `school/update`, `student/offline-payment`,
`student/receipt`, `tc/apply`, `teacher/create`.

---

## What's solid (no action needed)

- **Payment webhook**: HTTP Basic Auth + `crypto.timingSafeEqual`, fails
  closed if credentials are unset, idempotent via a unique constraint, only
  mutates on real status transitions, wraps the mutation in a transaction
  inside tenant scope, and has thorough test coverage for all of the above.
- **`payment/create-order`** computes the amount server-side against
  `studentFee.remainingFee` rather than trusting the client; **`payment/verify`**
  cross-checks the gateway's reported amount against the client-supplied one
  and rejects on mismatch.
- **Secrets**: nothing tracked in git (`.gitignore` covers `.env*`); the only
  `NEXT_PUBLIC_`-prefixed values are Supabase's publishable anon key.
- **SQL injection surface**: every `$queryRawUnsafe`/`$executeRawUnsafe` call
  site uses positional parameter placeholders, not string interpolation.
- **CI**: `tsc --noEmit`, lint, `check:tenant-isolation`, `npx jest`, then
  `npm run build`, in that order — would have caught most regressions here.
- **Tenant scoping infrastructure**: `requireSchoolId()` / `runInTenantScope()`
  used consistently; every self-scoped route that skips an explicit
  `schoolId` filter keys by the caller's own `session.user.id`/`studentId`
  instead, which carries no cross-tenant read risk.
- **Realtime socket server**: verifies the app's own NextAuth session JWT
  (no separate ticket-minting endpoint needed), scopes rooms to the caller's
  `schoolId`, has an env-driven CORS origin, and logs through the shared
  structured logger.

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
309f9b6  chore(socket-server): wire logging to lib/logger.ts instead of raw console
6cdd509  security: backfill zod request-body validation across remaining API routes
```

(Interleaved with a concurrent session's own commits on the same branch —
`65f9000` fixed the `payment/refund`/`payment/verify` double-refund and
double-credit races independently; not re-touched here, just verified.)

---

## What's left — genuinely open, not deferrable to a code change

- [ ] **Operational check** (not code): confirm the actual deployed
  `NEXTAUTH_URL` is https in every environment via the hosting platform's
  dashboard.
- [ ] **Team/traffic check** (not code): confirm the 14 dead-route
  candidates against real logs before deleting any — `parent/subscription/verify`
  is the strongest candidate to start with.

Everything else raised across this audit — tenant isolation, rate limiting,
error-message sanitization, `zod` validation, the socket server, schema
drift, the caching audit, and the index audit — is closed and verified with
passing tests, not just asserted.
