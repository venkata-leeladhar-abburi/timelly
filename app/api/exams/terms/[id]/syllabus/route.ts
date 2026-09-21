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

    const syllabus = await prisma.syllabusTracking.findMany({
      where: { termId: id },
      orderBy: { subject: "asc" },
    });

    return NextResponse.json({ syllabus }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exams syllabus GET:", e);
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
    const completedPercentRaw = Number(body.completedPercent ?? 0);
    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : null;

    if (!subject) {
      return NextResponse.json({ message: "subject is required" }, { status: 400 });
    }

    const completedPercent = Math.max(0, Math.min(100, Math.trunc(completedPercentRaw)));

    const record = await prisma.syllabusTracking.upsert({
      where: {
        termId_subject: {
          termId: id,
          subject,
        },
      },
      create: {
        termId: id,
        subject,
        completedPercent,
        notes,
      },
      update: {
        completedPercent,
        notes,
      },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (e: unknown) {
    console.error("Exams syllabus POST:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

