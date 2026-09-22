import { apiPatch, apiPost } from "./http";

export type ExtraFeeSaveResponse = {
  message?: string;
};

export type CleanupDuplicatesResponse = {
  message?: string;
  removedDuplicateRows?: number;
  remainingDuplicateCount?: number;
  studentsRecalculated?: number;
};

export function patchExtraFee(targetId: string, body: Record<string, unknown>) {
  return apiPatch<ExtraFeeSaveResponse>(`/api/fees/extra/${targetId}`, body);
}

export function createExtraFee(body: Record<string, unknown>) {
  return apiPost<ExtraFeeSaveResponse>("/api/fees/extra", body);
}

export function cleanupExtraFeeDuplicates() {
  return apiPost<CleanupDuplicatesResponse>("/api/fees/extra/cleanup-duplicates");
}
