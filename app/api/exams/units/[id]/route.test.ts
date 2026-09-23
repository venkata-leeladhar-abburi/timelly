/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/exams/units/[id]/route";

const mockGetServerSession = jest.fn();
const mockSyllabusUnitUpdate = jest.fn();
const mockSyllabusUnitFindMany = jest.fn();
const mockSyllabusTrackingUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    syllabusUnit: {
      update: (...args: unknown[]) => mockSyllabusUnitUpdate(...args),
      findMany: (...args: unknown[]) => mockSyllabusUnitFindMany(...args),
    },
    syllabusTracking: { update: (...args: unknown[]) => mockSyllabusTrackingUpdate(...args) },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/exams/units/u1", { method: "PATCH", body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: "u1" });

describe("PATCH /api/exams/units/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSyllabusUnitUpdate.mockReset();
    mockSyllabusUnitFindMany.mockReset();
    mockSyllabusTrackingUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disallowed role", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(makeRequest({}), { params });
    expect(res.status).toBe(403);
  });

  it("updates the unit and recalculates the tracking average", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockSyllabusUnitUpdate.mockResolvedValue({ id: "u1", trackingId: "tr1", completedPercent: 80 });
    mockSyllabusUnitFindMany.mockResolvedValue([{ completedPercent: 80 }, { completedPercent: 60 }]);
    mockSyllabusTrackingUpdate.mockResolvedValue({});
    const res = await PATCH(makeRequest({ completedPercent: 80 }), { params });
    expect(res.status).toBe(200);
    expect(mockSyllabusTrackingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tr1" }, data: { completedPercent: 70 } })
    );
  });

  it("clamps completedPercent to [0, 100]", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockSyllabusUnitUpdate.mockResolvedValue({ id: "u1", trackingId: "tr1" });
    mockSyllabusUnitFindMany.mockResolvedValue([]);
    const res = await PATCH(makeRequest({ completedPercent: -20 }), { params });
    expect(res.status).toBe(200);
    expect(mockSyllabusUnitUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { completedPercent: 0 } })
    );
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockSyllabusUnitUpdate.mockRejectedValue(new Error("DB exploded"));
    const res = await PATCH(makeRequest({ completedPercent: 50 }), { params });
    expect(res.status).toBe(500);
  });
});
