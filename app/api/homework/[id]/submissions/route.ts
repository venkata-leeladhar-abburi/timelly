import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> | { params: { id: string } } };

function resolveId(raw: { id?: string; params?: { id: string } }): string {
  return raw.id ?? raw.params?.id ?? "";
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const raw = "then" in context.params ? await context.params : context.params;
    const homeworkId = resolveId(raw as { id?: string; params?: { id: string } });
    if (!homeworkId) {
      return NextResponse.json({ message: "Homework ID required" }, { status: 400 });
    }

    const homework = await prisma.homework.findUnique({
      where: { id: homeworkId },
      select: {
        id: true,
        title: true,
        subject: true,
        classId: true,
        schoolId: true,
        teacherId: true,
      },
    });

    if (!homework) {
      return NextResponse.json({ message: "Homework not found" }, { status: 404 });
    }

    const role = session.user.role as string;
    const isSchoolAdmin = role === "SCHOOLADMIN" || role === "SUPERADMIN";

    if (!isSchoolAdmin && role === "TEACHER") {
      if (homework.teacherId !== session.user.id) {
        const classBelongs = await prisma.class.findFirst({
          where: { id: homework.classId, teacherId: session.user.id },
        });
        if (!classBelongs) {
          return NextResponse.json({ message: "You can only view submissions for your own homework" }, { status: 403 });
        }
      }
    } else if (!isSchoolAdmin && role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (homework.schoolId && session.user.schoolId && homework.schoolId !== session.user.schoolId) {
      return NextResponse.json({ message: "Homework not found" }, { status: 404 });
    }

    const submissions = await prisma.homeworkSubmission.findMany({
      where: { homeworkId },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            fatherName: true,
            rollNo: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const list = submissions.map((s) => ({
      id: s.id,
      content: s.content,
      fileUrl: s.fileUrl,
      submittedAt: s.submittedAt,
      studentId: s.studentId,
      studentName: s.student.user?.name ?? s.student.fatherName ?? `Student ${s.student.admissionNumber}`,
      admissionNumber: s.student.admissionNumber,
      rollNo: s.student.rollNo,
    }));

    return NextResponse.json({
      homework: { id: homework.id, title: homework.title, subject: homework.subject },
      submissions: list,
    });
  } catch (e: unknown) {
    console.error("Homework submissions error:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
