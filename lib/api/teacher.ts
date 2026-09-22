import { apiGet } from "./http";

export type TeacherListResponse = {
  message?: string;
  teachers?: {
    id: string;
    name: string;
    email: string;
    mobile?: string | null;
  }[];
};

export function fetchTeacherList() {
  return apiGet<TeacherListResponse>("/api/teacher/list");
}
