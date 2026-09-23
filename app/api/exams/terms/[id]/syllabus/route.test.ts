/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/exams/terms/[id]/syllabus/route";

const mockGetServerSession = jest.fn();
const mockExamTermFindFirst = jest.fn();
const mockSyllabusTrackingFindMany = jest.fn();
const mockSyllabusTrackingUpsert = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    class: { findFirst: jest.fn() },
    school: { findFirst: jest.fn() },
    examTerm: { findFirst: (...args: unknown[]) => mockExamTermFindFirst(...args) },
    syllabusTracking: {
      findMany: (...args: unknown[]) => mockSyllabusTrackingFindMany(...args),
      upsert: (...args: unknown[]) => mockSyllabusTrackingUpsert(...args),
    },
  },
}));

function makeGetRequest() {
  return new Request("http://localhost/api/exams/terms/term1/syllabus");
}
function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/exams/terms/term1/syllabus", { method: "POST", body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: "term1" });

describe("GET /api/exams/terms/[id]/syllabus", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
    mockSyllabusTrackingFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the term isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns the syllabus tracking rows", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockSyllabusTrackingFindMany.mockResolvedValue([{ id: "sy1" }]);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(200);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/exams/terms/[id]/syllabus", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockExamTermFindFirst.mockReset();
    mockSyllabusTrackingUpsert.mockReset();
  });

  it("returns 400 when subject is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    const res = await POST(makePostRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it("clamps completedPercent to [0, 100] and upserts", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockResolvedValue({ id: "term1" });
    mockSyllabusTrackingUpsert.mockResolvedValue({ id: "sy1", completedPercent: 100 });
    const res = await POST(makePostRequest({ subject: "Math", completedPercent: 150 }), { params });
    expect(res.status).toBe(201);
    expect(mockSyllabusTrackingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ completedPercent: 100 }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockExamTermFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makePostRequest({ subject: "Math" }), { params });
    expect(res.status).toBe(500);
  });
});
