import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";

const updateSchoolBodySchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  location: z.string().optional(),
});

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const rawBody = await req.json().catch(() => null);
    const parsedBody = updateSchoolBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const { name, address, location } = parsedBody.data;

    if (!session)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    // Read user's schoolId from primary (optional: read from replica if acceptable)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user?.schoolId) {
      return NextResponse.json(
        { message: "You have not created a school yet" },
        { status: 400 }
      );
    }

    return await runInTenantScope(user.schoolId, async (_schoolId) => {
    const data: { name?: string; address?: string; location?: string } = {};
    if (name !== undefined) data.name = name;
    if (address !== undefined) data.address = address;
    if (location !== undefined) data.location = location;

    // ✅ UPDATE school on primary
    const updated = await prisma.school.update({
      where: { id: user.schoolId as string },
      data,
    });

    return NextResponse.json(
      { message: "School updated", updated },
      { status: 200 }
    );
    });
  } catch (error) {
    logger.error("School update error:", error);
    return NextResponse.json(
      { message: "Error updating school" },
      { status: 500 }
    );
  }
}
