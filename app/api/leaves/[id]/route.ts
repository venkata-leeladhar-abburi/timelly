import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";

const VALID_LEAVE_TYPES = ["CASUAL", "SICK", "PAID", "UNPAID"] as const;

type Params = Promise<{ id: string }>;

/** PUT: Teacher can update own PENDING leave only */
export async function PUT(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Leave ID is required" }, { status: 400 });
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
      select: { id: true, teacherId: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }
    if (existing.teacherId !== session.user.id) {
      return NextResponse.json({ error: "You can only update your own leave" }, { status: 403 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending leave can be updated" }, { status: 409 });
    }

    let body: { leaveType?: string; reason?: string; fromDate?: string; toDate?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { leaveType, reason, fromDate, toDate } = body;
    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: "Missing required fields: fromDate, toDate" },
        { status: 400 }
      );
    }

    const normalizedType = leaveType && VALID_LEAVE_TYPES.includes(leaveType as any)
      ? (leaveType as (typeof VALID_LEAVE_TYPES)[number])
      : undefined;
    const reasonStr = typeof reason === "string" ? reason.trim() : undefined;

    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: "From date must be on or before to date." }, { status: 400 });
    }

    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        teacherId: session.user.id,
        id: { not: id },
        status: { not: "REJECTED" },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    });
    if (overlap) {
      return NextResponse.json(
        { error: "Leave already exists for this period" },
        { status: 409 }
      );
    }

    const data: { leaveType?: typeof VALID_LEAVE_TYPES[number]; reason?: string; fromDate?: Date; toDate?: Date } = {};
    if (normalizedType) data.leaveType = normalizedType;
    if (reasonStr !== undefined) data.reason = reasonStr || "—";
    data.fromDate = from;
    data.toDate = to;

    const leave = await prisma.leaveRequest.update({
      where: { id },
      data,
    });

    return NextResponse.json(leave, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    console.error("Leaves update error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE: Teacher can delete (withdraw) own PENDING leave only */
export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Leave ID is required" }, { status: 400 });
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
      select: { id: true, teacherId: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }
    if (existing.teacherId !== session.user.id) {
      return NextResponse.json({ error: "You can only delete your own leave" }, { status: 403 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending leave can be deleted" }, { status: 409 });
    }

    await prisma.leaveRequest.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    console.error("Leaves delete error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
