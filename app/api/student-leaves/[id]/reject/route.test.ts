/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/student-leaves/[id]/reject/route";

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
const request = (body: unknown = {}) =>
  new Request("http://localhost/api/student-leaves/lv1/reject", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("PATCH /api/student-leaves/[id]/reject", () => {
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

  it("returns 403 for a role that cannot reject leave", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(403);
  });

  it("rejects the pending leave without remarks and sends a generic notification", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockLeaveUpdate.mockResolvedValue({ id: "lv1", status: "REJECTED", student: { userId: "su1" } });

    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(200);
    expect(mockLeaveUpdate).toHaveBeenCalledWith({
      where: { id: "lv1", status: "PENDING" },
      data: { status: "REJECTED", approverId: "t1", remarks: null },
      include: { student: { select: { userId: true } } },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "su1",
      "LEAVE",
      "Student leave rejected",
      "Your student leave request was rejected"
    );
  });

  it("includes remarks in the notification body when provided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "a1", role: "SCHOOLADMIN" } });
    mockLeaveUpdate.mockResolvedValue({ id: "lv1", status: "REJECTED", student: { userId: "su1" } });

    const res = await PATCH(request({ remarks: "Insufficient documentation" }), ctx);
    expect(res.status).toBe(200);
    expect(mockLeaveUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remarks: "Insufficient documentation" }) })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "su1",
      "LEAVE",
      "Student leave rejected",
      expect.stringContaining("Insufficient documentation")
    );
  });

  it("returns 500 when the update throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockLeaveUpdate.mockRejectedValue(new Error("Record to update not found"));
    const res = await PATCH(request(), ctx);
    expect(res.status).toBe(500);
  });
});
