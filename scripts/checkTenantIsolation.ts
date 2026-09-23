/**
 * Tenant-isolation safety net (docs/SECURITY_REVIEW.md, finding #2, recommendation #1).
 *
 * There is no database-level tenant isolation in this app (RLS is enabled but has
 * zero policies — see docs/SECURITY_REVIEW.md). Every route touching a tenant-scoped
 * table must derive `schoolId` from the session and thread it into its Prisma/raw-SQL
 * calls. This script is a heuristic regression net, not a proof of correctness:
 *
 *   - It finds every Prisma model that has a `schoolId` field (from prisma/schema.prisma).
 *   - It scans every app/api/**\/route.ts for calls against those models
 *     (`prisma.<model>.<action>(` or `tx.<model>.<action>(`).
 *   - A route that calls a tenant-scoped model but never mentions `schoolId` anywhere
 *     in the file is flagged — that's the "forgot to scope the query" regression the
 *     review called out as having zero automated detection today.
 *
 * This intentionally does NOT try to verify that `schoolId` is threaded correctly into
 * every individual query (that would need real static analysis of Prisma `where`
 * clauses). It only catches the total-miss case. Routes that legitimately query across
 * tenants (superadmin dashboards, the NextAuth handler, etc.) are allowlisted below.
 *
 * Run: npx tsx scripts/checkTenantIsolation.ts
 * Exits non-zero (and prints the offending files) if any unscoped tenant-model usage
 * is found outside the allowlist.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

/** Routes that intentionally query tenant-scoped models across all schools. */
const ALLOWLIST = new Set<string>([
  "app/api/auth/[...nextauth]/route.ts",
  "app/api/superadmin/dashboard/route.ts",
  "app/api/superadmin/chairmen/route.ts",
  "app/api/superadmin/chairmen/create/route.ts",
  "app/api/superadmin/schools/route.ts",
  "app/api/superadmin/schools/create/route.ts",
  "app/api/superadmin/schools/[id]/route.ts",
  "app/api/superadmin/schools/[id]/active/route.ts",
  "app/api/superadmin/schools/[id]/subscription/route.ts",
  "app/api/superadmin/schools/[id]/fees-backup/route.ts",
  "app/api/superadmin/backup-schedule/route.ts",
  "app/api/superadmin/backup/email/route.ts",
  "app/api/user/[id]/route.ts", // superadmin can act on any user; school-scoped roles pass their own schoolId check elsewhere

  // Below: routes that query a tenant-scoped model but key every query off the
  // caller's own session id (session.user.id / session.user.studentId), which is
  // globally unique. There's no cross-tenant read risk because the row is always
  // "my own record" — scoping by schoolId in addition would be redundant, not a
  // missing check. Verified individually during the 2026-09-23 security-review
  // follow-up (docs/SECURITY_REVIEW.md).
  "app/api/chairman/me/route.ts", // prisma.user.findUnique({ where: { id: session.user.id } })
  "app/api/user/change-password/route.ts", // prisma.user.findUnique/update keyed on session.user.id
  "app/api/leaves/my/route.ts", // prisma.leaveRequest.findMany({ where: { teacherId: session.user.id } })
  "app/api/leaves/[id]/route.ts", // ownership re-checked against session.user.id after fetch, before mutating
  "app/api/marks/download/route.ts", // prisma.mark.findMany({ where: { studentId: session.user.studentId } })
  "app/api/student/parent-details/route.ts", // prisma.student.findFirst({ where: { userId: session.user.id } })
  "app/api/student-leaves/approval-authority/route.ts", // prisma.student.findUnique keyed on session studentId/userId
  "app/api/communication/messages/route.ts", // appointment ownership re-checked against session.user.id/studentId after fetch
]);

function findTenantScopedModels(): Set<string> {
  const schema = fs.readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8");
  const modelBlockRe = /model\s+(\w+)\s*\{([^}]*)\}/g;
  const tenantModels = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = modelBlockRe.exec(schema))) {
    const [, modelName, body] = m;
    if (/^\s*schoolId\s+/m.test(body)) {
      // Prisma client property name is camelCase of the model name.
      const clientName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
      tenantModels.add(clientName);
    }
  }
  return tenantModels;
}

function walkRouteFiles(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (entry.name === "route.ts") {
      out.push(full);
    }
  }
}

export type TenantIsolationOffender = { file: string; models: string[] };
export type TenantIsolationResult = {
  offenders: TenantIsolationOffender[];
  routeFileCount: number;
  tenantModelCount: number;
};

/** Pure check, reusable from the CLI entrypoint below and from a Jest test. */
export function checkTenantIsolation(root: string = ROOT): TenantIsolationResult {
  const tenantModels = findTenantScopedModels();
  const routeFiles: string[] = [];
  walkRouteFiles(path.join(root, "app", "api"), routeFiles);

  const modelCallRe = new RegExp(
    `\\b(?:prisma|tx)\\.(${Array.from(tenantModels).join("|")})\\.\\w+\\(`,
    "g"
  );

  const offenders: TenantIsolationOffender[] = [];

  for (const absPath of routeFiles) {
    const relPath = path.relative(root, absPath).split(path.sep).join("/");
    if (ALLOWLIST.has(relPath)) continue;

    const content = fs.readFileSync(absPath, "utf8");
    const matchedModels = new Set<string>();
    let match: RegExpExecArray | null;
    modelCallRe.lastIndex = 0;
    while ((match = modelCallRe.exec(content))) {
      matchedModels.add(match[1]);
    }
    if (matchedModels.size === 0) continue;

    if (!content.includes("schoolId")) {
      offenders.push({ file: relPath, models: Array.from(matchedModels) });
    }
  }

  return { offenders, routeFileCount: routeFiles.length, tenantModelCount: tenantModels.size };
}

function main() {
  const { offenders, routeFileCount, tenantModelCount } = checkTenantIsolation();

  if (offenders.length === 0) {
    console.log(
      `✓ Tenant-isolation check passed: ${routeFileCount} route files scanned, ` +
        `${tenantModelCount} tenant-scoped models tracked, no unscoped usage found.`
    );
    process.exit(0);
  }

  console.error(
    `✗ Tenant-isolation check found ${offenders.length} route(s) that query a ` +
      `tenant-scoped model without ever mentioning "schoolId":\n`
  );
  for (const o of offenders) {
    console.error(`  - ${o.file}  (models: ${o.models.join(", ")})`);
  }
  console.error(
    `\nIf a flagged route is intentionally cross-tenant (e.g. a superadmin route), ` +
      `add it to ALLOWLIST in scripts/checkTenantIsolation.ts with a comment explaining why. ` +
      `Otherwise, add schoolId scoping via requireSchoolId() (lib/auth/tenant.ts) or an ` +
      `equivalent session-derived resolver before merging.`
  );
  process.exit(1);
}

// Only run the CLI when executed directly (`npx tsx scripts/checkTenantIsolation.ts`),
// not when imported by the Jest wrapper in checkTenantIsolation.test.ts.
if (require.main === module) {
  main();
}
