import { useState } from "react";
import type { useRouter } from "next/navigation";
import type { ExamTypeSectionOption } from "@/lib/exams/examTypes";
import type { MarkApi, StudentRow } from "./types";

export function useMarksSaveAll({
  form,
  rows,
  setRows,
  hasSubsections,
  termSections,
  sectionsTotalMax,
  fetchStudentsAndMarks,
  router,
}: {
  form: { classId: string; subject: string; examType: string };
  rows: StudentRow[];
  setRows: (updater: StudentRow[] | ((prev: StudentRow[]) => StudentRow[])) => void;
  hasSubsections: boolean;
  termSections: ExamTypeSectionOption[];
  sectionsTotalMax: number;
  fetchStudentsAndMarks: () => Promise<void>;
  router: ReturnType<typeof useRouter>;
}) {
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");

  const handleSaveAll = async () => {
    if (!form.classId || !form.subject || form.subject === "No subjects assigned") return;

    const filledRows = hasSubsections
      ? rows.filter((r) => {
          if (r.marks === "AB") return true;
          if (!r.componentScores) return false;
          return termSections.every((sec) => {
            const v = r.componentScores?.[sec.name];
            return v !== "" && v !== undefined;
          });
        })
      : rows.filter((r) => r.marks !== "");

    if (filledRows.length === 0) {
      setSaveMessage(
        hasSubsections
          ? "Enter all subsection marks (or mark Absent) before saving."
          : "Enter marks before saving."
      );
      return;
    }
    const missingMax = filledRows.some(
      (r) => r.maxMarks === "" || typeof r.maxMarks !== "number" || r.maxMarks <= 0
    );
    if (missingMax) {
      setSaveMessage("Set max marks before saving (cannot be empty).");
      return;
    }
    setSaveLoading(true);
    setSaveMessage("");
    try {
      const results = await Promise.all(
        filledRows.map(async (row) => {
          const isAbsent = row.marks === "AB";
          const totalMarks = hasSubsections
            ? sectionsTotalMax
            : (row.maxMarks as number);

          const components =
            hasSubsections && !isAbsent
              ? termSections.map((sec) => ({
                  name: sec.name,
                  marks: Number(row.componentScores?.[sec.name] ?? 0),
                  totalMarks: sec.maxMarks,
                }))
              : hasSubsections && isAbsent
                ? termSections.map((sec) => ({
                    name: sec.name,
                    marks: 0,
                    totalMarks: sec.maxMarks,
                  }))
                : undefined;

          const obtained = hasSubsections
            ? isAbsent
              ? 0
              : termSections.reduce(
                  (a, sec) => a + Number(row.componentScores?.[sec.name] ?? 0),
                  0
                )
            : isAbsent
              ? 0
              : Number(row.marks);

          const payload = {
            studentId: row.id,
            classId: form.classId,
            subject: form.subject,
            marks: obtained,
            totalMarks,
            examType: form.examType || null,
            ...(isAbsent ? { grade: "AB" } : {}),
            ...(components ? { components } : {}),
          };

          const res = row.markId
            ? await fetch(`/api/marks/${row.markId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  marks: payload.marks,
                  totalMarks: payload.totalMarks,
                  examType: payload.examType,
                  ...(isAbsent ? { grade: "AB" } : {}),
                  ...(components ? { components } : {}),
                }),
              })
            : await fetch("/api/marks/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

          const data = await res.json().catch(() => null);
          return {
            rowId: row.id,
            ok: res.ok,
            mark: data?.mark as MarkApi | undefined,
            message: data?.message as string | undefined,
          };
        })
      );

      const successMap = new Map(
        results
          .filter((result) => result.ok && result.mark)
          .map((result) => [result.rowId, result.mark as MarkApi])
      );

      if (successMap.size > 0) {
        setRows((prev) =>
          prev.map((row) => {
            const savedMark = successMap.get(row.id);
            if (!savedMark) return row;
            const isAbsent = savedMark.grade === "AB";
            const componentScores: Record<string, number | "" | "AB"> | undefined =
              hasSubsections
                ? Object.fromEntries(
                    termSections.map((sec) => {
                      const saved = savedMark.components?.find(
                        (c) => c.name.toUpperCase() === sec.name.toUpperCase()
                      );
                      if (isAbsent) return [sec.name, "AB" as const];
                      return [sec.name, saved ? Number(saved.marks) : ("" as const)];
                    })
                  )
                : undefined;
            return {
              ...row,
              marks: isAbsent ? ("AB" as const) : Number(savedMark.marks),
              maxMarks: savedMark.totalMarks,
              markId: savedMark.id,
              componentScores,
            };
          })
        );
      }

      const failed = results.filter((result) => !result.ok);
      if (failed.length > 0) {
        setSaveMessage(
          failed[0]?.message || `${failed.length} mark entr${failed.length > 1 ? "ies" : "y"} failed to save.`
        );
      } else {
        setSaveMessage("Marks updated successfully.");
      }

      await fetchStudentsAndMarks();
      try {
        router.refresh();
      } catch {
        /* noop */
      }
    } finally {
      setSaveLoading(false);
    }
  };

  return { saveLoading, saveMessage, setSaveMessage, handleSaveAll };
}
