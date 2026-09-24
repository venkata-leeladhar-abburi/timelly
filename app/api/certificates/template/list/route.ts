import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function GET(_req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go through
    // the app_tenant connection, restricted by RLS, not just this route's own
    // `where: { schoolId }` filter.
    const templates = await withTenantScopedClient(schoolId, (tx) =>
      tx.certificateTemplate.findMany({
        where: {
          schoolId: schoolId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { certificates: true },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    );

    return NextResponse.json({ templates }, { status: 200 });
  } catch (error: unknown) {
    logger.error("List certificate templates error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
