import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { eventTitle, imageUrl } = await req.json();

    if (!eventTitle || !imageUrl) {
      return NextResponse.json(
        { message: "Event title and certificate image URL are required" },
        { status: 400 }
      );
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

    const template = await prisma.certificateTemplate.create({
      data: {
        name: `Workshop: ${eventTitle}`,
        description: `Certificate template for workshop: ${eventTitle}`,
        template: JSON.stringify({ type: "workshop", imageUrl }),
        imageUrl,
        schoolId,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "Workshop certificate template created", template },
      { status: 201 }
    );
  } catch (error: unknown) {
    logger.error("Create workshop template error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
