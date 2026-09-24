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

    // Only onboarding school admins (or the platform operator) may create a tenant.
    const role = session.user.role;
    if (role !== "SCHOOLADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { name, address, location } = await req.json();

    if (!name || !address || !location) {
      return NextResponse.json(
        { message: "Name, Address, and Location are required" },
        { status: 400 }
      );
    }

    // A school admin may own only one school; SUPERADMIN can onboard many.
    if (role === "SCHOOLADMIN") {
      const existingSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      if (existingSchool) {
        return NextResponse.json(
          { message: "You already have a school. You can only update it, not create a new one." },
          { status: 409 }
        );
      }
    }

    // 🔹 Create school
    const school = await prisma.school.create({
      data: {
        name,
        address,
        location,
        admins: {
          connect: { id: session.user.id },
        },
      },
      include: { admins: true },
    });

    // 🔹 Update user's schoolId
    await prisma.user.update({
      where: { id: session.user.id },
      data: { schoolId: school.id },
    });

    return NextResponse.json(
      { message: "School created successfully", school },
      { status: 201 }
    );

  } catch (error) {
    logger.error("Create school error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
