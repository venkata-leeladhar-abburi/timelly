import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import type { FeeTransactionsProps as Props } from "./feeTransactionsTypes";
import { isSuccessStatus, paymentsToTransactionRows } from "./feeTransactionsHelpers";
import { useSchoolBrand } from "./useSchoolBrand";
import { useFeeTransactionsEditDelete } from "./useFeeTransactionsEditDelete";
import { useFeeTransactionsReceiptPrinting } from "./useFeeTransactionsReceiptPrinting";

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
  const schoolBrand = useSchoolBrand();

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

  const editDelete = useFeeTransactionsEditDelete({ studentId, onPaymentsChanged, onPaymentDeleted });

  const receiptPrinting = useFeeTransactionsReceiptPrinting({
    studentId,
    transactionRows,
    schoolBrand,
    studentName,
    admissionNumber,
    classDisplayName,
    residencyType,
    parentName,
    parentPhone,
    motherName,
    autoPrintPaymentId,
    transactionsLoading,
    onAutoPrintDone,
  });

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

  return {
    ...editDelete,
    ...receiptPrinting,
    transactionRows,
    hasFee,
    totalPaid,
    total,
    hasAny,
  };
}
