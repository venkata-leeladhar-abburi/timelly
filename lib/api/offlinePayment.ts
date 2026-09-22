import { apiGet, apiPost } from "./http";

export type SelectedHead =
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string }
  | { headType: "EXTRA_FEE"; extraFeeId: string };

export type RecordOfflinePaymentResponse = {
  message?: string;
  idempotent?: boolean;
  [key: string]: unknown;
};

export type FeeBreakdownResponse = {
  message?: string;
  remainingFee?: number;
  dueHeads?: Array<{
    key: string;
    headType: "BASE_COMPONENT" | "EXTRA_FEE";
    label: string;
    dueBefore: number;
  }>;
};

export type RecordOfflinePaymentPayload = {
  studentId: string;
  amount: number;
  paymentMode: string;
  refNo?: string;
  transactionId?: string;
  paymentDate?: string;
  selectedHeads: SelectedHead[];
  explicitAllocations?: Array<{ key: string; amount: number; label: string }>;
};

export function recordOfflinePayment(payload: RecordOfflinePaymentPayload) {
  return apiPost<RecordOfflinePaymentResponse>("/api/fees/offline-payment", payload);
}

export function fetchFeeBreakdown(studentId: string) {
  return apiGet<FeeBreakdownResponse>(
    `/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`
  );
}
