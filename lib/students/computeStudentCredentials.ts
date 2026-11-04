import { tenantDb as prisma } from "@/lib/db/tenantContext";
import type { Prisma } from "@prisma/client";
import {
  canonicalStudentPasswordFromDob,
  isStudentPasswordStateCheap,
  resolveStudentPasswordState,
  type StudentPasswordState,
} from "@/lib/students/studentDefaultPassword";
import { logger } from "@/lib/logger";

export type StudentCredentialRow = {
  studentId: string;
  name: string;
  email: string;
  password: string;
  dob: string;
  className: string;
  section: string;
  admissionNumber: string;
  rollNo: string;
  accountActive: boolean;
  passwordVerified: boolean;
  /** Why the password can or cannot be shown; see StudentPasswordState. */
  passwordState: StudentPasswordState;
};

export type StudentCredentialsPayload = {
  students: StudentCredentialRow[];
  total: number;
  verifiedCount: number;
  mismatchCount: number;
  /**
   * Students whose password has not been checked yet (state PENDING): the check is a slow bcrypt compare,
   * done once per password within a time budget per request. Fetch again to fill them in.
   */
  pendingCount: number;
  /** True when more students matched than the page returns (the list was cut at the cap). */
  truncated?: boolean;
};

const MAX_EXPORT = 5000;

/**
 * Time one request may spend on bcrypt compares (the route's limit is 60 s). Results are saved, so a
 * school's first load fills in over a few requests and later loads need none.
 */
const CHECK_BUDGET_MS = 25_000;

export function buildStudentCredentialsWhere(
  schoolId: string,
  classId: string,
  className: string,
  section: string
): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { schoolId, status: "Active" };

  if (classId) {
    where.classId = classId;
  } else if (className) {
    where.class = {
      schoolId,
      name: className,
      ...(section ? { section } : {}),
    };
  } else if (section) {
    where.class = { schoolId, section };
  }

  return where;
}

import { formatDobYmd } from "@/lib/dobCalendar";

function formatDobDisplay(dob: Date): string {
  return formatDobYmd(dob);
}

type CredentialStudent = {
  id: string;
  admissionNumber: string;
  rollNo: string | null;
  dob: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    password: string | null;
    dobPasswordCheck: string | null;
  };
  class: { name: string; section: string | null } | null;
};

async function saveChecks(checks: Array<{ userId: string; check: string }>): Promise<void> {
  for (let i = 0; i < checks.length; i += 25) {
    await Promise.all(
      checks.slice(i, i + 25).map(({ userId, check }) =>
        prisma.user.update({ where: { id: userId }, data: { dobPasswordCheck: check } })
      )
    );
  }
}

async function toCredentialRows(
  students: CredentialStudent[],
  deadline: number
): Promise<StudentCredentialRow[]> {
  const checks: Array<{ userId: string; check: string }> = [];
  const rows: StudentCredentialRow[] = [];
  // Sequential on purpose: bcryptjs is CPU-bound, so running compares side by side is no faster and
  // would blow the deadline for all of them at once.
  for (const s of students) {
    const cheap = isStudentPasswordStateCheap(s.dob, s.user.password, s.user.dobPasswordCheck);
    const resolved =
      cheap || Date.now() < deadline
        ? await resolveStudentPasswordState(s.dob, s.user.password, s.user.dobPasswordCheck)
        : { password: "", verified: false, state: "PENDING" as const };
    if ("check" in resolved && resolved.check) checks.push({ userId: s.user.id, check: resolved.check });
    rows.push({
      studentId: s.id,
      name: s.user.name?.trim() || "",
      email: s.user.email?.trim() || "",
      password: resolved.password,
      dob: canonicalStudentPasswordFromDob(s.dob) ? formatDobDisplay(s.dob) : "",
      className: s.class?.name ?? "",
      section: s.class?.section ?? "",
      admissionNumber: s.admissionNumber,
      rollNo: s.rollNo ?? "",
      accountActive: s.user.password !== null,
      passwordVerified: resolved.verified,
      passwordState: resolved.state,
    });
  }

  try {
    await saveChecks(checks);
  } catch (error) {
    // Only a cache: the rows are still right, the next load just checks these again.
    logger.warn("Saving student password checks failed", error);
  }
  return rows;
}

export async function computeStudentCredentials(
  schoolId: string,
  filters: { classId?: string; className?: string; section?: string }
): Promise<StudentCredentialsPayload> {
  const classId = filters.classId?.trim() || "";
  const className = filters.className?.trim() || "";
  const section = filters.section?.trim() || "";

  if (classId) {
    const classData = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true },
    });
    if (!classData) {
      throw new Error("Class not found or doesn't belong to your school");
    }
  }

  const deadline = Date.now() + CHECK_BUDGET_MS;
  const where = buildStudentCredentialsWhere(schoolId, classId, className, section);

  const students = await prisma.student.findMany({
    where,
    take: MAX_EXPORT + 1,
    select: {
      id: true,
      admissionNumber: true,
      rollNo: true,
      dob: true,
      user: { select: { id: true, name: true, email: true, password: true, dobPasswordCheck: true } },
      class: { select: { name: true, section: true } },
    },
    orderBy: [{ class: { name: "asc" } }, { user: { name: "asc" } }],
  });

  const truncated = students.length > MAX_EXPORT;
  const rows = await toCredentialRows(truncated ? students.slice(0, MAX_EXPORT) : students, deadline);
  const verifiedCount = rows.filter((r) => r.passwordVerified).length;
  const pendingCount = rows.filter((r) => r.passwordState === "PENDING").length;
  const mismatchCount = rows.length - verifiedCount - pendingCount;

  return {
    students: rows,
    total: rows.length,
    verifiedCount,
    mismatchCount,
    pendingCount,
    ...(truncated ? { truncated: true } : {}),
  };
}
