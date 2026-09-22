import { apiGet } from "./http";

export type ClassDetailResponse = {
  class?: {
    students?: Array<{
      id: string;
      admissionNumber: string;
      user?: { name?: string | null } | null;
      class?: { section?: string | null } | null;
    }>;
  };
};

export type FeeCollectorsResponse = {
  collectors?: Array<{ userId: string; name: string }>;
};

export function fetchClassDetail(classId: string) {
  return apiGet<ClassDetailResponse>(`/api/class/${encodeURIComponent(classId)}`);
}

export function fetchFeeCollectors(signal?: AbortSignal) {
  return apiGet<FeeCollectorsResponse>("/api/fees/collectors", { signal });
}
