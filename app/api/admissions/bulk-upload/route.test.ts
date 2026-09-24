/**
 * @jest-environment node
 */
import { POST } from "@/app/api/admissions/bulk-upload/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockSchoolFindFirst = jest.fn();
const mockClassFindMany = jest.fn();
const mockSchoolFindUnique = jest.fn();
const mockSchoolSettingsFindUnique = jest.fn();
const mockStudentApplicationFindFirst = jest.fn();
const mockStudentApplicationCreate = jest.fn();
const mockStudentApplicationUpdate = jest.fn();
const mockBcryptHash = jest.fn();
const mockTransaction = jest.fn();
const mockUpsertStudentFeeFromStructure = jest.fn();
const mockSetApplicationEnrolled = jest.fn();
const mockReadFirstSheetRows = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("bcryptjs", () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

jest.mock("@/lib/fees/studentTuitionFromStructure", () => ({
  upsertStudentFeeFromStructure: (...args: unknown[]) => mockUpsertStudentFeeFromStructure(...args),
}));

jest.mock("@/lib/admission/admissionsListQuery", () => ({
  setApplicationEnrolled: (...args: unknown[]) => mockSetApplicationEnrolled(...args),
}));

jest.mock("@/lib/excel/readWorkbookRows", () => ({
  readFirstSheetRows: (...args: unknown[]) => mockReadFirstSheetRows(...args),
  excelSerialToYmd: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    school: {
      findFirst: (...args: unknown[]) => mockSchoolFindFirst(...args),
      findUnique: (...args: unknown[]) => mockSchoolFindUnique(...args),
    },
    class: { findMany: (...args: unknown[]) => mockClassFindMany(...args) },
    schoolSettings: { findUnique: (...args: unknown[]) => mockSchoolSettingsFindUnique(...args) },
    studentApplication: {
      findFirst: (...args: unknown[]) => mockStudentApplicationFindFirst(...args),
      create: (...args: unknown[]) => mockStudentApplicationCreate(...args),
      update: (...args: unknown[]) => mockStudentApplicationUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

function makeRequest(file: File | null, query = "") {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request(`http://localhost/api/admissions/bulk-upload${query}`, { method: "POST", body: formData });
}
function makeFile() {
  return new File([new Uint8Array([1, 2, 3])], "admissions.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const validRow = {
  name: "Alice",
  fatherName: "Bob",
  phoneNo: "9876543210",
  aadhaarNo: "123456789012",
  dob: "2015-01-01",
};

describe("POST /api/admissions/bulk-upload", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockSchoolFindFirst.mockReset();
    mockClassFindMany.mockReset();
    mockSchoolFindUnique.mockReset();
    mockSchoolSettingsFindUnique.mockReset();
    mockStudentApplicationFindFirst.mockReset();
    mockStudentApplicationCreate.mockReset();
    mockStudentApplicationUpdate.mockReset();
    mockBcryptHash.mockReset();
    mockTransaction.mockReset();
    mockUpsertStudentFeeFromStructure.mockReset();
    mockSetApplicationEnrolled.mockReset();
    mockReadFirstSheetRows.mockReset();

    mockClassFindMany.mockResolvedValue([]);
    mockSchoolFindUnique.mockResolvedValue({ name: "Greenwood" });
    mockSchoolSettingsFindUnique.mockResolvedValue({ emailDomain: null });
    mockBcryptHash.mockResolvedValue("hashed");
    mockStudentApplicationFindFirst.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(401);
  });

  it("rejects a role that can't manage admissions (route maps every error to 500)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT", schoolId: "s1" } });
    const res = await POST(makeRequest(makeFile()));
    // Unlike other admissions routes, this handler's catch always returns 500
    // rather than honoring the thrown error's statusCode (403 for a role check).
    expect(res.status).toBe(500);
  });

  it("returns 400 when no file is provided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the sheet is empty", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([]);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(400);
  });

  it("records a failed row when required fields are invalid", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([{ name: "Alice", phoneNo: "123" }]);
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failedCount).toBe(1);
  });

  it("creates the application and converts it to a student by default", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([validRow]);
    mockStudentApplicationCreate.mockResolvedValue({ id: "app1", studentId: null });
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        schoolSettings: {
          findUnique: jest.fn().mockResolvedValue({ admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 5 }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({ admissionCounter: 6, admissionPrefix: "ADM", rollNoPrefix: "" }),
        },
        user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "u2" }) },
        student: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "st1" }),
        },
        class: { findUnique: jest.fn().mockResolvedValue(null) },
      })
    );
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.createdApplications).toBe(1);
    expect(json.convertedStudents).toBe(1);
    expect(mockSetApplicationEnrolled).toHaveBeenCalled();
  });

  it("only creates the application when createStudents=false", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([validRow]);
    mockStudentApplicationCreate.mockResolvedValue({ id: "app1", studentId: null });
    const res = await POST(makeRequest(makeFile(), "?createStudents=false"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.createdApplications).toBe(1);
    expect(json.convertedStudents).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("skips conversion when the application was already converted", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockReadFirstSheetRows.mockResolvedValue([validRow]);
    mockStudentApplicationFindFirst.mockResolvedValue({ id: "app1", studentId: "st1" });
    mockStudentApplicationUpdate.mockResolvedValue({ id: "app1", studentId: "st1" });
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.convertedStudents).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 500 for an unexpected top-level error", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } });
    mockClassFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await POST(makeRequest(makeFile()));
    expect(res.status).toBe(500);
  });
});
