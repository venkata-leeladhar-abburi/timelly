import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const take = Math.min(100, Number(searchParams.get("take") ?? 50) || 50);
    const search = (searchParams.get("search") ?? "").trim();

    const where: any = { schoolId, studentId: null };
    if (search) {
      where.OR = [
        { applicationNo: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { parentPhone: { contains: search, mode: "insensitive" } },
        { aadharNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const applications = await prisma.studentApplication.findMany({
      where,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        applicationNo: true,
        firstName: true,
        middleName: true,
        lastName: true,
        parentPhone: true,
        aadharNo: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ applications }, { status: 200 });
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}

