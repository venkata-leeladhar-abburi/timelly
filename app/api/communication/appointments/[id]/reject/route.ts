import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

type RejectParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RejectParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const appointmentId = resolved.id;

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isTeacher = session.user.role === "TEACHER";

  try {
    if (!appointmentId) {
      return NextResponse.json({ message: "Appointment id missing" }, { status: 400 });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      return NextResponse.json(
        { message: "Appointment not found" },
        { status: 404 }
      );
    }

    const isOwnerTeacher = appointment.teacherId === session.user.id;

    if (!isTeacher || !isOwnerTeacher) {
      return NextResponse.json(
        { message: "Only the assigned teacher can reject" },
        { status: 403 }
      );
    }

    if (session.user.schoolId && appointment.schoolId && appointment.schoolId !== session.user.schoolId) {
      return NextResponse.json(
        { message: "Not allowed to reject appointments from another school" },
        { status: 403 }
      );
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "REJECTED" },
    });

    return NextResponse.json(
      { message: "Appointment rejected", appointment: updated },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Reject appointment error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
