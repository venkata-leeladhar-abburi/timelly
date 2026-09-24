import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const originalStudentId = searchParams.get("originalStudentId");

    const schoolId = session.user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const where: Prisma.StudentHistoryWhereInput = {
      schoolId: schoolId,
    };

    if (originalStudentId) {
      where.originalStudentId = originalStudentId;
    }
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): read goes
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const histories = await withTenantScopedClient(schoolId, (tx) =>
      tx.studentHistory.findMany({
        where,
        orderBy: {
          deactivatedAt: "desc",
        },
      })
    );

    return NextResponse.json({ histories }, { status: 200 });
  } catch (error: unknown) {
    logger.error("List student history error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
