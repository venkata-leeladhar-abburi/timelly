/**
 * @jest-environment node
 */
import { PUT } from "@/app/api/school/update/route";

const mockGetServerSession = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    school: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

describe("PUT /api/school/update", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ name: "New Name" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when user has no schoolId", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockFindUnique.mockResolvedValue({ id: "u1", schoolId: null });
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ name: "New Name" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("created a school");
  });

  it("updates school and returns 200", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockFindUnique.mockResolvedValue({ id: "u1", schoolId: "s1" });
    const updated = { id: "s1", name: "Updated School", address: "A", location: "L" };
    mockUpdate.mockResolvedValue(updated);
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated School" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("School updated");
    expect(json.updated).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { name: "Updated School" },
    });
  });
});
