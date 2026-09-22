import { apiGet } from "./http";

export type FeeTransactionsResponse = {
  message?: string;
  transactions?: Array<{
    amount: number;
    createdAt: string;
    transactionId?: string | null;
    feeAllocations?: Array<{ name: string; amount: number }>;
    student: {
      id: string;
      admissionNumber?: string | null;
      user?: { name?: string | null };
      class?: { name?: string | null; section?: string | null } | null;
    };
  }>;
};

export type FeeSummaryResponse = {
  message?: string;
  [key: string]: unknown;
};

export function fetchFeeTransactionsForExport() {
  return apiGet<FeeTransactionsResponse>("/api/fees/transactions?limit=200", {
    cache: "no-store",
  });
}

export function fetchFeeSummaryForExport() {
  return apiGet<FeeSummaryResponse>("/api/fees/summary", { cache: "no-store" });
}
