/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { GET } from "@/app/api/student/receipt/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockStudentFindFirst = jest.fn();
const mockPaymentFindFirst = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockStudentApplicationFindFirst = jest.fn();
const mockPaymentFeeAllocationFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockGenerateReceiptPDFServer = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/receiptGeneratorServer", () => ({
  generateReceiptPDFServer: (...args: unknown[]) => mockGenerateReceiptPDFServer(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args),
      findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args),
    },
    student: { findFirst: (...args: unknown[]) => mockStudentFindFirst(...args) },
    payment: { findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args) },
    studentApplication: { findFirst: (...args: unknown[]) => mockStudentApplicationFindFirst(...args) },
    paymentFeeAllocation: { findMany: (...args: unknown[]) => mockPaymentFeeAllocationFindMany(...args) },
    extraFee: { findMany: (...args: unknown[]) => mockExtraFeeFindMany(...args) },
  },
}));

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/api/student/receipt${query}`);
}

const studentRow = {
  id: "st1",
  schoolId: "s1",
  admissionNumber: "ADM/2026/010",
  rollNo: "10",
  class: { name: "Grade 5", section: "A" },
  school: { name: "Greenwood", address: "Addr", location: "City" },
  fee: { amountPaid: 500, remainingFee: 100 },
  createdAt: new Date("2026-01-01"),
  applicationFee: 200,
  admissionFee: 300,
};

describe("GET /api/student/receipt", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentFindFirst.mockReset();
    mockPaymentFindFirst.mockReset();
    mockSchoolFindUnique.mockReset();
    mockStudentApplicationFindFirst.mockReset();
    mockPaymentFeeAllocationFindMany.mockReset();
    mockExtraFeeFindMany.mockReset();
    mockGenerateReceiptPDFServer.mockReset();
    mockSchoolFindUnique.mockResolvedValue({ name: "Greenwood", address: "Addr", location: "City" });
    mockStudentApplicationFindFirst.mockResolvedValue(null);
    mockPaymentFeeAllocationFindMany.mockResolvedValue([]);
    mockExtraFeeFindMany.mockResolvedValue([]);
    mockGenerateReceiptPDFServer.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest("?paymentId=p1&studentId=st1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no school can be resolved", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN" } });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("?paymentId=p1&studentId=st1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when paymentId or studentId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const res = await GET(makeRequest("?studentId=st1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the student doesn't belong to the school", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("?paymentId=p1&studentId=st1"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the payment isn't found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(studentRow);
    mockPaymentFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("?paymentId=p1&studentId=st1"));
    expect(res.status).toBe(404);
  });

  it("generates a receipt PDF for a real payment", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(studentRow);
    mockPaymentFindFirst.mockResolvedValue({ id: "p1", amount: 500, createdAt: new Date("2026-01-01") });
    const res = await GET(makeRequest("?paymentId=p1&studentId=st1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockGenerateReceiptPDFServer).toHaveBeenCalled();
  });

  it("generates a synthetic receipt for the admission-fee pseudo-payment", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockResolvedValue(studentRow);
    const res = await GET(makeRequest("?paymentId=admission-fee&studentId=st1"));
    expect(res.status).toBe(200);
    expect(mockPaymentFindFirst).not.toHaveBeenCalled();
  });

  it("returns 500 when generation throws", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockStudentFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(makeRequest("?paymentId=p1&studentId=st1"));
    expect(res.status).toBe(500);
  });
});
