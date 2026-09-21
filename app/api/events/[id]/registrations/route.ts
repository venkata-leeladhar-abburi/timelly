import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id: eventId } = await params;

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

    const event = await prisma.event.findFirst({
      where: { id: eventId, schoolId },
      select: { id: true, title: true },
    });

    if (!event) {
      return NextResponse.json(
        { message: "Event not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId },
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const students = registrations.map((r) => ({
      id: r.student.id,
      registrationId: r.id,
      name: r.student.user.name,
      email: r.student.user.email,
      class: r.student.class
        ? `${r.student.class.name}${r.student.class.section ? `-${r.student.class.section}` : ""}`
        : null,
      paymentStatus: r.paymentStatus || "PENDING",
    }));

    return NextResponse.json(
      { event, students },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Get event registrations error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
