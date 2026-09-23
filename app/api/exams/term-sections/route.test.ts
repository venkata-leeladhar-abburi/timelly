/**
 * @jest-environment node
 */
import { GET } from "@/app/api/exams/term-sections/route";

const mockGetServerSession = jest.fn();
const mockClassFindFirst = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockExamTermFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: (...args: unknown[]) => mockClassFindFirst(...args) },
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    examTerm: { findMany: (...args: unknown[]) => mockExamTermFindMany(...args) },
  },
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/exams/term-sections${query}`);
}

describe("GET /api/exams/term-sections", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when classId or examType is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await GET(makeRequest("?classId=c1"));
    expect(res.status).toBe(400);
  });

  it("resolves the matching term's sections case-insensitively", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindMany.mockResolvedValue([
      { id: "term1", name: "Midterm", sections: [{ id: "sec1", name: "A" }] },
    ]);
    const res = await GET(makeRequest("?classId=c1&examType=midterm"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.termId).toBe("term1");
    expect(json.sections).toEqual([{ id: "sec1", name: "A" }]);
  });

  it("returns null termId when no term matches", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?classId=c1&examType=midterm"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.termId).toBeNull();
    expect(json.sections).toEqual([]);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest("?classId=c1&examType=midterm"));
    expect(res.status).toBe(500);
  });
});
