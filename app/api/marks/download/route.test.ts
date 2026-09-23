/**
 * @jest-environment node
 */
import { GET } from "@/app/api/marks/download/route";

const mockGetServerSession = jest.fn();
const mockMarkFindMany = jest.fn();
const mockStudentFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    mark: { findMany: (...args: unknown[]) => mockMarkFindMany(...args) },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
  },
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/marks/download${query}`);
}

describe("GET /api/marks/download", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockMarkFindMany.mockReset();
    mockStudentFindUnique.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns pdf-format data as-is", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockMarkFindMany.mockResolvedValue([]);
    mockStudentFindUnique.mockResolvedValue({ user: { name: "Alice" }, class: { name: "Grade 5" } });
    const res = await GET(makeRequest("?format=pdf"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.format).toBe("pdf");
  });

  it("returns formatted JSON marks with a download header", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockMarkFindMany.mockResolvedValue([
      { subject: "Math", marks: 80, totalMarks: 100, grade: "A", suggestions: null, teacher: { name: "T" }, createdAt: new Date() },
    ]);
    mockStudentFindUnique.mockResolvedValue({
      user: { name: "Alice", email: "a@x.com" },
      class: { name: "Grade 5", section: "A" },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);
    const json = await res.json();
    expect(json.marks[0].percentage).toBe("80.00");
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    mockMarkFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
