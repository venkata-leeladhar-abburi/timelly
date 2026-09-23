import { useCallback, useEffect, useState } from "react";
import { IStudent } from "../interfaces/student";

export function useStudents(classId: string) {
  const [students, setStudents] = useState<IStudent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStudents = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!classId) return;
      if (!options?.silent) setLoading(true);
      try {
        const res = await fetch(`/api/class/students?classId=${classId}`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        setStudents(data.students || []);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [classId]
  );

  useEffect(() => {
    if (classId) void fetchStudents();
  }, [classId, fetchStudents]);

  const patchStudent = useCallback(
    (studentId: string, updater: (row: IStudent) => IStudent) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? updater(s) : s))
      );
    },
    []
  );

  const removeStudent = useCallback((studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
  }, []);

  return {
    students,
    loading,
    refresh: () => fetchStudents(),
    refreshSilent: () => fetchStudents({ silent: true }),
    patchStudent,
    removeStudent,
  };
}
