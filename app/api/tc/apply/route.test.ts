/**
 * @jest-environment node
 */
import { POST } from "@/app/api/tc/apply/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    transferCertificate: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tc/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/tc/apply", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindFirst.mockReset();
    mockCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the session has no studentId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the session has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a pending or approved TC already exists", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockFindFirst.mockResolvedValue({ id: "tc1", status: "PENDING" });
    const res = await POST(makeRequest({ reason: "moving" }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the TC request and returns 201", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "tc1", status: "PENDING" });
    const res = await POST(makeRequest({ reason: "moving" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentId: "st1", schoolId: "s1", status: "PENDING" }),
      })
    );
  });

  it("maps a Prisma P2002 error to a friendly message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockRejectedValue({ code: "P2002" });
    const res = await POST(makeRequest({ reason: "moving" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toMatch(/already exists/i);
  });

  it("returns 500 when the database throws a generic error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", studentId: "st1", schoolId: "s1" } });
    mockFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ reason: "moving" }));
    expect(res.status).toBe(500);
  });
});
