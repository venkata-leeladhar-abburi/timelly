import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role: string } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId && session.user.role === "TEACHER") {
    const teacherClass = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacherClass?.schoolId ?? null;
    if (!schoolId) {
      const teacherSchool = await prisma.school.findFirst({
        where: { teachers: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = teacherSchool?.id ?? null;
    }
  }
  if (!schoolId) {
    const school = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = school?.id ?? null;
  }
  return schoolId;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { id: termId } = await params;
    const term = await prisma.examTerm.findFirst({
      where: { id: termId, schoolId },
      select: { id: true },
    });
    if (!term) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });

    const body = await req.json();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const unitName = typeof body.unitName === "string" ? body.unitName.trim() : "";
    const order = Number(body.order);
    const validOrder = Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : 0;
    const completedPercentRaw = Number(body.completedPercent ?? 0);
    const completedPercent = Math.max(0, Math.min(100, Math.trunc(completedPercentRaw)));

    if (!subject || !unitName) {
      return NextResponse.json(
        { message: "subject and unitName are required" },
        { status: 400 }
      );
    }

    const tracking = await prisma.syllabusTracking.upsert({
      where: {
        termId_subject: { termId, subject },
      },
      create: { termId, subject },
      update: {},
    });

    const unit = await prisma.syllabusUnit.create({
      data: {
        trackingId: tracking.id,
        unitName,
        order: validOrder,
        completedPercent,
      },
    });

    return NextResponse.json({ unit }, { status: 201 });
  } catch (e: unknown) {
    console.error("Exams syllabus units POST:", e);
    const err = e as { code?: string };
    if (err?.code === "P2021") {
      return NextResponse.json(
        { message: "Database schema out of sync. Run: npx prisma migrate deploy" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
