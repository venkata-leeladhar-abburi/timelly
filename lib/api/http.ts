/**
 * Small fetch wrapper shared by the lib/api/<feature>.ts modules.
 *
 * Feature state hooks (useXState) previously called `fetch(...)` directly,
 * mixed in with their loading flags and form state. Pulling the network
 * call + JSON parsing out into lib/api/<feature>.ts (which all use this
 * helper) separates "how we talk to the server" from "what the component
 * needs" — the hook gets back a typed `{ ok, status, data }` and keeps its
 * existing error-message / state-update logic unchanged.
 */
export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T;
};

export async function apiRequest<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const res = await fetch(input, { credentials: "include", ...init });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function apiGet<T = unknown>(
  input: string,
  init?: Omit<RequestInit, "method">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, { ...init, method: "GET" });
}

export function apiPost<T = unknown>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, "method" | "body">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, {
    ...init,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T = unknown>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, "method" | "body">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, {
    ...init,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T = unknown>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, "method" | "body">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, {
    ...init,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = unknown>(
  input: string,
  init?: Omit<RequestInit, "method">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, { ...init, method: "DELETE" });
}
