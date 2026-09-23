/**
 * @jest-environment node
 */
import { POST } from "@/app/api/school/create/route";

const mockGetServerSession = jest.fn();
const mockSchoolCreate = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { create: (...args: unknown[]) => mockSchoolCreate(...args) },
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
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Greenwood" }));
    expect(res.status).toBe(400);
  });

  it("creates the school and links it to the admin user", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolCreate.mockResolvedValue({ id: "s1", name: "Greenwood" });
    mockUserUpdate.mockResolvedValue({ id: "u1", schoolId: "s1" });
    const res = await POST(makeRequest({ name: "Greenwood", address: "Addr", location: "City" }));
    expect(res.status).toBe(201);
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { schoolId: "s1" } });
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockSchoolCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ name: "Greenwood", address: "Addr", location: "City" }));
    expect(res.status).toBe(500);
  });
});
