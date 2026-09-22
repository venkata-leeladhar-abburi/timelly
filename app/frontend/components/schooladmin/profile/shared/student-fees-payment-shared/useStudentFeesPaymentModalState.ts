import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { dueHeadRowsFromBreakdown, type DueHeadRow } from "@/lib/fees/feeBreakdownPaymentRows";
import { extraFeeIdFromAllocationKey, normalizeFeeAllocationKey } from "@/lib/fees/feeAllocationKeys";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import {
  fetchFeeBreakdownFast,
  getFeeBreakdownCached,
} from "@/lib/fees/feeBreakdownClientCache";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import type { FeePaymentSuccess } from "../types";
import { buildConfirmedPaymentResult, dueToPayInputString, sanitizeMoneyInput } from "../studentDetailHelpers";

export function useStudentFeesPaymentModalState({
  studentId,
  initialFeeBreakdown,
  breakdownPending = false,
  onSuccess,
  onPaymentFailed,
}: {
  studentId: string;
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null;
  breakdownPending?: boolean;
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

  return {
    rows,
    loading,
    saving,
    showPaymentStep,
    mode,
    setMode,
    referenceNo,
    setReferenceNo,
    paymentDate,
    setPaymentDate,
    error,
    setRowAmount,
    togglePayEntireHead,
    total,
    totals,
    continueToPayment,
    submit,
  };
}
