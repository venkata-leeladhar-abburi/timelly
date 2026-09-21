import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { message: "Invalid request body" },
        { status: 400 }
      );
    }

    const { certificateType, reason } = body;

    if (!session.user.studentId) {
      return NextResponse.json(
        { message: "Student record not found" },
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

    // Check if TC already exists (using select to avoid schema mismatches)
    const existingTC = await prisma.transferCertificate.findFirst({
      where: {
        studentId: session.user.studentId,
        status: {
          in: ["PENDING", "APPROVED"],
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingTC) {
      return NextResponse.json(
        { message: "You already have a pending or approved TC request" },
        { status: 400 }
      );
    }

    // Create TC request (certificateType column doesn't exist yet in DB)
    const tc = await prisma.transferCertificate.create({
      data: {
        reason: reason || null,
        studentId: session.user.studentId,
        requestedById: session.user.id,
        schoolId,
        status: "PENDING",
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            class: {
              select: { id: true, name: true, section: true },
            },
          },
        },
      },
    });

    return NextResponse.json(
      { message: "TC request submitted successfully", tc },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Apply TC error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    
    // Provide more specific error messages
    let errorMessage = "Internal server error";
    if (error?.message) {
      if (error.message.includes("certificateType") || error.code === "P2022") {
        errorMessage = "Database schema needs to be updated. Please contact administrator.";
      } else {
        errorMessage = error.message;
      }
    } else if (error?.code) {
      switch (error.code) {
        case "P2002":
          errorMessage = "A certificate request already exists for this student";
          break;
        case "P2003":
          errorMessage = "Invalid student or school reference";
          break;
        case "P2022":
          errorMessage = "Database schema needs to be updated. Please contact administrator.";
          break;
        default:
          errorMessage = `Database error: ${error.code}`;
      }
    }
    
    return NextResponse.json(
      { message: errorMessage },
      { status: 500 }
    );
  }
}
