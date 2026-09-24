import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { requireSchoolId } from "@/lib/auth/tenant";

/** PATCH: update unit completedPercent (used by teacher portal for progress) */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    // SCHOOLADMIN can set; TEACHER can set for their subjects
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const tenant = await requireSchoolId(session);
    if (!tenant.ok) return NextResponse.json({ message: tenant.message }, { status: tenant.status });

    return await runInTenantScope(tenant.schoolId, async (schoolId) => {
    const { id } = await params;
    const owned = await prisma.syllabusUnit.findFirst({
      where: { id, tracking: { term: { schoolId: tenant.schoolId } } },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ message: "Unit not found" }, { status: 404 });

    const body = await req.json();
    const completedPercentRaw = Number(body.completedPercent ?? 0);
    const completedPercent = Math.max(0, Math.min(100, Math.trunc(completedPercentRaw)));

    const unit = await prisma.syllabusUnit.update({
      where: { id },
      data: { completedPercent },
      include: { tracking: true },
    });

    // Optionally recalc subject-level completedPercent from units
    const units = await prisma.syllabusUnit.findMany({
      where: { trackingId: unit.trackingId },
    });
    const avg =
      units.length > 0
        ? Math.round(
            units.reduce((s: number, u: { completedPercent: number }) => s + u.completedPercent, 0) / units.length
          )
        : 0;

    await prisma.syllabusTracking.update({
      where: { id: unit.trackingId },
      data: { completedPercent: avg },
    });

    return NextResponse.json({ unit }, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("Exams unit PATCH:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
