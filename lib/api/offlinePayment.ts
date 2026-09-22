import { apiGet, apiPost } from "./http";

export type SelectedHead =
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string }
  | { headType: "EXTRA_FEE"; extraFeeId: string };

export type RecordOfflinePaymentResponse = {
  message?: string;
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

export function recordOfflinePayment(payload: {
  studentId: string;
  amount: number;
  paymentMode: string;
  refNo?: string;
  selectedHeads: SelectedHead[];
}) {
  return apiPost<RecordOfflinePaymentResponse>("/api/fees/offline-payment", payload);
}

export function fetchFeeBreakdown(studentId: string) {
  return apiGet<FeeBreakdownResponse>(
    `/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`
  );
}
