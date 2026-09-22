import { apiGet, apiPost } from "./http";

export type SaveTeacherAttendanceResponse = {
  message?: string;
};

export type TeacherAttendanceResponse = {
  attendances?: Array<{ teacherId: string; status: string }>;
};

export function saveTeacherAttendance(
  date: string,
  attendances: Array<{ teacherId: string; status: string }>
) {
  return apiPost<SaveTeacherAttendanceResponse>("/api/teacher/attendance", { date, attendances });
}

export function fetchTeacherAttendanceForDate(date: string) {
  return apiGet<TeacherAttendanceResponse>(`/api/teacher/attendance?date=${date}`);
}
