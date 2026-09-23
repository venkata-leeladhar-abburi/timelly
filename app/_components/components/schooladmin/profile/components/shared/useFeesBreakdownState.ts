import { useEffect, useMemo, useRef, useState } from "react";
import { generatePDF } from "@/lib/pdfUtils";
import type { FeeHeadOption } from "../ModifyFeeModal";
import { splitFeeHeadsForDisplay } from "@/lib/fees/feeHeadInstallmentDisplay";
import { storedDiscountRupeeAmount } from "@/lib/fees/studentFeeHeadDiscount";
import { roundRupee } from "@/lib/formatRupee";
import { grossTotalFromBreakdown, netTotalFromBreakdown } from "@/lib/fees/feeBreakdownTotals";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import {
  mergeDiscountApprovals,
  type FeesBreakdownProps as Props,
  type HeadCard,
} from "./feesBreakdownHelpers";
import { useBaseFeeHeadEditing } from "./useBaseFeeHeadEditing";
import { useHeadPayment } from "./useHeadPayment";
import { useExtraFeeHeadActions } from "./useExtraFeeHeadActions";

/**
 * All state, derived values, effects, and handlers for FeesBreakdown.tsx.
 * This is a verbatim relocation of the component's original stateful body —
 * not a redesign — kept in the same order with the same logic, so behavior
 * is unchanged. Only the final `return` (matching exactly what the JSX
 * consumes) is new.
 */
export function useFeesBreakdownState({
  studentId,
  classId = null,
  totalFee,
  amountPaid,
  discountFixedAmount,
  latestDiscountApproval,
  discountApprovals,
  onFeeModified,
  payments = [],
  baseTotalFee,
  initialFeeBreakdown = null,
  feeBreakdownPending = false,
  feesRecordingDisabled = false,
}: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [showModifyFee, setShowModifyFee] = useState(false);
  const [modifyFeeOpening, setModifyFeeOpening] = useState(false);
  const [showAddExtraFee, setShowAddExtraFee] = useState(false);
  const [showAssignFeeHeadsCatalog, setShowAssignFeeHeadsCatalog] = useState(false);
  const headsLoading = feeBreakdownPending && !initialFeeBreakdown?.dueHeads?.length;
  const [feeHeadOptionsForDiscount, setFeeHeadOptionsForDiscount] = useState<FeeHeadOption[]>([]);
  const [headCards, setHeadCards] = useState<HeadCard[]>([]);
  const [headsTotalAmount, setHeadsTotalAmount] = useState<number | null>(null);
  const [headsRemainingAmount, setHeadsRemainingAmount] = useState<number | null>(null);
  const [previousYearRemainingAmount, setPreviousYearRemainingAmount] = useState(0);
  const [approvalState, setApprovalState] = useState(
    discountApprovals?.length ? discountApprovals : latestDiscountApproval ? [latestDiscountApproval] : []
  );
  const approvalStudentRef = useRef(studentId);
  const refreshedApprovedDiscountsRef = useRef("");

  const {
    baseHeadBusyKey,
    editBaseHead,
    setEditBaseHead,
    editBaseError,
    baseStructureMutating,
    editBaseFeeHead,
    deleteBaseFeeHead,
    handleSaveEditBaseHead,
  } = useBaseFeeHeadEditing({ classId, onFeeModified });

  const {
    payingHead,
    setPayingHead,
    paymentForm,
    setPaymentForm,
    paymentSaving,
    paymentError,
    openHeadPaymentModal,
    submitHeadPayment,
  } = useHeadPayment({
    studentId,
    feesRecordingDisabled,
    setHeadCards,
    setHeadsRemainingAmount,
    setPreviousYearRemainingAmount,
    onFeeModified,
  });

  const {
    editExtra,
    setEditExtra,
    deletingExtraId,
    editExtraFeeHead,
    deleteExtraFeeHead,
  } = useExtraFeeHeadActions({ onFeeModified });

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

  return {
    receiptRef,
    isGeneratingReceipt,
    showModifyFee,
    setShowModifyFee,
    modifyFeeOpening,
    showAddExtraFee,
    setShowAddExtraFee,
    showAssignFeeHeadsCatalog,
    setShowAssignFeeHeadsCatalog,
    editExtra,
    setEditExtra,
    headsLoading,
    deletingExtraId,
    baseHeadBusyKey,
    editBaseHead,
    setEditBaseHead,
    editBaseError,
    baseStructureMutating,
    feeHeadOptionsForDiscount,
    headCards,
    payingHead,
    setPayingHead,
    paymentForm,
    setPaymentForm,
    paymentSaving,
    paymentError,
    approvalState,
    setApprovalState,
    feeBreakdown,
    paymentProgressRows,
    breakdownNetTotal,
    displayPreDiscountTotal,
    displayTotalAmount,
    discountAmount,
    raisedDiscountAmount,
    approvalUi,
    displayAmountPaid,
    displayRemainingAmount,
    paidPercentage,
    previousYearRemainingAmount,
    openModifyFeeModal,
    handleDownloadReceipt,
    openHeadPaymentModal,
    editExtraFeeHead,
    deleteExtraFeeHead,
    editBaseFeeHead,
    deleteBaseFeeHead,
    handleSaveEditBaseHead,
    submitHeadPayment,
  };
}
