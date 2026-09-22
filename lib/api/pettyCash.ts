import { apiDelete, apiGet, apiPatch, apiPost } from "./http";
import type { PettyCashExpense } from "@/app/frontend/components/schooladmin/fees/shared/petty-cash/pettyCashTypes";

export type PettyCashListResponse = {
  message?: string;
  expenses?: PettyCashExpense[];
};

export type PettyCashSaveResponse = {
  message?: string;
};

export function fetchPettyCashExpenses() {
  return apiGet<PettyCashListResponse>("/api/fees/petty-cash", { cache: "no-store" });
}

export type PettyCashSavePayload = {
  itemName: string;
  headOfAccount: string;
  paymentType: string;
  amount: number;
  expenseDate: string;
  description: string;
};

export function createPettyCashExpense(payload: PettyCashSavePayload) {
  return apiPost<PettyCashSaveResponse>("/api/fees/petty-cash", payload);
}

export function updatePettyCashExpense(id: string, payload: PettyCashSavePayload) {
  return apiPatch<PettyCashSaveResponse>(`/api/fees/petty-cash/${id}`, payload);
}

export function deletePettyCashExpense(id: string) {
  return apiDelete<PettyCashSaveResponse>(`/api/fees/petty-cash/${id}`);
}
