/**
 * @jest-environment node
 */
import { GET } from "@/app/api/leaves/pending/route";

const mockGetServerSession = jest.fn();
const mockLeaveRequestFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    leaveRequest: { findMany: (...args: unknown[]) => mockLeaveRequestFindMany(...args) },
  },
}));

describe("GET /api/leaves/pending", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockLeaveRequestFindMany.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("returns only PENDING leaves for the school, ordered oldest first", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockLeaveRequestFindMany.mockResolvedValue([{ id: "lv1", status: "PENDING" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([{ id: "lv1", status: "PENDING" }]);
    expect(mockLeaveRequestFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1", status: "PENDING" },
      include: { teacher: { select: { id: true, name: true, email: true, mobile: true } } },
      orderBy: { createdAt: "asc" },
    });
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockLeaveRequestFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
