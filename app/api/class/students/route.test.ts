/**
 * @jest-environment node
 */
import { GET } from "@/app/api/class/students/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindFirst = jest.fn();
const mockStudentFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    student: { findMany: (...args: unknown[]) => mockStudentFindMany(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/class/students${query}`);

const session = { user: { id: "u1", schoolId: "s1" } };

describe("GET /api/class/students", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindFirst.mockReset();
    mockStudentFindMany.mockReset().mockResolvedValue([]);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns all active students in the school when no classId is given", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindMany.mockResolvedValue([{ id: "stu1" }]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.students).toHaveLength(1);
    expect(mockClassFindFirst).not.toHaveBeenCalled();
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "s1" }) })
    );
  });

  it("returns 404 when the given classId does not belong to the school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockClassFindFirst.mockResolvedValue(null);
    const res = await GET(request("?classId=c1"));
    expect(res.status).toBe(404);
  });

  it("filters students by classId when it belongs to the school", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockClassFindFirst.mockResolvedValue({ id: "c1" });
    mockStudentFindMany.mockResolvedValue([{ id: "stu1", classId: "c1" }]);
    const res = await GET(request("?classId=c1"));
    expect(res.status).toBe(200);
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "s1", classId: "c1" }) })
    );
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(session);
    mockStudentFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
