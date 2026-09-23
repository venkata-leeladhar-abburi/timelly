/**
 * @jest-environment node
 */
import { GET } from "@/app/api/history/student/route";

const mockGetServerSession = jest.fn();
const mockStudentHistoryFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    studentHistory: { findMany: (...args: unknown[]) => mockStudentHistoryFindMany(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/history/student${query}`);

const session = { user: { id: "u1", schoolId: "s1" } };

describe("GET /api/history/student", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockStudentHistoryFindMany.mockReset().mockResolvedValue([]);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns all history rows for the school, ordered by deactivatedAt desc", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentHistoryFindMany.mockResolvedValue([{ id: "h1" }]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.histories).toEqual([{ id: "h1" }]);
    expect(mockStudentHistoryFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1" },
      orderBy: { deactivatedAt: "desc" },
    });
  });

  it("filters by originalStudentId when provided", async () => {
    mockGetServerSession.mockResolvedValue(session);
    await GET(request("?originalStudentId=stu1"));
    expect(mockStudentHistoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "s1", originalStudentId: "stu1" } })
    );
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentHistoryFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
