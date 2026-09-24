/**
 * @jest-environment node
 */
import { POST } from "@/app/api/teacher/create/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockBcryptHash = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockSettingsFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockPurgeCache = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("@/lib/school/schoolDashboardServerCache", () => ({
  purgeSchoolDashboardServerCacheMatching: (...args: unknown[]) => mockPurgeCache(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) },
    schoolSettings: { findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args) },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/teacher/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/teacher/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockBcryptHash.mockReset();
    mockSchoolFindUnique.mockReset();
    mockSettingsFindUnique.mockReset();
    mockUserFindUnique.mockReset();
    mockUserCreate.mockReset();
    mockPurgeCache.mockReset();
    mockBcryptHash.mockResolvedValue("hashed");
    mockSchoolFindUnique.mockResolvedValue({ name: "Greenwood School" });
    mockSettingsFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no schoolId in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Jane", password: "pass1234" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name or password is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ name: "Jane" }));
    expect(res.status).toBe(400);
  });

  it("creates the teacher with a generated email and purges the cache", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUserCreate.mockResolvedValue({ id: "t1", name: "Jane", email: "jane@greenwoodschool.timelly.in" });
    const res = await POST(makeRequest({ name: "Jane", password: "pass1234" }));
    expect(res.status).toBe(201);
    expect(mockPurgeCache).toHaveBeenCalledWith("teacher:list:s1");
  });

  it("maps a Prisma P2002 email conflict to a friendly message", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUserCreate.mockRejectedValue({ code: "P2002", meta: { target: ["email"] } });
    const res = await POST(makeRequest({ name: "Jane", password: "pass1234" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/already exists/i);
  });

  it("returns 500 for other database errors", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUserCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ name: "Jane", password: "pass1234" }));
    expect(res.status).toBe(500);
  });
});
