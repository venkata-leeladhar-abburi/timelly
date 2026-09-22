"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Zap, Settings, PlusCircle, AlertCircle } from "lucide-react";
import { generatePDF } from "@/lib/pdfUtils";
import { ModifyFeeModal, type FeeHeadOption, type FeeModifyResult } from "./ModifyFeeModal";
import { AddExtraFeeModal } from "./AddExtraFeeModal";
import { AssignFeeHeadsCatalogModal } from "./AssignFeeHeadsCatalogModal";
import { EditExtraFeeModal } from "./EditExtraFeeModal";
import { splitFeeHeadsForDisplay } from "@/lib/fees/feeHeadInstallmentDisplay";
import { storedDiscountRupeeAmount } from "@/lib/fees/studentFeeHeadDiscount";
import { roundRupee } from "@/lib/formatRupee";
import { grossTotalFromBreakdown, netTotalFromBreakdown } from "@/lib/fees/feeBreakdownTotals";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import {
  baseComponentIndexFromHead,
  mergeDiscountApprovals,
  type DiscountApprovalSummary,
  type FeesBreakdownProps as Props,
  type HeadCard,
} from "./shared/feesBreakdownHelpers";
import { FeeReceiptPrintLayout } from "./shared/FeeReceiptPrintLayout";
import { FeeSummaryCards } from "./shared/FeeSummaryCards";
import { FeeHeadCardsGrid } from "./shared/FeeHeadCardsGrid";
import { FeePaymentProgressSection } from "./shared/FeePaymentProgressSection";
import { EditBaseFeeHeadDialog } from "./shared/EditBaseFeeHeadDialog";
import { RecordHeadPaymentDialog } from "./shared/RecordHeadPaymentDialog";

export const FeesBreakdown = ({
  studentId,
  classId = null,
  totalFee,
  baseTotalFee,
  discountPercent,
  amountPaid,
  remainingFee,
  studentName,
  admissionNumber,
  classDisplayName,
  schoolName,
  payments = [],
  discountFeeHeadKey,
  discountFeeHeadLabel,
  discountRemarks,
  discountFixedAmount,
  latestDiscountApproval,
  discountApprovals,
  onFeeModified,
  residencyType,
  classSection = null,
  initialFeeBreakdown = null,
  feeBreakdownPending = false,
  feesRecordingDisabled = false,
}: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [showModifyFee, setShowModifyFee] = useState(false);
  const [modifyFeeOpening, setModifyFeeOpening] = useState(false);
  const [showAddExtraFee, setShowAddExtraFee] = useState(false);
  const [showAssignFeeHeadsCatalog, setShowAssignFeeHeadsCatalog] = useState(false);
  const [editExtra, setEditExtra] = useState<{
    id: string;
    name: string;
    amount: number;
    splitIntoTwoInstallments?: boolean;
  } | null>(null);
  const headsLoading = feeBreakdownPending && !initialFeeBreakdown?.dueHeads?.length;
  const [deletingExtraId, setDeletingExtraId] = useState<string | null>(null);
  const [baseHeadBusyKey, setBaseHeadBusyKey] = useState<string | null>(null);
  const [editBaseHead, setEditBaseHead] = useState<{
    classId: string;
    componentIndex: number;
    name: string;
    amount: string;
  } | null>(null);
  const [editBaseError, setEditBaseError] = useState("");
  const [baseStructureMutating, setBaseStructureMutating] = useState(false);
  const [feeHeadOptionsForDiscount, setFeeHeadOptionsForDiscount] = useState<FeeHeadOption[]>([]);
  const [headCards, setHeadCards] = useState<HeadCard[]>([]);
  const [headsTotalAmount, setHeadsTotalAmount] = useState<number | null>(null);
  const [headsRemainingAmount, setHeadsRemainingAmount] = useState<number | null>(null);
  const [previousYearRemainingAmount, setPreviousYearRemainingAmount] = useState(0);
  const [payingHead, setPayingHead] = useState<{
    key: string;
    sourceKey?: string;
    label: string;
    due: number;
    extraFeeId?: string;
  } | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    amount: string;
    mode: "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS";
    referenceNo: string;
    paymentDate: string;
  }>({
    amount: "",
    mode: "CASH",
    referenceNo: "",
    paymentDate: new Date().toISOString().slice(0, 10),
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [approvalState, setApprovalState] = useState<DiscountApprovalSummary[]>(
    discountApprovals?.length ? discountApprovals : latestDiscountApproval ? [latestDiscountApproval] : []
  );
  const approvalStudentRef = useRef(studentId);
  const refreshedApprovedDiscountsRef = useRef("");

  useEffect(() => {
    const incoming = discountApprovals?.length ? discountApprovals : latestDiscountApproval ? [latestDiscountApproval] : [];
    setApprovalState((prev) => {
      if (approvalStudentRef.current !== studentId) {
        approvalStudentRef.current = studentId;
        return incoming;
      }
      return incoming.length > 0 ? mergeDiscountApprovals(prev, incoming) : prev;
    });
  }, [studentId, discountApprovals, latestDiscountApproval]);

  const approvedDiscountRefreshKey = approvalState
    .filter((approval) => approval.status === "APPROVED")
    .map((approval) => approval.id)
    .sort()
    .join("|");

  useEffect(() => {
    if (!approvedDiscountRefreshKey || !onFeeModified) return;
    const key = `${studentId}:${approvedDiscountRefreshKey}`;
    if (refreshedApprovedDiscountsRef.current === key) return;
    refreshedApprovedDiscountsRef.current = key;
    onFeeModified();
  }, [approvedDiscountRefreshKey, onFeeModified, studentId]);

  // Paid-by-type from payments (PDF fallback only; table uses headCards / paymentProgressRows).
  const feeBreakdown = new Map<string, { amount: number; paidAmount: number }>();
  for (const payment of payments) {
    const lines =
      payment.feeAllocations && payment.feeAllocations.length > 0
        ? payment.feeAllocations
        : payment.feeTypeName
          ? [{ name: payment.feeTypeName, amount: payment.feeTypeAmount ?? payment.amount }]
          : [];

    for (const line of lines) {
      const feeType = line.name || "Other Fees";
      const paidAmount = line.amount;
      if (!feeBreakdown.has(feeType)) {
        feeBreakdown.set(feeType, { amount: paidAmount, paidAmount });
      } else {
        const existing = feeBreakdown.get(feeType)!;
        existing.amount += paidAmount;
        existing.paidAmount += paidAmount;
      }
    }
  }

  /** All fee heads with amount / paid / due — matches cards above and every allocation. */
  const paymentProgressRows = useMemo(
    () =>
      headCards.map((h) => ({
        key: h.key,
        feeType: h.label,
        amount: h.amount,
        paid: h.paid,
        due: h.due,
      })),
    [headCards]
  );

  const breakdownGrossTotal = useMemo(() => {
    if (headCards.length > 0) {
      return roundRupee(
        headCards
          .filter((h) => !isPreviousYearFeeHeadName(h.label))
          .reduce((s, h) => s + (Number(h.gross ?? h.amount) || 0), 0)
      );
    }
    const fromBundle = grossTotalFromBreakdown(initialFeeBreakdown);
    if (fromBundle != null && fromBundle > 0) return fromBundle;
    return baseTotalFee > 0 ? baseTotalFee : 0;
  }, [initialFeeBreakdown, headCards, baseTotalFee]);

  const breakdownNetTotal = useMemo(
    () => netTotalFromBreakdown(initialFeeBreakdown) ?? (headsTotalAmount != null && headsTotalAmount > 0 ? headsTotalAmount : null),
    [initialFeeBreakdown, headsTotalAmount]
  );

  const displayPreDiscountTotal = breakdownGrossTotal;

  /** Prefer breakdown head sum when loaded — stored StudentFee can be stale after bulk extra cleanup. */
  const displayTotalAmount =
    headsTotalAmount != null && headsTotalAmount > 0
      ? headsTotalAmount
      : totalFee > 0
        ? totalFee
        : 0;

  /**
   * Discount rupees must compare gross vs net from the same source.
   * Using stale StudentFee.totalFee (often 0) against live head gross falsely shows a
   * full "approved" concession (e.g. B HETVIKA ₹88,000 with no approval row).
   */
  const netForDiscount =
    breakdownNetTotal != null && breakdownNetTotal >= 0
      ? breakdownNetTotal
      : displayTotalAmount > 0
        ? displayTotalAmount
        : totalFee;
  const discountAmount =
    typeof discountFixedAmount === "number" && discountFixedAmount > 0
      ? discountFixedAmount
      : storedDiscountRupeeAmount(
          displayPreDiscountTotal > 0 ? displayPreDiscountTotal : totalFee,
          netForDiscount,
          discountFixedAmount
        );
  const raisedDiscountAmount =
    typeof approvalState[0]?.discountFixedAmount === "number" && approvalState[0].discountFixedAmount > 0
      ? approvalState[0].discountFixedAmount
      : null;
  const latestApprovalState = approvalState[0] ?? null;
  /** Never invent APPROVED from a totals mismatch — only real approval rows count. */
  const approvalStatus = latestApprovalState?.status ?? null;
  const approvalUi =
    approvalStatus === "PENDING"
      ? {
          label: "Pending chairman approval",
          chip: "Discount approval pending",
          border: "border-sky-400/25",
          bg: "bg-sky-400/10",
          text: "text-sky-200",
          dot: "bg-sky-300",
        }
      : approvalStatus === "REJECTED"
        ? {
            label: "Rejected by chairman",
            chip: "Discount rejected",
            border: "border-red-400/25",
            bg: "bg-red-400/10",
            text: "text-red-200",
            dot: "bg-red-300",
          }
        : approvalStatus === "APPROVED"
          ? {
              label: "Approved",
              chip: "Discount approved",
              border: "border-lime-400/25",
              bg: "bg-lime-400/10",
              text: "text-lime-200",
              dot: "bg-lime-300",
            }
          : null;
  const displayAmountPaid =
    headCards.length > 0
      ? roundRupee(headCards.filter((h) => !isPreviousYearFeeHeadName(h.label)).reduce((s, h) => s + h.paid, 0))
      : amountPaid;
  const displayRemainingAmount =
    headCards.length > 0
      ? roundRupee(headCards.filter((h) => !isPreviousYearFeeHeadName(h.label)).reduce((s, h) => s + h.due, 0))
      : headsRemainingAmount != null && headsRemainingAmount >= 0
        ? roundRupee(headsRemainingAmount)
        : roundRupee(Math.max(0, displayTotalAmount - displayAmountPaid));
  const paidPercentage =
    displayTotalAmount > 0 ? (displayAmountPaid / displayTotalAmount) * 100 : 0;

  const applyBreakdownData = (data: AdminStudentFeeBreakdownResult) => {
    const dueHeads = Array.isArray(data?.dueHeads) ? data.dueHeads : [];
    const normalized = dueHeads.map((h) => {
      const amount = Math.round((Number(h.snapshotAmount) || 0) * 100) / 100;
      const gross =
        Math.round((Number(h.grossAmount ?? h.snapshotAmount) || 0) * 100) / 100;
      const due = Math.round((Number(h.dueBefore) || 0) * 100) / 100;
      return {
      key: String(h.key),
      label: String(h.label || "Fee Head"),
      amount,
      gross,
      paid: Math.max(amount - due, 0),
      due,
      extraFeeId: h.headType === "EXTRA_FEE" ? h.extraFeeId : undefined,
      canDeleteExtra: h.headType === "EXTRA_FEE" ? Boolean(h.canDeleteOnStudentProfile) : false,
      headType: h.headType,
      splitIntoTwoInstallments:
        h.headType === "EXTRA_FEE" ? Boolean(h.splitIntoTwoInstallments) : undefined,
    };
    });
    setFeeHeadOptionsForDiscount(
      normalized.map((h) => ({
        key: h.key,
        label: h.label,
      }))
    );
    const splitHeads = splitFeeHeadsForDisplay(normalized);
    setHeadCards(splitHeads);
    setHeadsTotalAmount(
      roundRupee(
        Number(data?.totalAmount) > 0
          ? Number(data.totalAmount)
          : splitHeads
              .filter((h: { label: string }) => !isPreviousYearFeeHeadName(h.label))
              .reduce((s: number, h: { amount: number }) => s + h.amount, 0)
      )
    );
    setHeadsRemainingAmount(roundRupee(Number(data?.remainingFee) || 0));
    setPreviousYearRemainingAmount(roundRupee(Number(data?.previousYearRemainingFee) || 0));
  };

  const openModifyFeeModal = async () => {
    if (feesRecordingDisabled || modifyFeeOpening) return;
    try {
      setModifyFeeOpening(true);
      await Promise.resolve(onFeeModified?.());
      setShowModifyFee(true);
    } finally {
      setModifyFeeOpening(false);
    }
  };

  useEffect(() => {
    if (!initialFeeBreakdown?.dueHeads?.length) return;
    applyBreakdownData(initialFeeBreakdown);
  }, [initialFeeBreakdown, studentId]);

  const handleDownloadReceipt = async () => {
    try {
      setIsGeneratingReceipt(true);
      const timestamp = new Date().toLocaleDateString("en-IN");
      await generatePDF(receiptRef, `fee_receipt_${timestamp}.pdf`);
    } catch (error) {
      console.error("Failed to download receipt:", error);
      alert("Failed to download receipt. Please try again.");
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  const openHeadPaymentModal = (head: {
    key: string;
    sourceKey?: string;
    label: string;
    due: number;
    extraFeeId?: string;
  }) => {
    if (feesRecordingDisabled) return;
    setPayingHead(head);
    setPaymentError(null);
    setPaymentForm({
      amount: head.due > 0 ? head.due.toFixed(2) : "",
      mode: "CASH",
      referenceNo: "",
      paymentDate: new Date().toISOString().slice(0, 10),
    });
  };

  const selectedHeadFromCard = (head: { key: string; label: string; extraFeeId?: string; sourceKey?: string }) => {
    const baseIdx = baseComponentIndexFromHead(head);
    if (baseIdx !== null) {
      return {
        headType: "BASE_COMPONENT" as const,
        componentIndex: baseIdx,
        componentName: head.label,
      };
    }
    if (head.extraFeeId) {
      return {
        headType: "EXTRA_FEE" as const,
        extraFeeId: head.extraFeeId,
      };
    }
    const sourceKey = head.sourceKey ?? head.key;
    if (sourceKey.startsWith("EXTRA:")) {
      const extraId = sourceKey.slice("EXTRA:".length).split("::")[0];
      if (extraId) {
        return {
          headType: "EXTRA_FEE" as const,
          extraFeeId: extraId,
        };
      }
    }
    return null;
  };

  const normalizeStructureComponentsForSave = (
    raw: Array<{ name: unknown; amount: unknown }>
  ): Array<{ name: string; amount: number }> =>
    raw
      .map((c) => ({
        name: typeof c.name === "string" ? c.name.trim() : String(c.name ?? "").trim(),
        amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
      }))
      .filter((c) => c.name.length > 0 && Number.isFinite(c.amount));

  const persistClassFeeStructure = async (
    targetClassId: string,
    rawComponents: Array<{ name: unknown; amount: unknown }>
  ) => {
    const normalized = normalizeStructureComponentsForSave(rawComponents);
    if (normalized.length === 0) {
      const res = await fetch(`/api/fees/structure?classId=${encodeURIComponent(targetClassId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Failed to remove fee structure");
      }
      return;
    }
    const res = await fetch("/api/fees/structure", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ classId: targetClassId, components: normalized }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Failed to save fee structure");
    }
  };

  const fetchClassStructureRows = async (
    targetClassId: string
  ): Promise<Array<{ name: unknown; amount: unknown }>> => {
    const res = await fetch(`/api/fees/structure?classId=${encodeURIComponent(targetClassId)}`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Could not load fee structure");
    }
    const structures = Array.isArray(data.structures) ? data.structures : [];
    const s = structures.find((x: { classId: string }) => x.classId === targetClassId);
    return Array.isArray(s?.components) ? s.components : [];
  };

  const editExtraFeeHead = (h: HeadCard) => {
    if (!h.extraFeeId) return;
    setEditExtra({
      id: h.extraFeeId,
      name: h.extraFeeNameForEdit ?? h.label,
      amount: h.extraFeeFullAmount ?? h.amount,
      splitIntoTwoInstallments: h.splitIntoTwoInstallments,
    });
  };

  const deleteExtraFeeHead = async (h: HeadCard) => {
    if (!h.extraFeeId) return;
    const feeTitle = h.extraFeeNameForEdit ?? h.label;
    const msg = h.canDeleteExtra
      ? `Remove extra fee "${feeTitle}" for this student? Their total due will be reduced by the full fee amount.`
      : `Delete fee "${feeTitle}" from the catalog? This removes it for every student in its scope (school / class / section), not only this profile.`;
    if (!confirm(msg)) {
      return;
    }
    try {
      setDeletingExtraId(h.extraFeeId);
      const res = await fetch(`/api/fees/extra/${encodeURIComponent(h.extraFeeId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Delete failed");
        return;
      }
      onFeeModified?.();
    } catch {
      alert("Delete failed");
    } finally {
      setDeletingExtraId(null);
    }
  };

  const editBaseFeeHead = async (h: HeadCard) => {
    if (!classId) {
      alert(
        "This student has no class assigned. Class fee heads can only be edited when the student is in a class."
      );
      return;
    }
    const idx = baseComponentIndexFromHead(h);
    if (idx === null) return;
    setEditBaseError("");
    setBaseHeadBusyKey(h.key);
    try {
      const rows = await fetchClassStructureRows(classId);
      const row = rows[idx] as { name?: unknown; amount?: unknown } | undefined;
      if (!row) {
        alert("That fee head no longer exists in the class structure. Refresh the page.");
        return;
      }
      setEditBaseHead({
        classId,
        componentIndex: idx,
        name: typeof row.name === "string" ? row.name : String(row.name ?? ""),
        amount: String(typeof row.amount === "number" ? row.amount : Number(row.amount ?? 0)),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not load fee structure.");
    } finally {
      setBaseHeadBusyKey(null);
    }
  };

  const deleteBaseFeeHead = async (h: HeadCard) => {
    if (!classId) {
      alert(
        "This student has no class assigned. Class fee heads can only be removed when the student is in a class."
      );
      return;
    }
    const idx = baseComponentIndexFromHead(h);
    if (idx === null) return;
    const feeTitle = h.label;
    if (
      !confirm(
        `Remove "${feeTitle}" from the class fee structure?\n\nThis updates the global breakdown for every student in this class, not only this student.`
      )
    ) {
      return;
    }
    setBaseHeadBusyKey(h.key);
    setBaseStructureMutating(true);
    try {
      const rows = await fetchClassStructureRows(classId);
      if (idx < 0 || idx >= rows.length) {
        alert("That fee head no longer exists in the class structure. Refresh the page.");
        return;
      }
      const next = rows.filter((_, i) => i !== idx);
      await persistClassFeeStructure(classId, next);
      onFeeModified?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBaseStructureMutating(false);
      setBaseHeadBusyKey(null);
    }
  };

  const handleSaveEditBaseHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBaseHead) return;
    setEditBaseError("");
    const name = editBaseHead.name.trim();
    const amt = Number(editBaseHead.amount);
    if (!name) {
      setEditBaseError("Please enter a fee name.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditBaseError("Please enter a valid positive amount.");
      return;
    }
    setBaseStructureMutating(true);
    try {
      const rows = await fetchClassStructureRows(editBaseHead.classId);
      if (editBaseHead.componentIndex < 0 || editBaseHead.componentIndex >= rows.length) {
        alert("That fee head no longer exists in the class structure. Refresh the page.");
        setEditBaseHead(null);
        return;
      }
      const next = rows.map((c, i) =>
        i === editBaseHead.componentIndex
          ? { name, amount: amt }
          : {
              name: typeof c.name === "string" ? c.name : String(c.name ?? ""),
              amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
            }
      );
      await persistClassFeeStructure(editBaseHead.classId, next);
      setEditBaseHead(null);
      onFeeModified?.();
    } catch (err) {
      setEditBaseError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBaseStructureMutating(false);
    }
  };

  const submitHeadPayment = async () => {
    if (!payingHead) return;
    setPaymentError(null);

    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid payment amount.");
      return;
    }
    if (amount > payingHead.due) {
      setPaymentError(`Amount cannot exceed due amount ₹${payingHead.due.toLocaleString("en-IN")}.`);
      return;
    }
    if (paymentForm.mode !== "CASH" && !paymentForm.referenceNo.trim()) {
      setPaymentError("UTR / reference number is required for this payment mode.");
      return;
    }

    const selectedHead = selectedHeadFromCard(payingHead);
    if (!selectedHead) {
      setPaymentError("Could not identify fee head. Please try again.");
      return;
    }

    setPaymentSaving(true);
    try {
      const ref = paymentForm.referenceNo.trim();
      const allocationKey = payingHead.sourceKey ?? payingHead.key;
      const response = await fetch("/api/fees/offline-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId,
          amount,
          paymentMode: paymentForm.mode,
          refNo: ref || undefined,
          transactionId: ref || undefined,
          selectedHeads: [selectedHead],
          paymentDate: paymentForm.paymentDate,
          explicitAllocations: [{ key: allocationKey, amount, label: payingHead.label }],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Failed to record payment");
      }
      if (data.idempotent === true) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "This UTR / reference was already recorded for this fee head."
        );
      }
      const paidCardKey = payingHead.key;
      const paidPreviousYear = isPreviousYearFeeHeadName(payingHead.label);
      setPayingHead(null);
      setPaymentSaving(false);
      setHeadCards((prev) =>
        prev.map((h) => {
          if (h.key !== paidCardKey) return h;
          return {
            ...h,
            paid: roundRupee(h.paid + amount),
            due: roundRupee(Math.max(h.due - amount, 0)),
          };
        })
      );
      if (paidPreviousYear) {
        setPreviousYearRemainingAmount((prev) => roundRupee(Math.max(prev - amount, 0)));
      } else {
        setHeadsRemainingAmount((prev) => roundRupee(Math.max((prev ?? 0) - amount, 0)));
      }
      onFeeModified?.({
        payment: {
          id: String(data.payment?.id ?? ""),
          amount: Number(data.payment?.amount ?? amount),
          status: String(data.payment?.status ?? "SUCCESS"),
          gateway: typeof data.payment?.gateway === "string" ? data.payment.gateway : paymentForm.mode,
          createdAt:
            typeof data.payment?.createdAt === "string"
              ? data.payment.createdAt
              : paymentForm.paymentDate
                ? `${paymentForm.paymentDate}T12:00:00.000Z`
                : new Date().toISOString(),
          transactionId:
            typeof data.payment?.transactionId === "string" ? data.payment.transactionId : ref || null,
        },
        updatedFee: {
          amountPaid: Number(data.updatedFee?.amountPaid ?? 0),
          remainingFee: Number(data.updatedFee?.remainingFee ?? 0),
          finalFee:
            typeof data.updatedFee?.finalFee === "number" ? data.updatedFee.finalFee : undefined,
        },
        feeAllocations: (
          Array.isArray(data.feeAllocations) && data.feeAllocations.length > 0
            ? (data.feeAllocations as Array<{ name: string; amount: number; key?: string }>)
            : [{ name: payingHead.label, amount }]
        ).map((line, index) => (index === 0 ? { ...line, key: allocationKey } : line)),
      });
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Failed to record payment");
    } finally {
      setPaymentSaving(false);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-3 sm:p-6 min-w-0">
      {feesRecordingDisabled ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold text-red-100">Inactive student.</span> You cannot record fees for this student.
          </span>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 min-w-0">
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2 min-w-0">
          <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="leading-tight">Fees Breakdown</span>
        </h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => !feesRecordingDisabled && setShowAssignFeeHeadsCatalog(true)}
            disabled={feesRecordingDisabled}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-100 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusCircle className="w-4 h-4 flex-shrink-0" />
            Assign from catalog
          </button>
          <button
            type="button"
            onClick={() => !feesRecordingDisabled && setShowAddExtraFee(true)}
            disabled={feesRecordingDisabled}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusCircle className="w-4 h-4 flex-shrink-0" />
            Add Extra Fee
          </button>
          <button
            type="button"
            onClick={() => void openModifyFeeModal()}
            disabled={feesRecordingDisabled || modifyFeeOpening}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {modifyFeeOpening ? "Refreshing..." : "Edit Fee Setup"}
          </button>
          {/* {payments.length > 0 && (
            <button
              onClick={handleDownloadReceipt}
              disabled={isGeneratingReceipt}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              {isGeneratingReceipt ? "Generating..." : "Download Receipt"}
            </button>
          )} */}
        </div>
      </div>

      <FeeSummaryCards
        displayTotalAmount={displayTotalAmount}
        displayPreDiscountTotal={displayPreDiscountTotal}
        raisedDiscountAmount={raisedDiscountAmount}
        discountAmount={discountAmount}
        approvalUi={approvalUi}
        approvalState={approvalState}
        discountFeeHeadLabel={discountFeeHeadLabel}
        discountFeeHeadKey={discountFeeHeadKey}
        discountRemarks={discountRemarks}
        displayAmountPaid={displayAmountPaid}
        paidPercentage={paidPercentage}
        displayRemainingAmount={displayRemainingAmount}
        previousYearRemainingAmount={previousYearRemainingAmount}
      />

      <FeeHeadCardsGrid
        headCards={headCards}
        headsLoading={headsLoading}
        classId={classId}
        deletingExtraId={deletingExtraId}
        baseHeadBusyKey={baseHeadBusyKey}
        baseStructureMutating={baseStructureMutating}
        feesRecordingDisabled={feesRecordingDisabled}
        onEditExtra={editExtraFeeHead}
        onDeleteExtra={deleteExtraFeeHead}
        onEditBase={editBaseFeeHead}
        onDeleteBase={deleteBaseFeeHead}
        onRecordPayment={openHeadPaymentModal}
      />

      {/* Payment Progress Bar */}
      <FeePaymentProgressSection
        paidPercentage={paidPercentage}
        headsLoading={headsLoading}
        paymentProgressRows={paymentProgressRows}
        feeBreakdown={feeBreakdown}
      />

      {/* Hidden Receipt Section for PDF */}
      <FeeReceiptPrintLayout
        contentRef={receiptRef}
        schoolName={schoolName}
        studentName={studentName}
        admissionNumber={admissionNumber}
        classDisplayName={classDisplayName}
        totalFee={totalFee}
        amountPaid={displayAmountPaid}
        remainingAmount={displayRemainingAmount}
        paidPercentage={paidPercentage}
        payments={payments}
        feeBreakdown={feeBreakdown}
      />

      {showModifyFee && (
        <ModifyFeeModal
          studentId={studentId}
          currentTotalFee={breakdownNetTotal ?? displayTotalAmount}
          preDiscountTotal={displayPreDiscountTotal}
          currentDiscountPercent={discountPercent}
          feeHeadOptions={feeHeadOptionsForDiscount}
          initialDiscountFeeHeadKey={discountFeeHeadKey ?? null}
          initialDiscountFeeHeadLabel={discountFeeHeadLabel ?? null}
          initialDiscountRemarks={discountRemarks ?? null}
          initialDiscountFixedAmount={discountFixedAmount ?? null}
          onClose={() => setShowModifyFee(false)}
          onSuccess={(result?: FeeModifyResult) => {
            if (Array.isArray(result?.approvalRequests) && result.approvalRequests.length > 0) {
              setApprovalState((prev) => mergeDiscountApprovals(prev, result.approvalRequests ?? []));
            } else if (result?.approvalRequest) {
              setApprovalState((prev) =>
                mergeDiscountApprovals(prev, [
                  {
                  id: result.approvalRequest!.id,
                  status: result.approvalRequest!.status,
                  discountFixedAmount: result.approvalRequest!.discountFixedAmount ?? null,
                  discountFeeHeadLabel: result.approvalRequest!.discountFeeHeadLabel ?? null,
                  discountRemarks: result.approvalRequest!.discountRemarks ?? null,
                  createdAt: result.approvalRequest!.createdAt,
                  },
                ])
              );
            }
            setShowModifyFee(false);
            if (!result?.pendingApproval) {
              onFeeModified?.();
            }
          }}
        />
      )}

      {showAssignFeeHeadsCatalog && (
        <AssignFeeHeadsCatalogModal
          studentId={studentId}
          studentName={studentName ?? "Student"}
          classDisplayName={classDisplayName ?? "-"}
          classId={classId}
          classSection={classSection}
          residencyType={residencyType}
          onClose={() => setShowAssignFeeHeadsCatalog(false)}
          onSuccess={() => {
            setShowAssignFeeHeadsCatalog(false);
            onFeeModified?.();
          }}
        />
      )}

      {showAddExtraFee && (
        <AddExtraFeeModal
          studentId={studentId}
          onClose={() => setShowAddExtraFee(false)}
          onSuccess={() => {
            setShowAddExtraFee(false);
            onFeeModified?.();
          }}
        />
      )}

      <EditBaseFeeHeadDialog
        editBaseHead={editBaseHead}
        onEditBaseHeadChange={setEditBaseHead}
        editBaseError={editBaseError}
        baseStructureMutating={baseStructureMutating}
        onSubmit={handleSaveEditBaseHead}
        onCancel={() => setEditBaseHead(null)}
      />

      {editExtra && (
        <EditExtraFeeModal
          extraFeeId={editExtra.id}
          initialName={editExtra.name}
          initialAmount={editExtra.amount}
          initialSplitIntoTwoInstallments={editExtra.splitIntoTwoInstallments}
          onClose={() => setEditExtra(null)}
          onSuccess={() => {
            setEditExtra(null);
            onFeeModified?.();
          }}
        />
      )}

      <RecordHeadPaymentDialog
        payingHead={payingHead}
        paymentForm={paymentForm}
        onPaymentFormChange={setPaymentForm}
        paymentError={paymentError}
        paymentSaving={paymentSaving}
        onCancel={() => setPayingHead(null)}
        onSubmit={submitHeadPayment}
      />
    </div>
  );
};
