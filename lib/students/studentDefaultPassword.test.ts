/**
 * @jest-environment node
 */
import bcrypt from "bcryptjs";
import { formatDobYmd, parseDobToDate } from "@/lib/dobCalendar";
import {
  canonicalStudentPasswordFromDob,
  decodeDobPasswordCheck,
  dobDefaultPasswordCheck,
  encodeDobPasswordCheck,
  hashStudentPasswordFromDob,
  isStudentPasswordStateCheap,
  passwordCandidatesFromDob,
  resolveStudentPasswordState,
} from "@/lib/students/studentDefaultPassword";

// 29 Aug 2012 stored as India midnight: its UTC date is the 28th.
const IST_MIDNIGHT = new Date("2012-08-28T18:30:00.000Z");

describe("default student password follows the DOB the app shows", () => {
  it("uses the India calendar date, not the UTC one", () => {
    expect(formatDobYmd(IST_MIDNIGHT)).toBe("2012-08-29");
    expect(canonicalStudentPasswordFromDob(IST_MIDNIGHT)).toBe("20120829");
  });

  it("gives the same password for every way a DOB is stored", () => {
    for (const dob of [
      IST_MIDNIGHT,
      new Date("2012-08-29T00:00:00.000Z"),
      new Date("2012-08-29T06:30:00.000Z"),
      new Date(Date.UTC(2012, 7, 29, 12)),
      "2012-08-29",
    ]) {
      expect(canonicalStudentPasswordFromDob(dob)).toBe("20120829");
    }
  });

  it("hashes the displayed DOB, so the shown password verifies", async () => {
    const hash = await hashStudentPasswordFromDob(IST_MIDNIGHT);
    expect(await bcrypt.compare("20120829", hash)).toBe(true);
    const r = await resolveStudentPasswordState(IST_MIDNIGHT, hash);
    expect(r).toMatchObject({ password: "20120829", verified: true, state: "DEFAULT" });
  });

  it("still recognises a login hashed from the old UTC date", async () => {
    expect(passwordCandidatesFromDob(IST_MIDNIGHT)[0]).toBe("20120829");
    const r = await resolveStudentPasswordState(IST_MIDNIGHT, await bcrypt.hash("20120828", 4));
    expect(r.password).toBe("20120828");
    expect(r.state).toBe("DEFAULT");
  });
});

describe("parseDobToDate", () => {
  it("reads a full ISO timestamp as its India calendar date", () => {
    expect(parseDobToDate("2012-08-28T18:30:00.000Z")?.toISOString()).toBe("2012-08-29T12:00:00.000Z");
    expect(parseDobToDate(IST_MIDNIGHT)?.toISOString()).toBe("2012-08-29T12:00:00.000Z");
  });

  it("keeps plain and Indian-format dates as typed", () => {
    expect(parseDobToDate("2012-08-29")?.toISOString()).toBe("2012-08-29T12:00:00.000Z");
    expect(parseDobToDate("29/08/2012")?.toISOString()).toBe("2012-08-29T12:00:00.000Z");
    expect(parseDobToDate("2012-08-29T00:00:00.000Z")?.toISOString()).toBe("2012-08-29T12:00:00.000Z");
  });
});

describe("saved password check (User.dobPasswordCheck)", () => {
  it("returns a check to save after a bcrypt compare, and uses it next time without one", async () => {
    const hash = await bcrypt.hash("20120829", 4);
    const first = await resolveStudentPasswordState(IST_MIDNIGHT, hash);
    expect(first.check).toBeDefined();
    expect(isStudentPasswordStateCheap(IST_MIDNIGHT, hash, first.check)).toBe(true);

    const compare = jest.spyOn(bcrypt, "compare");
    const second = await resolveStudentPasswordState(IST_MIDNIGHT, hash, first.check);
    expect(compare).not.toHaveBeenCalled();
    compare.mockRestore();
    expect(second).toEqual({ password: "20120829", verified: true, state: "DEFAULT" });
  });

  it("remembers a changed password as not showable", async () => {
    const hash = await bcrypt.hash("my-own-secret", 4);
    const { check } = await resolveStudentPasswordState(IST_MIDNIGHT, hash);
    expect(decodeDobPasswordCheck(check, IST_MIDNIGHT, hash)).toBe("");
    const r = await resolveStudentPasswordState(IST_MIDNIGHT, hash, check);
    expect(r.state).toBe("CUSTOM");
    expect(r.verified).toBe(false);
  });

  it("ignores a saved check once the password or the DOB changes", async () => {
    const hash = await bcrypt.hash("20120829", 4);
    const check = dobDefaultPasswordCheck(IST_MIDNIGHT, hash);
    expect(decodeDobPasswordCheck(check, IST_MIDNIGHT, hash)).toBe("20120829");
    expect(decodeDobPasswordCheck(check, IST_MIDNIGHT, await bcrypt.hash("20120829", 4))).toBeNull();
    expect(decodeDobPasswordCheck(check, new Date(Date.UTC(2012, 7, 30, 12)), hash)).toBeNull();
    expect(decodeDobPasswordCheck("garbage", IST_MIDNIGHT, hash)).toBeNull();
  });

  it("never stores the password itself", () => {
    const check = encodeDobPasswordCheck(IST_MIDNIGHT, "$2a$10$abc", "20120829");
    expect(check).not.toContain("20120829");
    expect(check).toMatch(/^[0-9a-f]{32}:0$/);
  });
});
