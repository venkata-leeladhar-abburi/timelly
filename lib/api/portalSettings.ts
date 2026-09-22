import { apiGet, apiPut, apiPost } from "./http";

export type UserMeResponse = {
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    mobile: string | null;
    address: string | null;
    language: string | null;
    photoUrl: string | null;
  };
  message?: string;
};

export type ParentDetailsResponse = Record<string, string | null | undefined> & {
  message?: string;
};

export type SaveUserProfilePayload = {
  name: string;
  mobile: string | null;
  address: string | null;
  language: string;
  photoUrl: string | null;
};

export type SaveParentDetailsPayload = {
  address: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  occupation: string | null;
};

export function fetchCurrentUserSettings() {
  return apiGet<UserMeResponse>("/api/user/me");
}

export function fetchParentDetailsSettings() {
  return apiGet<ParentDetailsResponse>("/api/student/parent-details");
}

export function saveUserProfile(payload: SaveUserProfilePayload) {
  return apiPut<UserMeResponse>("/api/user/me", payload);
}

export function saveParentDetails(payload: SaveParentDetailsPayload) {
  return apiPut<ParentDetailsResponse>("/api/student/parent-details", payload);
}

export function changePassword(payload: { currentPassword: string; newPassword: string }) {
  return apiPost<{ message?: string }>("/api/user/change-password", payload);
}
