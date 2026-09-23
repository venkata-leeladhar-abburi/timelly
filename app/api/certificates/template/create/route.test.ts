/**
 * @jest-environment node
 */
import { POST } from "@/app/api/certificates/template/create/route";

const mockGetServerSession = jest.fn();
const mockCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    certificateTemplate: { create: (...args: unknown[]) => mockCreate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/certificates/template/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/certificates/template/create", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockCreate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name or template is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await POST(makeRequest({ name: "Achievement" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no schoolId in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Achievement", template: "<html/>" }));
    expect(res.status).toBe(400);
  });

  it("creates the template and returns 201", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCreate.mockResolvedValue({ id: "tpl1", name: "Achievement" });
    const res = await POST(makeRequest({ name: "Achievement", template: "<html/>" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Achievement", schoolId: "s1", createdById: "u1" }),
      })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockCreate.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest({ name: "Achievement", template: "<html/>" }));
    expect(res.status).toBe(500);
  });
});
