/**
 * Set the students listed in an Excel file (column "Admission No.") to the "Staff Child" category, which is
 * treated like RTE: no tuition. Their stored fee is recalculated; payments are never touched.
 *
 * Dry run unless --apply is given: the changes are made inside a transaction and rolled back.
 *
 * Usage:
 *   npx tsx scripts/set-students-staff-child.ts --school-name=Lotus --file="C:/path/staff child.xlsx" [--apply]
 */
import ExcelJS from "exceljs";
import prisma from "../lib/db";
import { recalculateStoredFees, type RecalcDb } from "@/lib/fees/recalculateStoredFee";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";

class DryRunRollback extends Error {}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const schoolName = arg("school-name");
  const file = arg("file");
  const apply = process.argv.includes("--apply");
  if (!schoolName || !file) {
    console.error('Usage: --school-name=<part of name> --file="<xlsx>" [--apply]');
    process.exit(2);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? "").trim().toLowerCase());
  const col = header.indexOf("admission no.");
  if (col < 1) throw new Error('Column "Admission No." not found in the first row');
  const admissions: string[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = String(row.getCell(col).value ?? "").trim();
    if (v) admissions.push(v);
  });

  const schools = await prisma.school.findMany({ where: { name: { contains: schoolName, mode: "insensitive" } }, select: { id: true, name: true } });
  if (schools.length !== 1) throw new Error(`Expected one school matching "${schoolName}", found ${schools.length}`);
  const schoolId = schools[0].id;

  const students = await prisma.student.findMany({
    where: { schoolId, admissionNumber: { in: admissions } },
    select: { id: true, admissionNumber: true, residencyType: true, user: { select: { name: true } } },
  });
  const missing = admissions.filter((a) => !students.some((s) => s.admissionNumber === a));
  if (missing.length) throw new Error(`Not found in ${schools[0].name}: ${missing.join(", ")}`);
  console.log(`${schools[0].name}: ${students.length} students in the file`);
  console.log(apply ? "APPLYING" : "DRY RUN: changes are made and then rolled back");

  let plans: Awaited<ReturnType<typeof recalculateStoredFees>> = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.student.updateMany({ where: { id: { in: students.map((s) => s.id) }, schoolId }, data: { residencyType: "Staff Child" } });
        plans = await recalculateStoredFees(tx as unknown as RecalcDb, { schoolId, studentIds: students.map((s) => s.id), apply });
        if (!apply) throw new DryRunRollback();
      },
      { maxWait: 20_000, timeout: 120_000 }
    );
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }

  const byId = new Map(students.map((s) => [s.id, s]));
  for (const p of plans) {
    const s = byId.get(p.studentId as string);
    const b = p.before;
    const a = p.after;
    console.log(
      `${s?.admissionNumber} ${s?.user?.name ?? ""} [${s?.residencyType} -> Staff Child]` +
        (b && a ? ` total ${b.totalFee}->${a.totalFee}, final ${b.finalFee}->${a.finalFee}, paid ${b.amountPaid}, remaining ${b.remainingFee}->${a.remainingFee}` : "") +
        (p.blockedReason ? ` BLOCKED: ${p.blockedReason}` : "")
    );
  }
  if (apply) {
    for (const s of students) invalidateStudentFeeReadCaches({ studentId: s.id, schoolId });
    console.log("written");
  } else {
    console.log("nothing was changed. Re-run with --apply to write.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
