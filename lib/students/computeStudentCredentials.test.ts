/**
 * @jest-environment node
 */
import bcrypt from "bcryptjs";
import { dobDefaultPasswordCheck } from "@/lib/students/studentDefaultPassword";

const mockStudentFindMany = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock("@/lib/db/tenantContext", () => ({
  tenantDb: {
    student: { findMany: (...a: unknown[]) => mockStudentFindMany(...a) },
    user: { update: (...a: unknown[]) => mockUserUpdate(...a) },
    class: { findFirst: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { computeStudentCredentials } from "@/lib/students/computeStudentCredentials";

const DOB = new Date("2012-08-28T18:30:00.000Z"); // 29 Aug 2012 in India

function student(id: string, hash: string | null, dobPasswordCheck: string | null = null) {
  return {
    id,
    admissionNumber: `ADM/${id}`,
    rollNo: null,
    dob: DOB,
    user: { id: `u-${id}`, name: id, email: `${id}@x.in`, password: hash, dobPasswordCheck },
    class: { name: "CLASS 9", section: "A" },
  };
}

describe("computeStudentCredentials", () => {
  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash("20120829", 4);
  });
  beforeEach(() => {
    mockStudentFindMany.mockReset();
    mockUserUpdate.mockReset().mockResolvedValue({});
  });
  afterEach(() => jest.restoreAllMocks());

  it("shows the DOB the app shows and saves the check so the next load needs no bcrypt", async () => {
    mockStudentFindMany.mockResolvedValue([student("a", hash)]);
    const first = await computeStudentCredentials("s1", {});
    expect(first.students[0]).toMatchObject({ password: "20120829", passwordState: "DEFAULT", passwordVerified: true });
    expect(first.pendingCount).toBe(0);
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
    const saved = mockUserUpdate.mock.calls[0][0].data.dobPasswordCheck as string;

    mockUserUpdate.mockClear();
    mockStudentFindMany.mockResolvedValue([student("a", hash, saved)]);
    const compare = jest.spyOn(bcrypt, "compare");
    const second = await computeStudentCredentials("s1", {});
    expect(compare).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(second.students[0].password).toBe("20120829");
  });

  it("does no bcrypt for students whose check was saved at creation", async () => {
    mockStudentFindMany.mockResolvedValue([student("a", hash, dobDefaultPasswordCheck(DOB, hash))]);
    const compare = jest.spyOn(bcrypt, "compare");
    const r = await computeStudentCredentials("s1", {});
    expect(compare).not.toHaveBeenCalled();
    expect(r.verifiedCount).toBe(1);
  });

  it("marks the rest PENDING once the time budget is spent, still returns every row, and saves the checked ones", async () => {
    mockStudentFindMany.mockResolvedValue([
      student("a", hash),
      student("b", hash),
      student("c", hash, dobDefaultPasswordCheck(DOB, hash)),
    ]);
    const t = Date.now();
    // 1st call sets the deadline; the budget is already gone for every later call, so only the saved one resolves.
    jest.spyOn(Date, "now").mockReturnValueOnce(t).mockReturnValue(t + 10 * 60_000);
    const r = await computeStudentCredentials("s1", {});

    expect(r.total).toBe(3);
    expect(r.students.map((s) => s.passwordState)).toEqual(["PENDING", "PENDING", "DEFAULT"]);
    expect(r.pendingCount).toBe(2);
    expect(r.mismatchCount).toBe(0);
    expect(r.students[0].passwordVerified).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("reports changed passwords as mismatches, not pending", async () => {
    mockStudentFindMany.mockResolvedValue([student("a", await bcrypt.hash("my-own-secret", 4))]);
    const r = await computeStudentCredentials("s1", {});
    expect(r.students[0].passwordState).toBe("CUSTOM");
    expect(r.mismatchCount).toBe(1);
    expect(r.pendingCount).toBe(0);
  });

  it("still returns rows if saving the checks fails", async () => {
    mockUserUpdate.mockRejectedValue(new Error("db down"));
    mockStudentFindMany.mockResolvedValue([student("a", hash)]);
    const r = await computeStudentCredentials("s1", {});
    expect(r.students[0].password).toBe("20120829");
  });
});
