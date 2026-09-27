import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const createTemplateBodySchema = z.object({
      name: z.string().optional(),
      description: z.string().optional().nullable(),
      template: z.string().optional(),
      imageUrl: z.string().optional().nullable(),
    });
    const parsedBody = createTemplateBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "Name and template are required" },
        { status: 400 }
      );
    }
    const { name, description, template, imageUrl } = parsedBody.data;

    if (!name || !template) {
      return NextResponse.json(
        { message: "Name and template are required" },
        { status: 400 }
      );
    }

    const schoolId = session.user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const certificateTemplate = await prisma.certificateTemplate.create({
      data: {
        name,
        description: description || null,
        template,
        imageUrl: imageUrl || null,
        schoolId,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "Certificate template created successfully", template: certificateTemplate },
      { status: 201 }
    );
    });
  } catch (error: unknown) {
    logger.error("Create certificate template error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
