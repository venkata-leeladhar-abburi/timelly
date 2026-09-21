import { authOptions } from "@/lib/auth/authOptions"
import prisma from "@/lib/db"
import { getServerSession } from "next-auth"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.user.schoolId) {
      return Response.json({ error: "School not found in session" }, { status: 400 })
    }
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        schoolId: session.user.schoolId,
        status: "PENDING"
      },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    })
    return Response.json(leaves)
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 })
  }
}
