import { apiGet, apiPost } from "./http";
import type { ClassOption, TeacherOption } from "@/app/frontend/components/schooladmin/shared/timetable/timetableTypes";
import type { TimetablePayload } from "@/app/frontend/components/timetable/TimetableGrid";

export type ClassListResponse = {
  message?: string;
  classes?: ClassOption[];
};

export type TeacherListResponse = {
  message?: string;
  teachers?: TeacherOption[];
};

export type AllTimetablesResponse = {
  message?: string;
  timetables?: TimetablePayload[];
};

export type TimetableResponse = {
  message?: string;
  timetable?: TimetablePayload;
};

export function fetchClassListLite() {
  return apiGet<ClassListResponse>("/api/class/list?lite=1");
}

export function fetchTeacherList() {
  return apiGet<TeacherListResponse>("/api/teacher/list");
}

export function fetchAllTimetables() {
  return apiGet<AllTimetablesResponse>("/api/timetable?all=1");
}

export function fetchTimetableForClass(classId: string) {
  return apiGet<TimetableResponse>(`/api/timetable?classId=${encodeURIComponent(classId)}`, {
    cache: "no-store",
  });
}

export function saveTimetable(payload: {
  classId: string;
  title: string;
  notes: string;
  entries: unknown[];
}) {
  return apiPost<TimetableResponse>("/api/timetable", payload);
}
