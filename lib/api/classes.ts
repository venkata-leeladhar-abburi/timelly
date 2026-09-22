import { apiDelete, apiPut } from "./http";

export type ClassMutationResponse = {
  message?: string;
  class?: {
    id: string;
    name: string;
    section: string;
    teacherId?: string | null;
    teacher?: { name?: string | null; email?: string | null } | null;
    [key: string]: unknown;
  };
};

export function deleteClass(id: string) {
  return apiDelete<ClassMutationResponse>(`/api/class/${id}`);
}

export function updateClass(
  id: string,
  payload: { name: string; section: string; teacherId?: string }
) {
  return apiPut<ClassMutationResponse>(`/api/class/${id}`, payload);
}
