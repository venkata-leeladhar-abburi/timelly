import { apiGet, apiPatch, apiPost, apiRequest } from "./http";

export type CreateSchoolResponse = {
  message?: string;
  [key: string]: unknown;
};

export type CreateSchoolPayload = {
  schoolName: string;
  email: string;
  password: string;
  address: string;
  location: string;
  phone?: string;
  billingMode?: "PARENT_SUBSCRIPTION" | "SCHOOL_PAID";
  parentSubscriptionAmount?: number;
  parentSubscriptionTrialDays?: number;
};

export function createSchool(payload: CreateSchoolPayload, signal?: AbortSignal) {
  return apiPost<CreateSchoolResponse>("/api/superadmin/schools/create", payload, { signal });
}

export type SchoolsListResponse = {
  message?: string;
  schools?: unknown[];
  [key: string]: unknown;
};

export function fetchSuperadminSchools(
  params: URLSearchParams,
  opts?: { cache?: RequestCache; signal?: AbortSignal }
) {
  return apiGet<SchoolsListResponse>(`/api/superadmin/schools?${params.toString()}`, opts);
}

export type DeleteSchoolResponse = {
  message?: string;
};

export function deleteSchool(schoolId: string, confirmName: string) {
  return apiRequest<DeleteSchoolResponse>(`/api/superadmin/schools/${schoolId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schoolName: confirmName }),
    cache: "no-store",
  });
}

export type UpdateSubscriptionResponse = {
  message?: string;
  [key: string]: unknown;
};

export function updateSchoolSubscription(schoolId: string, payload: Record<string, unknown>) {
  return apiPatch<UpdateSubscriptionResponse>(`/api/superadmin/schools/${schoolId}/subscription`, payload);
}
