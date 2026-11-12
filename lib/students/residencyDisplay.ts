/**
 * Canonical stored value for hostel students remains "Hosteller" (DB / APIs).
 * Use these helpers for display labels and storage normalization.
 */

function compactResidency(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function isRteResidencyType(value: string | null | undefined): boolean {
  const n = compactResidency(value);
  return n === "rte" || n.startsWith("rte");
}

/** Children of the school's staff: a fourth category, treated like RTE for tuition (see studentRte.ts). */
export function isStaffChildResidencyType(value: string | null | undefined): boolean {
  return compactResidency(value) === "staffchild";
}

/** Normalize residency for DB storage (Day Scholar | Hosteller | RTE | Staff Child | passthrough). */
export function canonicalizeResidencyType(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "Day Scholar";
  const n = compactResidency(raw);
  if (n === "dayscholar" || n === "dayscholer") return "Day Scholar";
  if (isRteResidencyType(raw)) return "RTE";
  if (isStaffChildResidencyType(raw)) return "Staff Child";
  if (
    n === "hostel" ||
    n === "hosteller" ||
    n === "hostler" ||
    n === "hosteler" ||
    n === "hoster"
  ) {
    return "Hosteller";
  }
  return raw;
}

export function formatResidencyTypeForDisplay(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "Day Scholar";
  const n = compactResidency(raw);
  if (n === "dayscholar" || n === "dayscholer") return "Day Scholar";
  if (isRteResidencyType(raw)) return "RTE";
  if (isStaffChildResidencyType(raw)) return "Staff Child";
  if (
    n === "hostel" ||
    n === "hosteller" ||
    n === "hostler" ||
    n === "hosteler" ||
    n === "hoster"
  ) {
    return "Hostel";
  }
  return raw;
}
