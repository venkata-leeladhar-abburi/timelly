/**
 * Students whose login password is their DOB shifted by a day.
 *
 * Older create / bulk-upload / admission-enrolment code hashed the password from the UTC calendar date
 * of the stored DOB, while every screen shows the India (Asia/Kolkata) date. A DOB stored as India
 * midnight (e.g. 2012-08-28T18:30Z for 29 Aug 2012) therefore got the password 20120828 instead of
 * 20120829. This finds students whose password still matches such a shifted date and, with --apply,
 * resets it to the DOB the app shows. Passwords a student or admin set themselves are never touched.
 *
 * Dry run (default) prints counts per school; --details also lists admission numbers.
 *
 *   npx tsx scripts/fix-student-dob-password-offset.ts [--school-id=<id>] [--details] [--apply]
 */
import bcrypt from "bcryptjs";
import prisma from "../lib/db";
import {
  canonicalStudentPasswordFromDob,
  dobDefaultPasswordCheck,
  hashStudentPasswordFromDob,
  passwordCandidatesFromDob,
} from "@/lib/students/studentDefaultPassword";
import { formatDobYmd } from "@/lib/dobCalendar";

async function matchesAny(candidates: string[], hash: string): Promise<boolean> {
  for (const c of candidates) {
    try {
      if (await bcrypt.compare(c, hash)) return true;
    } catch {
      /* invalid hash */
    }
  }
  return false;
}

async function main() {
  const schoolArg = process.argv.find((a) => a.startsWith("--school-id="))?.split("=")[1];
  const details = process.argv.includes("--details");
  const apply = process.argv.includes("--apply");

  const schools = await prisma.school.findMany({
    where: schoolArg ? { id: schoolArg } : {},
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  let totalShifted = 0;
  let totalFixed = 0;
  for (const school of schools) {
    const students = await prisma.student.findMany({
      where: { schoolId: school.id, status: "Active" },
      select: { admissionNumber: true, dob: true, userId: true, user: { select: { password: true } } },
    });

    const shifted: typeof students = [];
    for (const s of students) {
      const hash = s.user?.password;
      const shown = canonicalStudentPasswordFromDob(s.dob);
      if (!hash || !shown) continue;
      const legacy = passwordCandidatesFromDob(s.dob).filter((c) => c !== shown);
      if (legacy.length === 0) continue;
      if (await matchesAny([shown], hash)) continue;
      if (await matchesAny(legacy, hash)) shifted.push(s);
    }
    if (shifted.length === 0) continue;

    totalShifted += shifted.length;
    console.log(`${school.name}: ${students.length} active | ${shifted.length} with day-shifted DOB password`);
    for (const s of shifted) {
      if (details) console.log(`  ${s.admissionNumber}\tDOB ${formatDobYmd(s.dob)}`);
      if (apply) {
        const password = await hashStudentPasswordFromDob(s.dob);
        await prisma.user.update({
          where: { id: s.userId },
          data: { password, dobPasswordCheck: dobDefaultPasswordCheck(s.dob, password) },
        });
        totalFixed += 1;
      }
    }
  }

  console.log(
    apply
      ? `Reset ${totalFixed} of ${totalShifted} passwords to the DOB shown in the app.`
      : `${totalShifted} students affected. Dry run: nothing changed (pass --apply to fix).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
