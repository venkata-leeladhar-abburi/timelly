import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { templateId, studentId, title, description, certificateUrl, eventId } = await req.json();

    if (!templateId || !studentId || !title) {
      return NextResponse.json(
        { message: "Template ID, student ID, and title are required" },
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

    // Verify template belongs to school
    const template = await prisma.certificateTemplate.findFirst({
      where: {
        id: templateId,
        schoolId: schoolId,
      },
    });

    if (!template) {
      return NextResponse.json(
        { message: "Certificate template not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    // Verify student belongs to school
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        schoolId: schoolId,
      },
    });

    if (!student) {
      return NextResponse.json(
        { message: "Student not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    if (eventId) {
      const event = await prisma.event.findFirst({
        where: { id: eventId, schoolId },
      });
      if (!event) {
        return NextResponse.json(
          { message: "Event not found or doesn't belong to your school" },
          { status: 404 }
        );
      }
    }

    const certificate = await prisma.certificate.create({
      data: {
        title,
        description: description || null,
        templateId,
        studentId,
        issuedById: session.user.id,
        schoolId,
        certificateUrl: certificateUrl || null,
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        template: {
          select: { id: true, name: true },
        },
        issuedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (certificate.student?.user?.id) {
      createNotification(
        certificate.student.user.id,
        "CERTIFICATES",
        "Certificate issued",
        `${title} has been issued to you`
      ).catch(() => {});
    }

    return NextResponse.json(
      { message: "Certificate assigned successfully", certificate },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Assign certificate error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
