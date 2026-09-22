import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

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

function formatExamDate(d: Date): string {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    return h === 1 ? "1 Hour" : `${h} Hours`;
  }
  return `${minutes} Mins`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    if (role !== "SCHOOLADMIN" && role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { id } = await params;

    const schedule = await prisma.examSchedule.findUnique({
      where: { id },
      include: {
        term: {
          include: {
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
    });

    if (!schedule || !schedule.term || schedule.term.schoolId !== schoolId) {
      return NextResponse.json({ message: "Exam schedule not found" }, { status: 404 });
    }

    const term = schedule.term;
    const tracking = await prisma.syllabusTracking.findFirst({
      where: { termId: term.id, subject: schedule.subject },
      include: { units: { orderBy: { order: "asc" } } },
    });

    const syllabusList = tracking
      ? tracking.units.map((u) => ({
          id: u.id,
          subject: u.unitName,
          completedPercent: u.completedPercent,
        }))
      : [];
    const totalCoverage =
      syllabusList.length > 0
        ? Math.round(
            syllabusList.reduce((s, u) => s + u.completedPercent, 0) / syllabusList.length
          )
        : tracking?.completedPercent ?? 0;

    const classInfo = term.class
      ? { id: term.class.id, name: term.class.name ?? "", section: term.class.section ?? "" }
      : { id: "", name: "", section: "" };

    const exam = {
      id: schedule.id,
      termId: term.id,
      name: term.name,
      status: term.status,
      date: formatExamDate(schedule.examDate),
      time: schedule.startTime,
      duration: formatDuration(schedule.durationMin),
      durationMin: schedule.durationMin,
      subject: schedule.subject,
      class: classInfo,
      classId: term.classId ?? "",
      totalCoverage,
      syllabus: syllabusList,
    };

    return NextResponse.json({ exam }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Exams schedule GET [id]:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const schedule = await prisma.examSchedule.findUnique({
      where: { id },
      include: { term: { select: { id: true, schoolId: true } } },
    });
    if (!schedule || !schedule.term || schedule.term.schoolId !== schoolId) {
      return NextResponse.json({ message: "Exam schedule not found" }, { status: 404 });
    }

    const body = await req.json();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const examDate = body.examDate ? new Date(body.examDate) : null;
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    const durationMin = Number(body.durationMin);

    if (!subject || !examDate || isNaN(examDate.getTime()) || !startTime || !Number.isFinite(durationMin) || durationMin < 1) {
      return NextResponse.json(
        { message: "subject, examDate, startTime and durationMin (>= 1) are required" },
        { status: 400 }
      );
    }

    const updated = await prisma.examSchedule.update({
      where: { id },
      data: {
        subject,
        examDate,
        startTime,
        durationMin: Math.trunc(durationMin),
      },
    });
    return NextResponse.json({ schedule: updated }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Exams schedule PUT [id]:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const schedule = await prisma.examSchedule.findUnique({
      where: { id },
      include: { term: { select: { id: true, schoolId: true } } },
    });

    if (!schedule || !schedule.term || schedule.term.schoolId !== schoolId) {
      return NextResponse.json({ message: "Exam schedule not found" }, { status: 404 });
    }

    await prisma.examSchedule.delete({ where: { id } });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Exams schedule DELETE [id]:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
