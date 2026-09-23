/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/superadmin/schools/[id]/active/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindUnique = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args) },
  },
}));

const ctx = { params: Promise.resolve({ id: "s1" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/superadmin/schools/s1/active", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

const superadminSession = { user: { id: "u1", role: "SUPERADMIN" } };

describe("PATCH /api/superadmin/schools/[id]/active", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindUnique.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(request({ isActive: false }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-superadmin session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    const res = await PATCH(request({ isActive: false }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when isActive is missing or not a boolean", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    const res = await PATCH(request({}), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the school does not exist", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSchoolFindUnique.mockResolvedValue(null);
    const res = await PATCH(request({ isActive: false }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the school with the requested isActive value", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSchoolFindUnique.mockResolvedValue({ id: "s1", name: "Test School" });
    const res = await PATCH(request({ isActive: false }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.school).toEqual({ id: "s1", name: "Test School", isActive: false });
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(superadminSession);
    mockSchoolFindUnique.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(request({ isActive: true }), ctx);
    expect(res.status).toBe(500);
  });
});
