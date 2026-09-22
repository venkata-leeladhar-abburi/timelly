import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { FeePaymentReceiptData } from "../../../../pdf/FeePaymentReceiptTemplate";
import { printFromElement } from "@/lib/pdfUtils";
import { formatReceiptGeneratedDate } from "@/lib/fees/receiptDates";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import type { FeeTransactionsProps as Props, PaymentRow, TransactionDisplayRow } from "./feeTransactionsTypes";
import {
  isPendingPaymentId,
  isSuccessStatus,
  isSyntheticPaymentId,
  paymentsToTransactionRows,
} from "./feeTransactionsHelpers";
import { useSchoolBrand } from "./useSchoolBrand";
import { buildReceiptDataFromTransactionRows as buildReceiptData } from "./feeReceiptBuilder";

export function useFeeTransactionsState({
  fee,
  feeBreakdown = null,
  payments,
  studentName = "Student",
  studentId = "",
  admissionNumber = "",
  applicationFee,
  admissionFee,
  studentCreatedAt,
  classDisplayName = "-",
  residencyType = "Day Scholar",
  parentName = "-",
  parentPhone = "-",
  motherName = "-",
  onPaymentsChanged,
  onPaymentDeleted,
  autoPrintPaymentId = null,
  transactionsLoading = false,
  onAutoPrintDone,
}: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptData, setReceiptData] = useState<FeePaymentReceiptData | null>(null);
  const schoolBrand = useSchoolBrand();

  const [printingId, setPrintingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editGateway, setEditGateway] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);

  const hasFee = fee && (fee.totalFee > 0 || fee.amountPaid > 0 || fee.remainingFee > 0);

  const basePayments = payments && payments.length > 0 ? [...payments] : [];

  const hasAdmissionPayment = basePayments.some(
    (p) =>
      p.id === "admission-fee" ||
      p.id.startsWith("admission-app-") ||
      (p.feeTypeName ?? "").toLowerCase().includes("admission fee")
  );
  const hasApplicationPayment = basePayments.some(
    (p) =>
      p.id === "application-fee" ||
      p.id.startsWith("application-app-") ||
      (p.feeTypeName ?? "").toLowerCase().includes("application fee")
  );

  if (!hasAdmissionPayment && admissionFee && admissionFee > 0) {
    basePayments.push({
      id: "admission-fee",
      amount: admissionFee,
      status: "Paid",
      method: "One-time",
      createdAt: studentCreatedAt || new Date().toISOString(),
      transactionId: "N/A",
      feeTypeName: "Admission Fee",
      feeTypeAmount: admissionFee,
    });
  }

  if (!hasApplicationPayment && applicationFee && applicationFee > 0) {
    basePayments.push({
      id: "application-fee",
      amount: applicationFee,
      status: "Paid",
      method: "One-time",
      createdAt: studentCreatedAt || new Date().toISOString(),
      transactionId: "N/A",
      feeTypeName: "Application Fee",
      feeTypeAmount: applicationFee,
    });
  }

  const transactionRows = paymentsToTransactionRows(basePayments);

  const autoPrintStartedRef = useRef<string | null>(null);

  const openEdit = (p: PaymentRow) => {
    setEditing(p);
    setEditAmount(String(p.amount));
    setEditRef(p.transactionId ?? "");
    setEditGateway((p.method || "OFFLINE_CASH").trim());
    setEditDate(new Date(p.createdAt).toISOString().slice(0, 10));
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    setSaving(true);
    try {
      if (isSyntheticPaymentId(editing.id)) {
        const n = parseFloat(editAmount);
        if (!Number.isFinite(n) || n < 0) {
          alert("Enter a valid amount (0 to clear).");
          setSaving(false);
          return;
        }
        const body: Record<string, unknown> =
          editing.id === "admission-fee"
            ? { admissionFee: n === 0 ? null : n }
            : { applicationFee: n === 0 ? null : n };

        const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(typeof data.message === "string" ? data.message : "Update failed");
          return;
        }
        setEditing(null);
        onPaymentsChanged?.();
        return;
      }

      const body: Record<string, unknown> = {
        transactionId: editRef.trim() || null,
        gateway: editGateway.trim() || "OFFLINE_CASH",
        createdAt: new Date(editDate + "T12:00:00").toISOString(),
      };
      if (isSuccessStatus(editing.status)) {
        const n = parseFloat(editAmount);
        if (!Number.isFinite(n) || n <= 0) {
          alert("Enter a valid positive amount.");
          setSaving(false);
          return;
        }
        body.amount = n;
      }

      const res = await fetch(`/api/fees/payment/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setEditing(null);
      onPaymentsChanged?.();
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (p: PaymentRow) => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }

    if (isSyntheticPaymentId(p.id)) {
      if (
        !confirm(
          `Remove ${p.feeTypeName || "this fee"} from the student profile? This only clears the recorded amount (not a gateway payment).`
        )
      ) {
        return;
      }
      setDeletingId(p.id);
      try {
        const body =
          p.id === "admission-fee" ? { admissionFee: null } : { applicationFee: null };
        const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(typeof data.message === "string" ? data.message : "Delete failed");
          return;
        }
        onPaymentsChanged?.();
      } catch {
        alert("Delete failed");
      } finally {
        setDeletingId(null);
      }
      return;
    }

    if (
      !confirm(
        "Delete this transaction? Student fee totals will be adjusted if this payment was successful."
      )
    ) {
      return;
    }

    if (isPendingPaymentId(p.id)) {
      onPaymentDeleted?.({
        paymentId: p.id,
        updatedFee: null,
        feeAllocations: p.feeAllocations,
      });
      return;
    }

    setDeletingId(p.id);
    try {
      const qs = studentId.trim()
        ? `?studentId=${encodeURIComponent(studentId.trim())}`
        : "";
      const res = await fetch(`/api/fees/payment/${encodeURIComponent(p.id)}${qs}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          onPaymentDeleted?.({
            paymentId: p.id,
            updatedFee: null,
            feeAllocations: p.feeAllocations,
          });
          return;
        }
        alert(typeof data.message === "string" ? data.message : "Delete failed");
        return;
      }
      onPaymentDeleted?.({
        paymentId: p.id,
        updatedFee:
          data.updatedFee && typeof data.updatedFee.amountPaid === "number"
            ? {
                amountPaid: Number(data.updatedFee.amountPaid),
                remainingFee: Number(data.updatedFee.remainingFee),
                finalFee:
                  typeof data.updatedFee.finalFee === "number" ? data.updatedFee.finalFee : undefined,
              }
            : null,
        feeAllocations: p.feeAllocations,
      });
    } catch {
      alert("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  // FEES PAID / TOTAL is current-year only — exclude previous-year fee rows.
  const currentYearTxnPaid = transactionRows
    .filter((r) => isSuccessStatus(r.status) && !isPreviousYearFeeHeadName(r.feeTypeName))
    .reduce((s, r) => s + r.amount, 0);
  const totalPaid =
    feeBreakdown != null
      ? Math.max(Number(feeBreakdown.amountPaid) || 0, currentYearTxnPaid)
      : Math.max(hasFee ? fee!.amountPaid : 0, currentYearTxnPaid);
  const total =
    feeBreakdown?.totalAmount ??
    (hasFee ? Math.max(fee!.amountPaid + fee!.remainingFee, totalPaid) : totalPaid);
  const hasAny = hasFee || transactionRows.length > 0;

  const buildReceiptDataFromTransactionRows = (
    selectedRows: TransactionDisplayRow[],
    transactionDate: string,
    generatedOn: string
  ) =>
    buildReceiptData(selectedRows, transactionDate, generatedOn, {
      schoolBrand,
      studentName,
      admissionNumber,
      classDisplayName,
      parentName,
      motherName,
      residencyType,
      parentPhone,
    });

  const handlePrintReceipt = async (row: TransactionDisplayRow) => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const data = buildReceiptDataFromTransactionRows([row], row.createdAt, generatedOn);

    setPrintingId(row.rowKey);
    flushSync(() => {
      setReceiptData(data);
    });

    try {
      await printFromElement(receiptRef, { minHeight: 400 });
    } catch (error) {
      console.error("Error printing receipt:", error);
      alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
    } finally {
      setPrintingId(null);
      setReceiptData(null);
    }
  };

  useEffect(() => {
    if (!autoPrintPaymentId || transactionsLoading) return;
    if (autoPrintStartedRef.current === autoPrintPaymentId) return;
    const rowsForPayment = transactionRows.filter((r) => r.paymentId === autoPrintPaymentId);
    if (rowsForPayment.length === 0) return;

    autoPrintStartedRef.current = autoPrintPaymentId;
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const transactionDate = rowsForPayment[0]?.createdAt ?? new Date().toISOString();
    const data = buildReceiptDataFromTransactionRows(rowsForPayment, transactionDate, generatedOn);

    void (async () => {
      setPrintingId(autoPrintPaymentId);
      flushSync(() => {
        setReceiptData(data);
      });
      try {
        await printFromElement(receiptRef, { minHeight: 400 });
      } catch (error) {
        console.error("Error printing receipt:", error);
        alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
      } finally {
        setPrintingId(null);
        setReceiptData(null);
        onAutoPrintDone?.();
      }
    })();
  }, [autoPrintPaymentId, onAutoPrintDone, transactionRows, transactionsLoading]);

  const toggleReceiptSelection = (id: string) => {
    setSelectedReceiptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const printSelectedReceipts = async () => {
    const selectedRows = transactionRows.filter((r) => selectedReceiptIds.includes(r.rowKey));
    if (selectedRows.length === 0) {
      alert("Select at least one transaction to print.");
      return;
    }
    const latestTxDate = selectedRows.reduce((max, row) => {
      const t = new Date(row.createdAt).getTime();
      return t > max ? t : max;
    }, 0);
    const transactionDate =
      latestTxDate > 0 ? new Date(latestTxDate).toISOString() : new Date().toISOString();
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const data = buildReceiptDataFromTransactionRows(selectedRows, transactionDate, generatedOn);
    setPrintingId("bulk");
    flushSync(() => {
      setReceiptData(data);
    });
    try {
      await printFromElement(receiptRef, { minHeight: 400 });
    } catch (error) {
      console.error("Error printing receipt:", error);
      alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
    } finally {
      setPrintingId(null);
      setReceiptData(null);
    }
  };

  return {
    receiptRef,
    receiptData,
    printingId,
    editing,
    editAmount,
    setEditAmount,
    editRef,
    setEditRef,
    editGateway,
    setEditGateway,
    editDate,
    setEditDate,
    saving,
    deletingId,
    selectedReceiptIds,
    transactionRows,
    hasFee,
    totalPaid,
    total,
    hasAny,
    openEdit,
    closeEdit,
    saveEdit,
    confirmDelete,
    handlePrintReceipt,
    toggleReceiptSelection,
    printSelectedReceipts,
  };
}
