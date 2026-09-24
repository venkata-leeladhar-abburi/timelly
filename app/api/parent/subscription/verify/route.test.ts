/**
 * @jest-environment node
 */

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));
export {};

const mockGetServerSession = jest.fn();
const mockPaymentFindFirst = jest.fn();
const mockPaymentUpdate = jest.fn();
const mockPaymentCreate = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockSubscriptionFindFirst = jest.fn();
const mockSubscriptionUpsert = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payment: {
      findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
      create: (...args: unknown[]) => mockPaymentCreate(...args),
    },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    parentSubscription: {
      findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
      upsert: (...args: unknown[]) => mockSubscriptionUpsert(...args),
    },
  },
}));

// HYPERPG_MERCHANT_ID/HYPERPG_API_KEY are read once at module load with no DB
// fallback, so this module must be required fresh after the env is set.
process.env.HYPERPG_MERCHANT_ID = "merchant1";
process.env.HYPERPG_API_KEY = "key1";
let POST: typeof import("@/app/api/parent/subscription/verify/route").POST;
beforeAll(() => {
  jest.resetModules();
  POST = require("@/app/api/parent/subscription/verify/route").POST;
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/parent/subscription/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const studentSession = { user: { id: "u1", role: "STUDENT", studentId: "st1" } };

describe("POST /api/parent/subscription/verify", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockPaymentFindFirst.mockReset();
    mockPaymentUpdate.mockReset();
    mockPaymentCreate.mockReset();
    mockStudentFindUnique.mockReset();
    mockSubscriptionFindFirst.mockReset();
    mockSubscriptionUpsert.mockReset();
    global.fetch = jest.fn();
  });

  it("returns 401 when the session isn't a student", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when order_id is missing", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    const res = await POST(makeRequest({ amount: 200 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid amount", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    const res = await POST(makeRequest({ order_id: "ord1", amount: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 502 when the gateway status call fails", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, text: async () => "error" });
    const res = await POST(makeRequest({ order_id: "ord1", amount: 200 }));
    expect(res.status).toBe(502);
  });

  it("returns 400 when the order isn't charged yet", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ status: "NEW" }) });
    const res = await POST(makeRequest({ order_id: "ord1", amount: 200 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an amount mismatch", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 500 }),
    });
    const res = await POST(makeRequest({ order_id: "ord1", amount: 200 }));
    expect(res.status).toBe(400);
  });

  it("creates the subscription and records a new payment on first verification", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 200, id: "hp1" }),
    });
    mockPaymentFindFirst.mockResolvedValue(null);
    mockPaymentCreate.mockResolvedValue({ id: "pay1" });
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    mockSubscriptionFindFirst.mockResolvedValue(null);
    mockSubscriptionUpsert.mockResolvedValue({ id: "sub1", status: "ACTIVE" });
    const res = await POST(makeRequest({ order_id: "ord1", amount: 200 }));
    expect(res.status).toBe(200);
    expect(mockPaymentCreate).toHaveBeenCalled();
    expect(mockSubscriptionUpsert).toHaveBeenCalled();
  });

  it("extends an existing active subscription instead of restarting the period", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 200, id: "hp1" }),
    });
    mockPaymentFindFirst.mockResolvedValue({ id: "pay1" });
    mockPaymentUpdate.mockResolvedValue({ id: "pay1" });
    mockStudentFindUnique.mockResolvedValue({ schoolId: "s1" });
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    mockSubscriptionFindFirst.mockResolvedValue({ id: "sub1", currentPeriodEnd: future, trialEndsAt: null });
    mockSubscriptionUpsert.mockResolvedValue({ id: "sub1", status: "ACTIVE" });
    const res = await POST(makeRequest({ order_id: "ord1", amount: 200 }));
    expect(res.status).toBe(200);
    expect(mockPaymentUpdate).toHaveBeenCalled();
  });

  it("returns 404 when the student isn't found", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "CHARGED", amount: 200, id: "hp1" }),
    });
    mockPaymentFindFirst.mockResolvedValue(null);
    mockPaymentCreate.mockResolvedValue({ id: "pay1" });
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ order_id: "ord1", amount: 200 }));
    expect(res.status).toBe(404);
  });

  it("returns 500 when the database throws", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
    const res = await POST(makeRequest({ order_id: "ord1", amount: 200 }));
    expect(res.status).toBe(500);
  });
});
