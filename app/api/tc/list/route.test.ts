/**
 * @jest-environment node
 */
import { GET } from "@/app/api/tc/list/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    transferCertificate: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

function makeRequest(query = "") {
  return new Request(`http://localhost/api/tc/list${query}`);
}

describe("GET /api/tc/list", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("scopes the query to the student's own TCs when studentId is present", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", studentId: "st1" } });
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "s1", studentId: "st1" }) })
    );
  });

  it("filters by status query param", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockFindMany.mockResolvedValue([{ id: "tc1", status: "PENDING" }]);
    const res = await GET(makeRequest("?status=PENDING"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PENDING" }) })
    );
    const json = await res.json();
    expect(json.tcs).toEqual([{ id: "tc1", status: "PENDING" }]);
  });

  it("resolves schoolId via admin school lookup when session lacks one", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolFindFirst.mockResolvedValue({ id: "s2" });
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "s2" }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
