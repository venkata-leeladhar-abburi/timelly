import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    let schoolId = session.user.schoolId;
    if (!schoolId && session.user.studentId) {
      const student = await prisma.student.findUnique({
        where: { id: session.user.studentId },
        select: { schoolId: true },
      });
      schoolId = student?.schoolId ?? null;
    }
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
      if (!schoolId && session.user.role === "TEACHER") {
        const teacherSchool = await prisma.school.findFirst({
          where: { teachers: { some: { id: session.user.id } } },
          select: { id: true },
        });
        schoolId = teacherSchool?.id ?? null;
      }
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const event = await prisma.event.findFirst({
      where: {
        id,
        schoolId,
      },
      include: {
        class: {
          select: { id: true, name: true, section: true },
        },
        teacher: {
          select: { id: true, name: true, email: true, photoUrl: true },
        },
        _count: {
          select: { registrations: true },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ message: "Event not found" }, { status: 404 });
    }

    let isRegistered = false;
    let registration: { id: string; paymentStatus: string } | null = null;
    let workshopCertificate: { id: string; title: string; certificateUrl: string | null; issuedDate: string } | null = null;
    if (session.user.studentId) {
      const [reg, cert] = await Promise.all([
        prisma.eventRegistration.findUnique({
          where: {
            eventId_studentId: {
              eventId: id,
              studentId: session.user.studentId,
            },
          },
        }),
        prisma.certificate.findFirst({
          where: {
            studentId: session.user.studentId,
            title: `${event.title} - Participation`,
          },
          select: { id: true, title: true, certificateUrl: true, issuedDate: true },
        }),
      ]);
      isRegistered = !!reg;
      if (reg) {
        registration = { id: reg.id, paymentStatus: reg.paymentStatus };
      }
      if (cert) {
        workshopCertificate = {
          id: cert.id,
          title: cert.title,
          certificateUrl: cert.certificateUrl,
          issuedDate: cert.issuedDate instanceof Date ? cert.issuedDate.toISOString() : String(cert.issuedDate),
        };
      }
    }

    return NextResponse.json({
      event: { ...event, isRegistered, registration, workshopCertificate },
    }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Get event error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
