import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { dueHeadRowsFromBreakdown, type DueHeadRow } from "@/lib/fees/feeBreakdownPaymentRows";
import { extraFeeIdFromAllocationKey, normalizeFeeAllocationKey } from "@/lib/fees/feeAllocationKeys";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import {
  fetchFeeBreakdownFast,
  getFeeBreakdownCached,
} from "@/lib/fees/feeBreakdownClientCache";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import Spinner from "../../../common/Spinner";
import type { FeePaymentSuccess } from "./types";
import { buildConfirmedPaymentResult, dueToPayInputString, sanitizeMoneyInput } from "./studentDetailHelpers";

export function StudentFeesPaymentModal({
  studentId,
  studentName,
  initialFeeBreakdown,
  breakdownPending = false,
  onClose,
  onSuccess,
  onPaymentFailed,
}: {
  studentId: string;
  studentName: string;
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null;
  breakdownPending?: boolean;
  onClose: () => void;
  onSuccess: (result: FeePaymentSuccess) => void;
  onPaymentFailed?: (message: string) => void;
}) {
  const { data: session } = useSession();
  const collectorName =
    (session?.user?.name || session?.user?.email || "").trim() || "Staff";
  const collectorUserId = session?.user?.id ?? null;

  const seedRows = dueHeadRowsFromBreakdown(
    initialFeeBreakdown ?? getFeeBreakdownCached(studentId)
  ).filter((r) => !isPreviousYearFeeHeadName(r.label));
  const [rows, setRows] = useState<DueHeadRow[]>(seedRows);
  const [loading, setLoading] = useState(seedRows.length === 0 && breakdownPending);
  const [saving, setSaving] = useState(false);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [mode, setMode] = useState<"CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS">("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = dueHeadRowsFromBreakdown(initialFeeBreakdown);
    if (next.length > 0) {
      setRows((prev) => {
        const payByKey = new Map(prev.map((r) => [r.key, r.payAmount]));
        const entireByKey = new Map(prev.map((r) => [r.key, r.payEntireHead]));
        return next.map((r) => ({
          ...r,
          payAmount: payByKey.get(r.key) ?? r.payAmount,
          payEntireHead: entireByKey.get(r.key) ?? r.payEntireHead,
        }));
      });
      setLoading(false);
    }
  }, [initialFeeBreakdown]);

  useEffect(() => {
    if (rows.length > 0) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchFeeBreakdownFast(studentId);
        if (!cancelled && data) {
          setRows(
            dueHeadRowsFromBreakdown(data).filter((r) => !isPreviousYearFeeHeadName(r.label))
          );
          setPaymentDate(new Date().toISOString().slice(0, 10));
        } else if (!cancelled && !data) {
          throw new Error("Failed to load fee heads");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load fee heads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, rows.length]);

  const setRowAmount = (key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = sanitizeMoneyInput(value);
        const parsed = Number(next);
        const matchesFull =
          next.trim() !== "" &&
          Number.isFinite(parsed) &&
          parsed > 0 &&
          Math.abs(parsed - r.dueBefore) <= 0.01;
        return { ...r, payAmount: next, payEntireHead: matchesFull };
      })
    );
    setShowPaymentStep(false);
  };

  const togglePayEntireHead = (key: string, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (checked) {
          return {
            ...r,
            payEntireHead: true,
            payAmount: dueToPayInputString(r.dueBefore),
          };
        }
        return { ...r, payEntireHead: false, payAmount: "" };
      })
    );
    setShowPaymentStep(false);
  };

  const total = rows.reduce((s, r) => s + (Number(r.payAmount) > 0 ? Number(r.payAmount) : 0), 0);
  const selectedRows = rows.filter((r) => Number(r.payAmount) > 0);
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalAmount += r.totalAmount;
      acc.discountAmount += r.discountAmount;
      acc.paidAmount += r.paidAmount;
      acc.balance += r.dueBefore;
      return acc;
    },
    { totalAmount: 0, discountAmount: 0, paidAmount: 0, balance: 0 }
  );
  totals.totalAmount = Math.round(totals.totalAmount * 100) / 100;
  totals.discountAmount = Math.round(totals.discountAmount * 100) / 100;
  totals.paidAmount = Math.round(totals.paidAmount * 100) / 100;
  totals.balance = Math.round(totals.balance * 100) / 100;

  const continueToPayment = () => {
    setError(null);
    if (selectedRows.length === 0) {
      setError("Enter amount in at least one fee head.");
      return;
    }
    for (const r of selectedRows) {
      const n = Number(r.payAmount);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`Invalid amount for ${r.label}`);
        return;
      }
      if (n > r.dueBefore + 0.01) {
        setError(`Amount for ${r.label} cannot exceed due ₹${r.dueBefore.toLocaleString("en-IN")}`);
        return;
      }
    }
    setShowPaymentStep(true);
  };

  const submit = async () => {
    setError(null);
    if (selectedRows.length === 0) {
      setError("Enter amount in at least one fee head.");
      return;
    }
    for (const r of selectedRows) {
      const n = Number(r.payAmount);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`Invalid amount for ${r.label}`);
        return;
      }
      if (n > r.dueBefore + 0.01) {
        setError(`Amount for ${r.label} cannot exceed due ₹${r.dueBefore.toLocaleString("en-IN")}`);
        return;
      }
    }
    if (mode !== "CASH" && !referenceNo.trim()) {
      setError("Reference / UTR is required for non-cash payment.");
      return;
    }

    const selectedHeads = selectedRows
      .map((r) => {
        const sourceKey = normalizeFeeAllocationKey(r.sourceKey || r.key);
        if (sourceKey.startsWith("BASE:")) {
          const idx = Number(sourceKey.slice("BASE:".length));
          if (!Number.isFinite(idx)) return null;
          return {
            headType: "BASE_COMPONENT" as const,
            componentIndex: idx,
            componentName: r.label,
          };
        }
        const extraFeeId = extraFeeIdFromAllocationKey(sourceKey);
        if (extraFeeId) {
          return {
            headType: "EXTRA_FEE" as const,
            extraFeeId,
          };
        }
        return null;
      })
      .filter((h): h is { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string } | { headType: "EXTRA_FEE"; extraFeeId: string } => h !== null);

    if (selectedHeads.length === 0) {
      setError("Could not parse selected fee heads.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/fees/offline-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId,
          amount: total,
          paymentMode: mode,
          refNo: referenceNo.trim() || undefined,
          transactionId: referenceNo.trim() || undefined,
          paymentDate,
          selectedHeads,
          explicitAllocations: selectedRows.map((r) => ({
            key: normalizeFeeAllocationKey(r.sourceKey || r.key),
            amount: Number(r.payAmount),
            label: r.label,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Payment failed");
      }
      if (data.idempotent === true) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "This UTR / reference was already recorded for these fee heads."
        );
      }
      const confirmedResult = buildConfirmedPaymentResult(
        data,
        total,
        mode,
        paymentDate,
        referenceNo,
        selectedRows,
        initialFeeBreakdown ?? getFeeBreakdownCached(studentId),
        {
          collectedByName: collectorName,
          collectedByUserId: collectorUserId,
        }
      );
      onSuccess(confirmedResult);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Payment failed";
      onPaymentFailed?.(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-7xl rounded-2xl border border-white/10 bg-[#0B1220] p-4 sm:p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Fees Sheet — {studentName}</h4>
            <p className="text-xs text-white/60 mt-1">Enter amount per head like a spreadsheet, then submit payment.</p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {rows.length === 0 && loading ? (
          <div className="py-10 text-center text-white/70"><Spinner /></div>
        ) : (
          <>
            <div className="max-h-[min(360px,50vh)] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-white/70 sticky top-0 z-[1]">
                  <tr>
                    <th className="px-3 py-2 min-w-[10rem]">Fee Type</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6.5rem]">Total</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6rem]">Discount</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6rem]">Paid</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6rem]">Balance</th>
                    <th className="w-11 px-1 py-2 text-center" title="Pay full balance for this head">
                      All
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap w-[7.5rem]">Record Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-white/5">
                      <td className="px-3 py-2 text-white align-top leading-snug break-words">{r.label}</td>
                      <td className="px-2 py-2 text-white whitespace-nowrap text-right align-top">₹{Math.round(r.totalAmount).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-cyan-300 whitespace-nowrap text-right align-top">₹{Math.round(r.discountAmount).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-lime-300 whitespace-nowrap text-right align-top">₹{Math.round(r.paidAmount).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-amber-300 whitespace-nowrap text-right align-top">₹{Math.round(r.dueBefore).toLocaleString("en-IN")}</td>
                      <td className="px-1 py-2 text-center align-top">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                          checked={r.payEntireHead}
                          disabled={r.dueBefore <= 0}
                          onChange={(e) => togglePayEntireHead(r.key, e.target.checked)}
                          aria-label={`Pay full balance for ${r.label}`}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={r.payAmount}
                          onChange={(e) => setRowAmount(r.key, e.target.value)}
                          className="w-full min-w-[5.5rem] rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white"
                          placeholder="0.00"
                          aria-label={`Record fee for ${r.label}`}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 bg-white/5 font-semibold">
                    <td className="px-3 py-2 text-white">Total</td>
                    <td className="px-2 py-2 text-white whitespace-nowrap text-right">₹{Math.round(totals.totalAmount).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2 text-cyan-300 whitespace-nowrap text-right">₹{Math.round(totals.discountAmount).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2 text-lime-300 whitespace-nowrap text-right">₹{Math.round(totals.paidAmount).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2 text-amber-300 whitespace-nowrap text-right">₹{Math.round(totals.balance).toLocaleString("en-IN")}</td>
                    <td className="px-1 py-2" />
                    <td className="px-2 py-2 text-blue-300 whitespace-nowrap">₹{total.toLocaleString("en-IN")}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {!showPaymentStep ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={continueToPayment}
                  className="rounded-xl bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"
                >
                  Continue
                </button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-white/60">Payment mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS")}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="DD">DD</option>
                    <option value="OTHERS">Others</option>
                  </select>
                </div>
                {mode !== "CASH" ? (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs text-white/60">Reference / UTR</label>
                    <input
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                      placeholder="Enter transaction reference"
                    />
                  </div>
                ) : (
                  <div className="md:col-span-2 flex items-end">
                    <p className="text-xs text-lime-300">Cash selected: UTR not required.</p>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs text-white/60">Payment date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-lime-500/30 bg-lime-500/10 px-3 py-2 text-sm text-lime-200">
              Total to pay now: ₹{total.toLocaleString("en-IN")}
            </div>
            {error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && onClose()}
                disabled={saving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || !showPaymentStep}
                className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
              >
                {saving ? "Processing..." : "Pay & Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
