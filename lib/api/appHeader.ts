import { apiGet } from "./http";

export type CurrentUserResponse = {
  user?: {
    id?: string;
    name?: string;
    role?: string;
    email?: string;
    mobile?: string;
    address?: string | null;
    photoUrl?: string | null;
  };
};

export type ParentDetailsResponse = {
  address?: string;
};

export type UnreadNotificationsResponse = {
  unreadCount?: number;
};

export function fetchUnreadNotificationsCount(signal?: AbortSignal) {
  return apiGet<UnreadNotificationsResponse>("/api/notifications?take=1", {
    cache: "no-store",
    signal,
  });
}

export function fetchCurrentUser(opts?: { cache?: RequestCache }) {
  return apiGet<CurrentUserResponse>("/api/user/me", { cache: opts?.cache });
}

export function fetchParentDetails() {
  return apiGet<ParentDetailsResponse>("/api/student/parent-details");
}
