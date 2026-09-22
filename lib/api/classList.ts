import { apiGet } from "./http";

export type ClassListFullResponse = {
  message?: string;
  classes?: unknown[];
};

export function fetchClassList() {
  return apiGet<ClassListFullResponse>("/api/class/list", { cache: "no-store" });
}

export type ClassListLiteResponse = {
  classes?: { id: string; name?: string; section?: string | null }[];
};

export function fetchClassListLite() {
  return apiGet<ClassListLiteResponse>("/api/class/list?lite=1", { cache: "no-store" });
}

export type ClassStudentsResponse = {
  students?: Array<{
    id: string;
    rollNo?: string | null;
    user?: { name?: string | null };
  }>;
};

export function fetchClassStudents(classId: string) {
  return apiGet<ClassStudentsResponse>(
    `/api/class/students?classId=${encodeURIComponent(classId)}`,
    { cache: "no-store" }
  );
}
