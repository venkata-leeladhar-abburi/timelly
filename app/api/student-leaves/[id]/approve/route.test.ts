/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/student-leaves/[id]/approve/route";

const mockGetServerSession = jest.fn();
const mockLeaveUpdate = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/notificationService", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    studentLeaveRequest: { update: (...args: unknown[]) => mockLeaveUpdate(...args) },
  },
}));

const ctx = { params: Promise.resolve({ id: "lv1" }) };
const request = () => new Request("http://localhost/api/student-leaves/lv1/approve", { method: "PATCH" });

describe("PATCH /api/student-leaves/[id]/approve", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockLeaveUpdate.mockReset();
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot approve leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(403);
  });

  it("approves the pending leave and notifies the student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockLeaveUpdate.mockResolvedValue({
      id: "lv1",
      status: "APPROVED",
      student: { userId: "su1" },
    });

    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.leave.status).toBe("APPROVED");

    expect(mockLeaveUpdate).toHaveBeenCalledWith({
      where: { id: "lv1", status: "PENDING" },
      data: { status: "APPROVED", approverId: "t1" },
      include: { student: { select: { userId: true } } },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "su1",
      "LEAVE",
      "Student leave approved",
      expect.any(String)
    );
  });

  it("allows SCHOOLADMIN to approve as well", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "a1", role: "SCHOOLADMIN" } });
    mockLeaveUpdate.mockResolvedValue({ id: "lv1", status: "APPROVED", student: { userId: null } });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(200);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("returns 500 when the leave is not pending (Prisma throws a not-found update error)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockLeaveUpdate.mockRejectedValue(new Error("Record to update not found"));
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(500);
  });
});
