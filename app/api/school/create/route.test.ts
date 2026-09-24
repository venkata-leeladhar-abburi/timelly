/**
 * @jest-environment node
 */
import { POST } from "@/app/api/school/create/route";

const mockGetServerSession = jest.fn();
const mockSchoolCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockSchoolFindFirst = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args), create: (...args: unknown[]) => mockSchoolCreate(...args) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/school/create", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/school/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolCreate.mockReset();
    mockUserUpdate.mockReset();
    mockSchoolFindFirst.mockReset();
    mockSchoolFindFirst.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it.each(["STUDENT", "TEACHER", "CHAIRMAN", undefined])("returns 403 for role %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role } });
    const res = await POST(makeRequest({ name: "X", address: "A", location: "L" }));
    expect(res.status).toBe(403);
    expect(mockSchoolCreate).not.toHaveBeenCalled();
  });

  it("allows SUPERADMIN", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SUPERADMIN" } });
    mockSchoolCreate.mockResolvedValue({ id: "s1" });
    mockUserUpdate.mockResolvedValue({});
    const res = await POST(makeRequest({ name: "X", address: "A", location: "L" }));
    expect(res.status).toBe(201);
  });

  it("returns 409 when a SCHOOLADMIN already has a school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue({ id: "s0" });
    const res = await POST(makeRequest({ name: "X", address: "A", location: "L" }));
    expect(res.status).toBe(409);
    expect(mockSchoolCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await POST(makeRequest({ name: "Greenwood" }));
    expect(res.status).toBe(400);
  });

  it("creates the school and links it to the admin user", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolCreate.mockResolvedValue({ id: "s1", name: "Greenwood" });
    mockUserUpdate.mockResolvedValue({ id: "u1", schoolId: "s1" });
    const res = await POST(makeRequest({ name: "Greenwood", address: "Addr", location: "City" }));
    expect(res.status).toBe(201);
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { schoolId: "s1" } });
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ name: "Greenwood", address: "Addr", location: "City" }));
    expect(res.status).toBe(500);
  });
});
