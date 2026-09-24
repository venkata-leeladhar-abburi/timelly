import { useCallback, useEffect } from "react";
import { readStudentListCacheLegacy, writeStudentListCacheLegacy } from "@/lib/students/studentListSessionCache";
import { resolveStudentDisplayName } from "@/lib/students/resolveStudentDisplayName";
import type { StudentDetail, StudentOption } from "./types";
import { buildPlaceholderDetail, normalizeStudentOption } from "./studentDetailHelpers";

/** Loads the student list + classes, and follows a `?studentId=` deep link (fetch shell row, seed placeholder). */
export function useStudentListBootstrap({
  studentIdFromUrl,
  students,
  setStudents,
  setListLoading,
  setClasses,
  setSelectedId,
  setDetail,
}: {
  studentIdFromUrl: string | null;
  students: StudentOption[];
  setStudents: (updater: StudentOption[] | ((prev: StudentOption[]) => StudentOption[])) => void;
  setListLoading: (loading: boolean) => void;
  setClasses: (classes: { id: string; name: string; section: string | null }[]) => void;
  setSelectedId: (updater: string | null | ((prev: string | null) => string | null)) => void;
  setDetail: (updater: StudentDetail | null | ((prev: StudentDetail | null) => StudentDetail | null)) => void;
}) {
  const mapListRow = useCallback(
    (s: {
      id: string;
      user?: { name?: string };
      admissionNumber?: string;
      fatherName?: string;
      parentName?: string;
      rollNo?: string | null;
      penNumber?: string | null;
      apaarId?: string | null;
      status?: string;
      application?: {
        firstName?: string | null;
        middleName?: string | null;
        lastName?: string | null;
      } | null;
      class?: { id: string; name: string; section: string | null };
    }): StudentOption => ({
      id: s.id,
      name: resolveStudentDisplayName({
        user: s.user,
        application: s.application,
        fatherName: s.fatherName,
        admissionNumber: s.admissionNumber,
      }),
      admissionNumber: s.admissionNumber ?? "",
      parentName: s.fatherName?.trim() || s.parentName?.trim() || "-",
      classDisplay: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "-",
      classId: s.class?.id ?? "",
      section: s.class?.section ?? null,
      status: s.status ?? "Active",
      rollNo: s.rollNo ?? null,
      penNumber: s.penNumber ?? null,
      apaarId: s.apaarId ?? null,
    }),
    []
  );

  useEffect(() => {
    const cached = readStudentListCacheLegacy<StudentOption>();
    if (cached?.length) {
      setStudents(cached.map((s) => normalizeStudentOption(s)));
      setListLoading(false);
    }

    let cancelled = false;

    (async () => {
      try {
        // One lean request (search=1 => minimal columns, all=1 => no cursor round-trips), in parallel with classes.
        const classesPromise = fetch("/api/class/list", { credentials: "include" }).then(async (r) => {
          if (!cancelled && r.ok) {
            const c = await r.json();
            setClasses(c.classes ?? []);
          }
        });
        const studentsPromise = fetch("/api/student/list?search=1&all=1&take=10000", {
          credentials: "include",
          cache: "no-store",
        }).then(async (r) => {
          if (cancelled || !r.ok) return;
          const data = await r.json().catch(() => ({}));
          const rows = Array.isArray(data?.students) ? data.students : [];
          if (!rows.length) return;
          const options = rows.map(mapListRow).map(normalizeStudentOption);
          setStudents(options);
          writeStudentListCacheLegacy(options);
        });
        await Promise.all([classesPromise, studentsPromise]);

        if (!cancelled) setListLoading(false);
      } catch {
        if (!cancelled && !cached?.length) setStudents([]);
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentIdFromUrl, mapListRow, setClasses, setListLoading, setStudents]);

  // Deep link (?studentId=…): follow the URL when it changes. Do NOT depend on `students` here — that
  // was resetting selection back to the URL id on every list refresh and overwrote the student's dropdown pick.
  useEffect(() => {
    if (studentIdFromUrl) {
      setSelectedId(studentIdFromUrl);
    }
  }, [studentIdFromUrl, setSelectedId]);

  /** Deep link: fetch one row by id so the sidebar shows name/class immediately (not "Loading…"). */
  useEffect(() => {
    if (!studentIdFromUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/student/list?search=1&studentId=${encodeURIComponent(studentIdFromUrl)}&take=1`,
          { credentials: "include", cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const row = Array.isArray(data?.students) ? data.students[0] : null;
        if (!row?.id || cancelled) return;
        const option = mapListRow(row);
        setStudents((prev) => {
          if (prev.some((s) => s.id === option.id)) {
            return prev.map((s) => (s.id === option.id ? { ...s, ...option } : s));
          }
          return [option, ...prev];
        });
        setDetail((prev) => {
          if (prev?.student.id === option.id && prev.student.name !== "Loading…") return prev;
          return buildPlaceholderDetail(normalizeStudentOption(option));
        });
      } catch {
        /* shell fetch will replace placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentIdFromUrl, mapListRow, setDetail, setStudents]);

  useEffect(() => {
    if (studentIdFromUrl) return;
    if (students.length === 0) return;
    setSelectedId((prev) => (prev && students.some((s) => s.id === prev) ? prev : students[0].id));
  }, [students, studentIdFromUrl, setSelectedId]);
}
