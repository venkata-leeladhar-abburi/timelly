/**
 * @jest-environment node
 */
import { POST } from "@/app/api/student/offline-payment/route";

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockStudentFindUnique = jest.fn();
const mockPaymentCreate = jest.fn();
const mockStudentFeeUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: { findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args) },
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    payment: { create: (...args: unknown[]) => mockPaymentCreate(...args) },
    studentFee: { update: (...args: unknown[]) => mockStudentFeeUpdate(...args) },
  },
}));

const request = (body: unknown) =>
  new Request("http://localhost/api/student/offline-payment", {
    method: "POST",
    body: JSON.stringify(body),
  });

const validBody = {
  studentId: "stu1",
  amount: 500,
  method: "CASH",
};

describe("POST /api/student/offline-payment", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockStudentFindUnique.mockReset();
    mockPaymentCreate.mockReset();
    mockStudentFeeUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not an admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when amount is not a positive number", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" },
    });
    const res = await POST(request({ ...validBody, amount: -10 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("Valid amount is required");
  });

  it("returns 400 for an unsupported payment method", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" },
    });
    const res = await POST(request({ ...validBody, method: "CRYPTO" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("Valid payment method is required");
  });

  it("returns 404 when the student does not exist", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" },
    });
    mockStudentFindUnique.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the student is inactive", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" },
    });
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      schoolId: "s1",
      status: "Inactive",
      fee: { remainingFee: 1000 },
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/inactive/i);
  });

  it("returns 403 when the student belongs to a different school", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" },
    });
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      schoolId: "other-school",
      status: "Active",
      fee: { remainingFee: 1000 },
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when amount exceeds the remaining fee", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" },
    });
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      schoolId: "s1",
      status: "Active",
      fee: { remainingFee: 100 },
    });
    const res = await POST(request({ ...validBody, amount: 500 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/exceeds remaining fee/i);
  });

  it("records the payment and decrements the remaining fee on success", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1", name: "Admin One" },
    });
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      schoolId: "s1",
      status: "Active",
      fee: { remainingFee: 1000 },
    });
    mockPaymentCreate.mockResolvedValue({
      id: "pay1",
      amount: 500,
      status: "COMPLETED",
      createdAt: new Date("2024-01-01"),
    });
    mockStudentFeeUpdate.mockResolvedValue({ amountPaid: 500, remainingFee: 500 });

    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.updatedFee.remainingFee).toBe(500);

    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "stu1",
          amount: 500,
          status: "COMPLETED",
          gateway: "CASH",
          collectedByUserId: "u1",
          collectedByName: "Admin One",
        }),
      })
    );
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: {
        amountPaid: { increment: 500 },
        remainingFee: { decrement: 500 },
      },
    });
  });

  it("resolves schoolId from admin association when session has none", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN" },
    });
    mockSchoolFindFirst.mockResolvedValue({ id: "s2" });
    mockStudentFindUnique.mockResolvedValue({
      id: "stu1",
      schoolId: "s2",
      status: "Active",
      fee: { remainingFee: 1000 },
    });
    mockPaymentCreate.mockResolvedValue({
      id: "pay1",
      amount: 500,
      status: "COMPLETED",
      createdAt: new Date("2024-01-01"),
    });
    mockStudentFeeUpdate.mockResolvedValue({ amountPaid: 500, remainingFee: 500 });

    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    expect(mockSchoolFindFirst).toHaveBeenCalled();
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOLADMIN" },
    });
    mockSchoolFindFirst.mockResolvedValue(null);
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("School not found");
  });
});
