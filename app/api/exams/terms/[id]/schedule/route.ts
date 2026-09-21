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

export async function GET(
  _req: Request,
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

    const { id } = await params;
    const term = await prisma.examTerm.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!term) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });

    const schedules = await prisma.examSchedule.findMany({
      where: { termId: id },
      orderBy: { examDate: "asc" },
    });

    return NextResponse.json({ schedules }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exams schedule GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
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

    const { id } = await params;
    const term = await prisma.examTerm.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!term) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });

    const body = await req.json();

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const examDate = body.examDate ? new Date(body.examDate) : null;
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    const durationMin = Number(body.durationMin);

    if (!subject || !examDate || isNaN(examDate.getTime()) || !startTime || !Number.isFinite(durationMin)) {
      return NextResponse.json(
        { message: "subject, examDate, startTime and durationMin are required" },
        { status: 400 }
      );
    }

    const schedule = await prisma.examSchedule.create({
      data: {
        termId: id,
        subject,
        examDate,
        startTime,
        durationMin: Math.trunc(durationMin),
      },
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (e: unknown) {
    console.error("Exams schedule POST:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

