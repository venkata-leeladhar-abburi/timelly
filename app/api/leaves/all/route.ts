import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.schoolId) {
  return new Response(JSON.stringify({ error: "Unauthorized: No school assigned" }), { status: 401 });
}
const leaves = await prisma.leaveRequest.findMany({
  where: { schoolId: session.user.schoolId },
  include: {
    teacher: { select: { id: true, name: true, email: true } },
    approver: { select: { id: true, name: true, email: true } },
  },
  orderBy: { createdAt: "desc" },
});

    return new Response(JSON.stringify(leaves), { status: 200 });
  } catch (err: any) {
    console.error("Fetch all leaves error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
