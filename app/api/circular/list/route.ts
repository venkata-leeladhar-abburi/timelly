import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
      if (schoolId && session.user.role === "SCHOOLADMIN") {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { schoolId },
        });
      }
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // PUBLISHED | DRAFT | all
    const recipient = searchParams.get("recipient"); // all | teachers | parents | students | staff | class
    const classId = searchParams.get("classId"); // filter by class

    const where: Record<string, unknown> = { schoolId: schoolId! };
    if (status && status !== "all") where.publishStatus = status;
    const andClauses: Record<string, unknown>[] = [];
    if (recipient && recipient !== "all") {
      andClauses.push({
        OR: [
          { recipients: { has: recipient } },
          { recipients: { has: "all" } },
        ],
      });
    }
    if (classId) {
      where.classId = classId;
    }
    if (andClauses.length > 0) where.AND = andClauses;

    const circulars = await prisma.circular.findMany({
      where,
      include: { issuedBy: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    });

    const allClassIds = [...new Set(circulars.map((c) => c.classId).filter((id): id is string => !!id))];
    const classes =
      allClassIds.length > 0
        ? await prisma.class.findMany({
            where: { id: { in: allClassIds } },
            select: { id: true, name: true, section: true },
          })
        : [];
    const classMap = Object.fromEntries(classes.map((cls) => [cls.id, cls]));

    const enriched = circulars.map((c) => ({
      ...c,
      targetClass: c.classId ? classMap[c.classId] ?? null : null,
    }));

    return NextResponse.json({ circulars: enriched }, { status: 200 });
  } catch (e: unknown) {
    console.error("Circular list:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
