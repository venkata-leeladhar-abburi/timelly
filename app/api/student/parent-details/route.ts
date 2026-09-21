import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Find student by userId instead of studentId
    const student = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: {
        address: true,
        fatherName: true,
        motherName: true,
        occupation: true,
        phoneNo: true,
      },
    });

    if (!student) {
      // Return empty values if student not found (user might not be a student)
      return NextResponse.json({
        address: "",
        fatherName: "",
        motherName: "",
        occupation: "",
        fatherPhone: "",
      });
    }

    return NextResponse.json({
      address: student.address ?? "",
      fatherName: student.fatherName ?? "",
      motherName: student.motherName ?? "",
      occupation: student.occupation ?? "",
      fatherPhone: student.phoneNo ?? "",
    });
  } catch (e: unknown) {
    console.error("Get parent details error:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Find student by userId
    const existingStudent = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!existingStudent) {
      return NextResponse.json(
        { message: "Student record not found for this user" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      address,
      fatherName,
      motherName,
      occupation,
      fatherPhone,
    } = body;

    const updateData: any = {};
    if (address !== undefined) updateData.address = address || null;
    if (fatherName !== undefined) updateData.fatherName = fatherName || null;
    if (motherName !== undefined) updateData.motherName = motherName || null;
    if (occupation !== undefined) updateData.occupation = occupation || null;
    if (fatherPhone !== undefined) updateData.phoneNo = fatherPhone || null;

    await prisma.student.update({
      where: { id: existingStudent.id },
      data: updateData,
    });

    return NextResponse.json({ message: "Parent details updated successfully" });
  } catch (e: unknown) {
    console.error("Update parent details error:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
