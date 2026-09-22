import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import type { DueHeadRow } from "@/lib/fees/feeBreakdownPaymentRows";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import type {
  FeeDeleteSuccess,
  FeePaymentSuccess,
  StudentDetail,
  StudentOption,
} from "./types";

/** List cache may hold fees-page rows (class object) or profile rows (classDisplay). */
export function normalizeStudentOption(raw: {
  id: string;
  name?: string;
  admissionNumber?: string;
  parentName?: string;
  fatherName?: string;
  rollNo?: string | null;
  penNumber?: string | null;
  apaarId?: string | null;
  classDisplay?: string;
  classId?: string;
  section?: string | null;
  user?: { name?: string | null };
  class?: { id: string; name: string; section: string | null } | null;
  status?: string;
}): StudentOption {
  const classDisplay =
    raw.classDisplay?.trim() ||
    (raw.class
      ? `${raw.class.name}${raw.class.section ? `-${raw.class.section}` : ""}`
      : "-");
  const dash = classDisplay.indexOf("-");
  return {
    id: raw.id,
    name: raw.name?.trim() || raw.user?.name?.trim() || "Unknown",
    admissionNumber: raw.admissionNumber ?? "",
    parentName: raw.parentName?.trim() || raw.fatherName?.trim() || "-",
    classDisplay,
    classId: raw.classId ?? raw.class?.id ?? "",
    section: raw.section ?? (dash > 0 ? classDisplay.slice(dash + 1) : raw.class?.section ?? null),
    status: raw.status ?? "Active",
    rollNo: raw.rollNo ?? null,
    penNumber: raw.penNumber ?? null,
    apaarId: raw.apaarId ?? null,
  };
}

export function patchDetailShell(prev: StudentDetail | null, shell: StudentDetail): StudentDetail {
  if (!shell?.student) return prev ?? shell;
  const sameStudent = prev?.student.id === shell.student.id;
  return {
    student: shell.student,
    fee: shell.fee,
    payments: sameStudent ? (prev?.payments ?? []) : [],
    attendanceTrends: sameStudent ? (prev?.attendanceTrends ?? []) : [],
    academicPerformance: sameStudent ? (prev?.academicPerformance ?? []) : [],
    certificates: sameStudent ? (prev?.certificates ?? []) : [],
  };
}

/** Instant UI while API loads — uses data already on the student list. */
export function buildPlaceholderDetail(st: StudentOption): StudentDetail {
  const opt = normalizeStudentOption(st);
  const dash = opt.classDisplay.indexOf("-");
  const className = dash > 0 ? opt.classDisplay.slice(0, dash) : opt.classDisplay;
  const section = dash > 0 ? opt.classDisplay.slice(dash + 1) : opt.section;
  const parent = opt.parentName === "-" ? "" : opt.parentName;
  return {
    student: {
      id: opt.id,
      name: opt.name,
      schoolName: "",
      admissionNumber: opt.admissionNumber,
      email: "",
      photoUrl: null,
      rollNo: "",
      age: null,
      address: "",
      phone: "",
      fatherName: parent,
      motherName: "",
      fatherPhone: "",
      motherPhone: "",
      residencyType: "Day Scholar",
      gender: "",
      applicationFee: null,
      admissionFee: null,
      status: opt.status ?? "Active",
      class: opt.classId
        ? {
            id: opt.classId,
            name: className,
            section,
            displayName: opt.classDisplay,
          }
        : null,
    },
    fee: null,
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}

export function buildPlaceholderById(studentId: string): StudentDetail {
  return {
    student: {
      id: studentId,
      name: "Loading…",
      schoolName: "",
      admissionNumber: "",
      email: "",
      photoUrl: null,
      rollNo: "",
      age: null,
      address: "",
      phone: "",
      fatherName: "",
      motherName: "",
      fatherPhone: "",
      motherPhone: "",
      residencyType: "Day Scholar",
      gender: "",
      applicationFee: null,
      admissionFee: null,
      class: null,
    },
    fee: null,
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}

export function buildConfirmedPaymentResult(
  data: Record<string, unknown>,
  total: number,
  mode: string,
  paymentDate: string,
  referenceNo: string,
  selectedRows: DueHeadRow[],
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null,
  collector?: { collectedByName?: string | null; collectedByUserId?: string | null }
): FeePaymentSuccess {
  const payment = data.payment as Record<string, unknown> | undefined;
  const updatedFee = data.updatedFee as Record<string, unknown> | undefined;
  const apiCollectorName =
    typeof payment?.collectedByName === "string" ? payment.collectedByName.trim() : "";
  const apiCollectorUserId =
    typeof payment?.collectedByUserId === "string" ? payment.collectedByUserId : null;
  return {
    payment: {
      id: String(payment?.id ?? ""),
      amount: Number(payment?.amount ?? total),
      status: String(payment?.status ?? "SUCCESS"),
      gateway: typeof payment?.gateway === "string" ? payment.gateway : mode,
      createdAt:
        typeof payment?.createdAt === "string"
          ? payment.createdAt
          : paymentDate
            ? `${paymentDate}T12:00:00.000Z`
            : new Date().toISOString(),
      transactionId:
        typeof payment?.transactionId === "string" ? payment.transactionId : referenceNo.trim() || null,
      collectedByName: apiCollectorName || collector?.collectedByName || null,
      collectedByUserId: apiCollectorUserId || collector?.collectedByUserId || null,
    },
    updatedFee: {
      amountPaid: Number(
        updatedFee?.amountPaid ?? (initialFeeBreakdown?.amountPaid ?? 0) + total
      ),
      remainingFee: Number(
        updatedFee?.remainingFee ?? Math.max((initialFeeBreakdown?.remainingFee ?? 0) - total, 0)
      ),
      finalFee:
        typeof updatedFee?.finalFee === "number"
          ? updatedFee.finalFee
          : initialFeeBreakdown?.finalFee,
      totalFee:
        typeof updatedFee?.totalFee === "number"
          ? updatedFee.totalFee
          : initialFeeBreakdown?.totalAmount,
    },
    feeAllocations: Array.isArray(data.feeAllocations)
      ? (data.feeAllocations as Array<{ name?: string; amount?: number; key?: string }>).map(
          (line) => ({
            name: String(line?.name ?? "Fee"),
            amount: Number(line?.amount ?? 0),
            key: typeof line?.key === "string" ? line.key : undefined,
          })
        )
      : selectedRows.map((r) => ({
          name: r.label,
          amount: Number(r.payAmount),
          key: r.sourceKey || r.key,
        })),
  };
}

export function patchDetailAfterPayment(
  prev: StudentDetail | null,
  result: FeePaymentSuccess,
  fallbackLines?: Array<{ name: string; amount: number }>
): StudentDetail | null {
  if (!prev?.fee) return prev;
  const { payment, updatedFee } = result;
  const lines =
    result.feeAllocations && result.feeAllocations.length > 0
      ? result.feeAllocations
      : fallbackLines ?? [{ name: "Fee payment", amount: payment.amount }];

  const gateway = String(payment.gateway ?? "OFFLINE_CASH");
  const createdAt =
    typeof payment.createdAt === "string"
      ? payment.createdAt
      : new Date(payment.createdAt).toISOString();

  return {
    ...prev,
    fee: {
      ...prev.fee,
      amountPaid: updatedFee.amountPaid,
      remainingFee: updatedFee.remainingFee,
      totalFee: updatedFee.finalFee ?? prev.fee.totalFee,
    },
    payments: [
      {
        id: payment.id,
        amount: payment.amount,
        status: payment.status || "SUCCESS",
        method: gateway,
        createdAt,
        transactionId: payment.transactionId ?? null,
        collectedByName: payment.collectedByName ?? null,
        collectedByUserId: payment.collectedByUserId ?? null,
        feeAllocations: lines,
      },
      ...prev.payments.filter((p) => p.id !== payment.id),
    ],
  };
}

export function normalizeBreakdownHeadKey(raw: string): string {
  const key = raw.trim();
  if (key.startsWith("BASE:")) return key.split("::")[0]!;
  if (key.startsWith("EXTRA:")) return key.split("::")[0]!;
  return key;
}

export function patchBreakdownAfterDelete(
  prev: AdminStudentFeeBreakdownResult | null,
  updatedFee: FeePaymentSuccess["updatedFee"]
): AdminStudentFeeBreakdownResult | null {
  if (!prev) return prev;
  const allCleared = updatedFee.amountPaid <= 0.00001;
  const dueHeads = allCleared
    ? prev.dueHeads.map((h) => ({ ...h, dueBefore: h.snapshotAmount }))
    : prev.dueHeads;
  return {
    ...prev,
    amountPaid: updatedFee.amountPaid,
    remainingFee: updatedFee.remainingFee,
    finalFee: updatedFee.finalFee ?? prev.finalFee,
    totalAmount: prev.totalAmount,
    dueHeads,
  };
}

export function patchBreakdownAfterPayment(
  prev: AdminStudentFeeBreakdownResult | null,
  result: FeePaymentSuccess
): AdminStudentFeeBreakdownResult | null {
  if (!prev) return prev;
  const { feeAllocations } = result;

  const deductByKey = new Map<string, number>();
  for (const line of feeAllocations ?? []) {
    const key =
      typeof (line as { key?: string }).key === "string"
        ? normalizeBreakdownHeadKey((line as { key: string }).key)
        : "";
    if (!key) continue;
    deductByKey.set(key, (deductByKey.get(key) ?? 0) + (Number(line.amount) || 0));
  }

  const dueHeads =
    deductByKey.size > 0
      ? prev.dueHeads.map((h) => {
          const deduct = deductByKey.get(normalizeBreakdownHeadKey(h.key)) ?? 0;
          if (deduct <= 0) return h;
          const dueBefore = Math.max(Math.round((h.dueBefore - deduct) * 100) / 100, 0);
          return { ...h, dueBefore };
        })
      : prev.dueHeads;

  // Breakdown metrics are current-year only — never copy StudentFee amountPaid/remaining
  // (those include previous-year payments and zero out "Fees Due" incorrectly).
  const currentYearHeads = dueHeads.filter((h) => !isPreviousYearFeeHeadName(h.label));
  const previousYearHeads = dueHeads.filter((h) => isPreviousYearFeeHeadName(h.label));
  const round = (n: number) => Math.round(n * 100) / 100;
  const totalAmount = round(currentYearHeads.reduce((s, h) => s + (Number(h.snapshotAmount) || 0), 0));
  const remainingFee = round(currentYearHeads.reduce((s, h) => s + (Number(h.dueBefore) || 0), 0));
  const amountPaid = round(
    currentYearHeads.reduce(
      (s, h) => s + Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
      0
    )
  );
  const previousYearTotalAmount = round(
    previousYearHeads.reduce((s, h) => s + (Number(h.snapshotAmount) || 0), 0)
  );
  const previousYearRemainingFee = round(
    previousYearHeads.reduce((s, h) => s + (Number(h.dueBefore) || 0), 0)
  );
  const previousYearAmountPaid = round(
    previousYearHeads.reduce(
      (s, h) => s + Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
      0
    )
  );

  return {
    ...prev,
    amountPaid,
    remainingFee,
    finalFee: totalAmount,
    totalAmount,
    previousYearTotalAmount,
    previousYearAmountPaid,
    previousYearRemainingFee,
    dueHeads,
  };
}

export function isSuccessPaymentStatus(status: string) {
  const u = String(status || "").toUpperCase();
  return u === "SUCCESS" || u === "COMPLETED";
}

export function computeUpdatedFeeAfterDelete(
  prev: StudentDetail,
  payment: { amount: number; status: string }
): FeeDeleteSuccess["updatedFee"] {
  if (!prev.fee || !isSuccessPaymentStatus(payment.status)) return null;
  const amt = Number(payment.amount) || 0;
  return {
    amountPaid: Math.max(0, Math.round((prev.fee.amountPaid - amt) * 100) / 100),
    remainingFee: Math.round((prev.fee.remainingFee + amt) * 100) / 100,
    finalFee: prev.fee.totalFee,
  };
}

export function patchBreakdownAfterDeletePayment(
  prev: AdminStudentFeeBreakdownResult | null,
  updatedFee: FeeDeleteSuccess["updatedFee"],
  deletedAllocations?: Array<{ name: string; amount: number; key?: string }>
): AdminStudentFeeBreakdownResult | null {
  if (!updatedFee) return prev;
  const base = patchBreakdownAfterDelete(prev, updatedFee);
  if (!base || !deletedAllocations?.length) return base;

  const addByKey = new Map<string, number>();
  for (const line of deletedAllocations) {
    const key =
      typeof line.key === "string" && line.key.trim()
        ? normalizeBreakdownHeadKey(line.key)
        : "";
    if (!key) continue;
    addByKey.set(key, (addByKey.get(key) ?? 0) + (Number(line.amount) || 0));
  }
  if (addByKey.size === 0) return base;

  const dueHeads = base.dueHeads.map((h) => {
    const add = addByKey.get(normalizeBreakdownHeadKey(h.key)) ?? 0;
    if (add <= 0) return h;
    const dueBefore = Math.round((h.dueBefore + add) * 100) / 100;
    return { ...h, dueBefore };
  });

  return { ...base, dueHeads };
}

export function patchDetailAfterDelete(
  prev: StudentDetail | null,
  deleteResult: FeeDeleteSuccess
): StudentDetail | null {
  if (!prev) return prev;
  const { paymentId, updatedFee } = deleteResult;
  return {
    ...prev,
    payments: prev.payments.filter((p) => p.id !== paymentId),
    fee:
      prev.fee && updatedFee
        ? {
            ...prev.fee,
            amountPaid: updatedFee.amountPaid,
            remainingFee: updatedFee.remainingFee,
            totalFee: updatedFee.finalFee ?? prev.fee.totalFee,
          }
        : prev.fee,
  };
}

export function dueToPayInputString(due: number): string {
  if (!Number.isFinite(due) || due <= 0) return "";
  return String(Math.round(due * 100) / 100);
}

/** Plain text amount field: digits and one decimal, max 2 fractional digits */
export function sanitizeMoneyInput(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot).replace(/\D/g, "");
  const frac = cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
  return frac.length > 0 ? `${intPart}.${frac}` : `${intPart}.`;
}
