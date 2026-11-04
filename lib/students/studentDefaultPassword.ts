import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { formatDobYmd } from "@/lib/dobCalendar";

function toDate(dob: Date | string | null | undefined): Date | null {
  if (!dob) return null;
  const date = dob instanceof Date ? dob : new Date(dob);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** UTC calendar date — matches legacy create / bulk-upload password hashing. */
export function formatDobPasswordUtc(date: Date): string {
  return date.toISOString().split("T")[0].replace(/-/g, "");
}

/** Local calendar date — matches what admins see on DOB fields in India. */
export function formatDobPasswordLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** India calendar date: the DOB exactly as the app shows it (see lib/dobCalendar.ts). */
export function formatDobPasswordIst(date: Date): string {
  return formatDobYmd(date).replace(/-/g, "");
}

/**
 * All plausible default passwords for a stored DOB, the India date (what the screens show) first. UTC,
 * server-local and India dates can differ by a day for a DOB that was saved as India midnight, and older
 * code hashed the UTC one, so those are still recognised for logins created before the fix.
 */
export function passwordCandidatesFromDob(
  dob: Date | string | null | undefined
): string[] {
  const date = toDate(dob);
  if (!date) return [];
  return [...new Set([formatDobPasswordIst(date), formatDobPasswordUtc(date), formatDobPasswordLocal(date)])];
}

/**
 * The default password for a student: the DOB exactly as the app shows it (India calendar date), as
 * YYYYMMDD. Every place that sets a DOB password must use this (or hashStudentPasswordFromDob). Not the
 * UTC or server-local date: the server runs in UTC, so either gives the day before for a DOB stored as
 * India midnight.
 */
export function canonicalStudentPasswordFromDob(
  dob: Date | string | null | undefined
): string {
  const date = toDate(dob);
  if (!date) return "";
  return formatDobPasswordIst(date);
}

/**
 * Why a password can or cannot be shown:
 *  DEFAULT   the login still uses the DOB default, so it can be shown
 *  CUSTOM    the login uses some other password (changed by the student or an admin, or set from a
 *            different DOB before the DOB was corrected); only a hash is stored, so it cannot be shown
 *  NO_LOGIN  the account has no password (deactivated)
 *  NO_DOB    there is no usable date of birth to derive a default from
 */
export type StudentPasswordState = "DEFAULT" | "CUSTOM" | "NO_LOGIN" | "NO_DOB" | "PENDING";

/*
 * Checking a hash against the DOB defaults is a bcrypt compare (~0.1-0.2 s each), far too slow to repeat
 * for a whole school on every page load. The result is saved in User.dobPasswordCheck as
 * "<key>:<index of the matching candidate, or - for none>", where the key is a digest of the hash and the
 * DOB candidates. A new password or a corrected DOB changes the key, so a stale result is never used: it
 * is just checked again, and nothing that sets a password has to clear it. Only the index is stored,
 * never the password, so the column is safe wherever a whole User row is read.
 */
function dobPasswordCheckKey(dob: Date | string | null | undefined, passwordHash: string): string {
  return createHash("sha256")
    .update(`${passwordHash}|${passwordCandidatesFromDob(dob).join(",")}`)
    .digest("hex")
    .slice(0, 32);
}

/** Value for User.dobPasswordCheck: `match` is the DOB default the hash was made from, or "" for none. */
export function encodeDobPasswordCheck(
  dob: Date | string | null | undefined,
  passwordHash: string,
  match: string
): string {
  const index = match ? passwordCandidatesFromDob(dob).indexOf(match) : -1;
  return `${dobPasswordCheckKey(dob, passwordHash)}:${index >= 0 ? index : "-"}`;
}

/** The saved match ("" = not a DOB default), or null when nothing valid is saved for this hash and DOB. */
export function decodeDobPasswordCheck(
  stored: string | null | undefined,
  dob: Date | string | null | undefined,
  passwordHash: string
): string | null {
  if (!stored) return null;
  const sep = stored.indexOf(":");
  if (sep < 0 || stored.slice(0, sep) !== dobPasswordCheckKey(dob, passwordHash)) return null;
  const index = stored.slice(sep + 1);
  if (index === "-") return "";
  if (!/^\d+$/.test(index)) return null;
  return passwordCandidatesFromDob(dob)[Number(index)] ?? null;
}

/** True when the state can be worked out without a bcrypt compare. */
export function isStudentPasswordStateCheap(
  dob: Date | string | null | undefined,
  passwordHash: string | null | undefined,
  storedCheck: string | null | undefined
): boolean {
  if (!passwordHash || passwordCandidatesFromDob(dob).length === 0) return true;
  return decodeDobPasswordCheck(storedCheck, dob, passwordHash) !== null;
}

/**
 * `check` is returned when a bcrypt compare was needed: save it to User.dobPasswordCheck so the next
 * call is instant.
 */
export async function resolveStudentPasswordState(
  dob: Date | string | null | undefined,
  passwordHash: string | null | undefined,
  storedCheck?: string | null
): Promise<{ password: string; verified: boolean; state: StudentPasswordState; check?: string }> {
  if (!passwordHash) return { password: "", verified: false, state: "NO_LOGIN" };
  if (passwordCandidatesFromDob(dob).length === 0) {
    return { password: "", verified: false, state: "NO_DOB" };
  }
  const saved = decodeDobPasswordCheck(storedCheck, dob, passwordHash);
  if (saved !== null) {
    return saved
      ? { password: saved, verified: true, state: "DEFAULT" }
      : { password: canonicalStudentPasswordFromDob(dob), verified: false, state: "CUSTOM" };
  }
  const resolved = await resolveVerifiedStudentPassword(dob, passwordHash);
  return {
    ...resolved,
    state: resolved.verified ? "DEFAULT" : "CUSTOM",
    check: encodeDobPasswordCheck(dob, passwordHash, resolved.verified ? resolved.password : ""),
  };
}

export async function resolveVerifiedStudentPassword(
  dob: Date | string | null | undefined,
  passwordHash: string | null | undefined
): Promise<{ password: string; verified: boolean }> {
  if (!passwordHash) {
    return { password: "", verified: false };
  }

  for (const candidate of passwordCandidatesFromDob(dob)) {
    try {
      if (await bcrypt.compare(candidate, passwordHash)) {
        return { password: candidate, verified: true };
      }
    } catch {
      /* invalid hash */
    }
  }

  return {
    password: canonicalStudentPasswordFromDob(dob),
    verified: false,
  };
}

export async function hashStudentPasswordFromDob(
  dob: Date | string | null | undefined
): Promise<string> {
  const plain = canonicalStudentPasswordFromDob(dob);
  if (!plain) throw new Error("Invalid date of birth");
  return bcrypt.hash(plain, 10);
}

/**
 * User.dobPasswordCheck for a hash just made from the DOB default. Save it with the password so the
 * credentials page can show the password without a bcrypt compare.
 */
export function dobDefaultPasswordCheck(dob: Date | string | null | undefined, passwordHash: string): string {
  return encodeDobPasswordCheck(dob, passwordHash, canonicalStudentPasswordFromDob(dob));
}
