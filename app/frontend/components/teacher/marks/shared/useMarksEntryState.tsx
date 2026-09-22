import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  loadTeacherMarksClasses,
  peekTeacherMarksClasses,
} from "@/lib/teacher/loadTeacherFastTabs";
import {
  normalizeExamTypes,
  maxMarksForExamType,
  sectionsForExamType,
  type ExamTypeOption,
} from "@/lib/exams/examTypes";
import type { ClassOption, MarkApi, StudentApi, StudentRow } from "./types";
import { DEFAULT_EXAM_TYPES, mapLiteClasses, uniqueSubjects } from "./utils";
import { useMarksEntryColumns } from "./useMarksEntryColumns";
import { useMarksSaveAll } from "./useMarksSaveAll";

/**
 * All state, effects, and handlers for the marks-entry sub-tab of Marks.tsx.
 * Verbatim relocation of the original component body — same order, same
 * closures, same dependency arrays — only the final `return` is new.
 */
export function useMarksEntryState() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<"entry" | "report-card" | "download">("entry");
  const initialClasses = peekTeacherMarksClasses();
  const [classes, setClasses] = useState<ClassOption[]>(() =>
    initialClasses ? mapLiteClasses(initialClasses) : []
  );
  const [classesLoading, setClassesLoading] = useState(() => !initialClasses);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [examTypeCatalog, setExamTypeCatalog] = useState<ExamTypeOption[]>(
    DEFAULT_EXAM_TYPES.map((name) => ({ name, maxMarks: null, sections: [] }))
  );
  const [examTypeOptions, setExamTypeOptions] =
    useState<string[]>(DEFAULT_EXAM_TYPES);
  const [form, setForm] = useState<{
    classId: string;
    classLabel: string;
    section: string;
    subject: string;
    examType: string;
    maxMarks: number | "";
  }>(() => {
    const first = initialClasses?.[0];
    return {
      classId: first?.id ?? "",
      classLabel: first
        ? first.section
          ? `${first.name} - ${first.section}`
          : first.name
        : "",
      section: first?.section || "Section A",
      subject: "",
      examType: "TERM 1",
      maxMarks: 100,
    };
  });
  const configuredMaxMarks = maxMarksForExamType(examTypeCatalog, form.examType);
  const termSections = sectionsForExamType(examTypeCatalog, form.examType);
  const hasSubsections = termSections.length > 0;
  const sectionsTotalMax = termSections.reduce((a, s) => a + s.maxMarks, 0);
  const maxMarksLocked =
    hasSubsections ||
    (configuredMaxMarks != null && configuredMaxMarks > 0);
  const [activeBtn, setActiveBtn] = useState<null | "save" | "import" | "export">(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingMaxId, setEditingMaxId] = useState<string | null>(null);
  const [editingMaxValue, setEditingMaxValue] = useState("");
  const userSelectedClassRef = useRef(false);
  const userSelectedExamTypeRef = useRef(false);

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: c.section ? `${c.name} - ${c.section}` : c.name,
  }));
  const sectionOptions = form.classId
    ? (() => {
        const c = classes.find((x) => x.id === form.classId);
        if (c?.section) return [c.section];
        return ["Section A"];
      })()
    : ["Section A"];
  const fetchClasses = useCallback(async () => {
    const cached = peekTeacherMarksClasses();
    if (cached?.length) {
      setClasses(mapLiteClasses(cached));
      setClassesLoading(false);
      setForm((prev) => {
        if (userSelectedClassRef.current && prev.classId) return prev;
        if (prev.classId) return prev;
        const first = cached[0];
        return {
          ...prev,
          classId: first.id,
          classLabel: first.section ? `${first.name} - ${first.section}` : first.name,
          section: first.section || "Section A",
        };
      });
    } else {
      setClassesLoading(true);
    }

    try {
      const list = await loadTeacherMarksClasses({ revalidate: true });
      setClasses(mapLiteClasses(list));
      setForm((prev) => {
        if (userSelectedClassRef.current && prev.classId) return prev;
        const stillValid = list.some((c) => c.id === prev.classId);
        if (stillValid) return prev;
        if (list.length === 0) {
          return { ...prev, classId: "", classLabel: "", section: "" };
        }
        const first = list[0];
        return {
          ...prev,
          classId: first.id,
          classLabel: first.section ? `${first.name} - ${first.section}` : first.name,
          section: first.section || "Section A",
        };
      });
    } catch {
      if (!peekTeacherMarksClasses()?.length) setClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }, []);

  const fetchStudentsAndMarks = useCallback(async () => {
    if (!form.classId || !form.subject) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        classId: form.classId,
        subject: form.subject,
      });
      if (form.examType) {
        params.append("examType", form.examType);
      }

      const [studentsRes, marksRes] = await Promise.all([
        fetch(`/api/class/students?classId=${encodeURIComponent(form.classId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/marks/view?${params.toString()}`, {
          cache: "no-store",
        }),
      ]);
      const studentsData = await studentsRes.json();
      const marksData = await marksRes.json();
      const students: StudentApi[] = Array.isArray(studentsData.students) ? studentsData.students : [];
      const marks: MarkApi[] = Array.isArray(marksData.marks) ? marksData.marks : [];
      const examTypesInUse: string[] = Array.isArray(marksData.examTypesInUse)
        ? marksData.examTypesInUse.map((t: string) => String(t).trim().toUpperCase()).filter(Boolean)
        : [];
      const latestExamType =
        typeof marksData.latestExamType === "string"
          ? marksData.latestExamType.trim().toUpperCase()
          : "";

      if (examTypesInUse.length > 0) {
        setExamTypeOptions((prev) => Array.from(new Set([...examTypesInUse, ...prev])));
      }

      // If this exam type has no saved marks but another does, switch to the latest saved exam
      // (unless the teacher manually picked the exam type).
      const currentExam = (form.examType || "").trim().toUpperCase();
      if (
        marks.length === 0 &&
        latestExamType &&
        latestExamType !== currentExam &&
        !userSelectedExamTypeRef.current
      ) {
        setForm((prev) => ({ ...prev, examType: latestExamType }));
        return;
      }

      const markByStudent: Record<string, MarkApi> = {};
      for (const m of marks) {
        const existing = markByStudent[m.studentId];
        if (!existing || m.createdAt > existing.createdAt) {
          markByStudent[m.studentId] = m;
        }
      }

      // Restore max marks from what was previously saved (not the UI default of 100)
      const savedMarksList = Object.values(markByStudent).sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      );
      const latestTotal = savedMarksList.find(
        (m) => typeof m.totalMarks === "number" && m.totalMarks > 0
      )?.totalMarks;
      // Prefer subsections sum, else school-admin configured max, else saved/previous
      const lockedMax =
        termSections.length > 0
          ? termSections.reduce((a, s) => a + s.maxMarks, 0)
          : maxMarksForExamType(examTypeCatalog, form.examType);
      const defaultMax =
        lockedMax != null && lockedMax > 0
          ? lockedMax
          : latestTotal ??
            (typeof form.maxMarks === "number" && form.maxMarks > 0 ? form.maxMarks : 100);
      if (lockedMax != null && lockedMax > 0) {
        setForm((prev) =>
          prev.maxMarks === lockedMax ? prev : { ...prev, maxMarks: lockedMax }
        );
      } else if (latestTotal) {
        setForm((prev) =>
          prev.maxMarks === defaultMax ? prev : { ...prev, maxMarks: defaultMax }
        );
      }

      const newRows: StudentRow[] = students
        .map((s) => {
          const name = s.user?.name ?? "Student";
          const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=40&background=4ade80&color=fff`;
          const mark = markByStudent[s.id];
          const isAbsent = mark?.grade === "AB";
          const rowMax =
            termSections.length > 0
              ? defaultMax
              : mark && typeof mark.totalMarks === "number" && mark.totalMarks > 0
                ? mark.totalMarks
                : defaultMax;

          const componentScores: Record<string, number | "" | "AB"> = {};
          if (termSections.length > 0) {
            for (const sec of termSections) {
              const saved = mark?.components?.find(
                (c) => c.name.toUpperCase() === sec.name.toUpperCase()
              );
              if (isAbsent) {
                componentScores[sec.name] = "AB";
              } else if (saved) {
                componentScores[sec.name] = Number(saved.marks);
              } else {
                componentScores[sec.name] = "";
              }
            }
          }

          return {
            id: s.id,
            rollNo: s.rollNo ?? "--",
            name,
            avatar: s.user?.photoUrl?.trim() || fallbackAvatar,
            marks: mark ? (isAbsent ? ("AB" as const) : Number(mark.marks)) : ("" as const),
            maxMarks: rowMax,
            markId: mark?.id,
            componentScores: termSections.length > 0 ? componentScores : undefined,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setRows(newRows);
      setEditingMaxId(null);
      setSaveMessage("");
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.maxMarks intentionally excluded (matches original); setSaveMessage is a stable setter
  }, [form.classId, form.subject, form.examType, examTypeCatalog, termSections]);

  const fetchMetadata = useCallback(async (classId: string) => {
    setSubjectsLoading(true);
    try {
      const [examTypesRes, meRes, termsRes] = await Promise.all([
        fetch("/api/exam-types", { cache: "no-store" }).catch(() => null),
        fetch("/api/user/me", { cache: "no-store", credentials: "include" }).catch(() => null),
        fetch(`/api/exams/terms?${classId ? `classId=${classId}` : ""}`, {
          cache: "no-store",
          credentials: "include",
        }).catch(() => null),
      ]);

      const allExamNames = new Set<string>();

      if (examTypesRes?.ok) {
        const data = await examTypesRes.json().catch(() => ({}));
        const catalog = normalizeExamTypes(data.examTypes);
        if (catalog.length > 0) {
          setExamTypeCatalog(catalog);
          catalog.forEach((t) => allExamNames.add(t.name));
        }
      }

      if (termsRes?.ok) {
        const data = await termsRes.json().catch(() => ({}));
        const exams = Array.isArray(data.exams) ? data.exams : [];
        exams.forEach((exam: { name?: string }) => {
          if (exam.name?.trim()) allExamNames.add(exam.name.trim().toUpperCase());
        });
      }

      if (allExamNames.size > 0) {
        setExamTypeOptions((prev) => Array.from(new Set([...allExamNames, ...prev])));
        setForm((prev) =>
          allExamNames.has(prev.examType) || userSelectedExamTypeRef.current
            ? prev
            : { ...prev, examType: Array.from(allExamNames)[0] }
        );
      }

      let teacherSubjects: string[] = [];
      if (meRes?.ok) {
        const data = await meRes.json().catch(() => ({}));
        const user = data?.user;
        const fromList = Array.isArray(user?.subjects) ? user.subjects : [];
        const primary = typeof user?.subject === "string" ? user.subject : "";
        teacherSubjects = uniqueSubjects([...fromList, primary].filter(Boolean));
      }

      setSubjectOptions(teacherSubjects);
      setForm((prev) => {
        if (teacherSubjects.length === 0) {
          return { ...prev, subject: "" };
        }
        const match = teacherSubjects.find(
          (s) => s.replace(/\s+/g, " ").toUpperCase() === prev.subject.replace(/\s+/g, " ").toUpperCase()
        );
        return match ? { ...prev, subject: match } : { ...prev, subject: teacherSubjects[0] };
      });
    } finally {
      setSubjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
    fetchMetadata(initialClasses?.[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const locked = maxMarksForExamType(examTypeCatalog, form.examType);
    if (locked != null && locked > 0) {
      setForm((prev) =>
        prev.maxMarks === locked ? prev : { ...prev, maxMarks: locked }
      );
    }
  }, [examTypeCatalog, form.examType]);

  useEffect(() => {
    fetchStudentsAndMarks();
  }, [fetchStudentsAndMarks]);

  const handleChange = (key: string, value: string) => {
    if (key === "examType") {
      userSelectedExamTypeRef.current = true;
      const nextType = value.toUpperCase();
      const locked = maxMarksForExamType(examTypeCatalog, nextType);
      setForm((prev) => ({
        ...prev,
        examType: nextType,
        maxMarks: locked != null && locked > 0 ? locked : prev.maxMarks,
      }));
      if (locked != null && locked > 0) {
        setRows((prev) =>
          prev.map((r) => {
            const marks = r.marks;
            const nextMarks =
              typeof marks === "number" && marks > locked ? locked : marks;
            return { ...r, maxMarks: locked, marks: nextMarks };
          })
        );
      }
      return;
    }
    if (key === "class") {
      if (!value || value === "Select class") {
        userSelectedClassRef.current = false;
        userSelectedExamTypeRef.current = false;
        setForm((prev) => ({ ...prev, classId: "", classLabel: "", section: "" }));
        return;
      }
      userSelectedClassRef.current = true;
      userSelectedExamTypeRef.current = false;
      const opt = classOptions.find((o) => o.value === value || o.label === value);
      const c = classes.find((x) => x.id === value || (x.section ? `${x.name} - ${x.section}` : x.name) === value);
      setForm((prev) => ({
        ...prev,
        classId: opt?.value ?? "",
        classLabel: opt?.label ?? value,
        section: c?.section ?? prev.section,
      }));
      return;
    }
    if (key === "section") {
      setForm((prev) => ({ ...prev, section: value }));
      return;
    }
    if (key === "subject") {
      userSelectedExamTypeRef.current = false;
      setForm((prev) => ({ ...prev, subject: value }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateMarks = (id: string, value: string) => {
    const num = value === "" ? "" : Math.min(1000, Math.max(0, Number(value)));
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, marks: num } : r)));
  };

  const updateComponentScore = (studentId: string, sectionName: string, value: string) => {
    const section = termSections.find((s) => s.name === sectionName);
    const max = section?.maxMarks ?? 1000;
    const num =
      value === ""
        ? ("" as const)
        : Math.min(max, Math.max(0, Number(value)));

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== studentId) return r;
        const nextScores = { ...(r.componentScores || {}), [sectionName]: num };
        let total: number | "" | "AB" = 0;
        let allEmpty = true;
        let anyAb = false;
        for (const sec of termSections) {
          const v = nextScores[sec.name];
          if (v === "AB") anyAb = true;
          if (v !== "" && v !== undefined) allEmpty = false;
          if (typeof v === "number") total = (typeof total === "number" ? total : 0) + v;
        }
        if (anyAb && allEmpty === false) {
          // keep numeric total from non-AB parts; AB on one section still allows others
        }
        return {
          ...r,
          componentScores: nextScores,
          marks: allEmpty ? ("" as const) : (total as number),
          maxMarks: sectionsTotalMax || r.maxMarks,
        };
      })
    );
  };

  const toggleAbsent = (id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const goingAbsent = r.marks !== "AB";
        if (hasSubsections) {
          const nextScores: Record<string, number | "" | "AB"> = {};
          for (const sec of termSections) {
            nextScores[sec.name] = goingAbsent ? "AB" : "";
          }
          return {
            ...r,
            marks: goingAbsent ? ("AB" as const) : ("" as const),
            componentScores: nextScores,
            maxMarks: sectionsTotalMax || r.maxMarks,
          };
        }
        return { ...r, marks: goingAbsent ? ("AB" as const) : ("" as const) };
      })
    );
  };

  const updateMaxMarks = (value: string) => {
    if (maxMarksLocked) return;
    // Allow fully clearing the field — applies to all students
    if (value.trim() === "") {
      setForm((prev) => ({ ...prev, maxMarks: "" }));
      setRows((prev) => prev.map((r) => ({ ...r, maxMarks: "" as const })));
      setEditingMaxId(null);
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const num = Math.min(1000, Math.max(1, parsed));
    setForm((prev) => ({ ...prev, maxMarks: num }));
    setRows((prev) =>
      prev.map((r) => {
        const nextMarks =
          r.marks !== "" && r.marks !== "AB" && Number(r.marks) > num ? num : r.marks;
        return { ...r, maxMarks: num, marks: nextMarks };
      })
    );
    setEditingMaxId(null);
  };

  const updateRowMaxMarks = (id: string, value: string) => {
    if (value.trim() === "") {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, maxMarks: "" as const } : r)));
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const num = Math.min(1000, Math.max(1, parsed));
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const nextMarks =
          r.marks !== "" && r.marks !== "AB" && Number(r.marks) > num ? num : r.marks;
        return { ...r, maxMarks: num, marks: nextMarks };
      })
    );
    setForm((prev) => ({ ...prev, maxMarks: num }));
  };

  const startEditMaxMarks = (id: string, current: number | "") => {
    if (maxMarksLocked) return;
    setEditingMaxId(id);
    setEditingMaxValue(current === "" ? "" : String(current));
  };

  const commitEditMaxMarks = (id: string) => {
    updateRowMaxMarks(id, editingMaxValue);
    setEditingMaxId(null);
    setEditingMaxValue("");
  };

  const getPercentage = (m: number | "" | "AB", max: number | "") =>
    m === "" || max === "" || max <= 0
      ? "--"
      : m === "AB"
        ? "Absent"
        : `${((Number(m) / max) * 100).toFixed(1)}%`;

  const getGrade = (m: number | "" | "AB", max: number | "") => {
    if (m === "AB") return "AB";
    if (m === "" || max === "" || max <= 0) return "--";
    const pct = (Number(m) / max) * 100;
    if (pct >= 90) return "A+";
    if (pct >= 80) return "A";
    if (pct >= 70) return "B+";
    if (pct >= 60) return "B";
    return "C";
  };

  const total = rows.length;
  const entered = rows.filter((r) => {
    if (hasSubsections) {
      if (r.marks === "AB") return true;
      return termSections.every((sec) => {
        const v = r.componentScores?.[sec.name];
        return v !== "" && v !== undefined;
      });
    }
    return r.marks !== "";
  }).length;
  const absentCount = rows.filter((r) => r.marks === "AB").length;
  const pending = total - entered;

  const { saveLoading, saveMessage, setSaveMessage, handleSaveAll } = useMarksSaveAll({
    form,
    rows,
    setRows,
    hasSubsections,
    termSections,
    sectionsTotalMax,
    fetchStudentsAndMarks,
    router,
  });

  const { columns } = useMarksEntryColumns({
    hasSubsections,
    termSections,
    updateComponentScore,
    updateMarks,
    toggleAbsent,
    editingMaxId,
    maxMarksLocked,
    editingMaxValue,
    setEditingMaxValue,
    setEditingMaxId,
    commitEditMaxMarks,
    startEditMaxMarks,
    getPercentage,
    getGrade,
  });

  const displayClass = form.classLabel || form.classId || "Select class";
  const displaySection = form.section || "Section A";

  return {
    subTab,
    setSubTab,
    classesLoading,
    classes,
    subjectsLoading,
    subjectOptions,
    form,
    handleChange,
    classOptions,
    sectionOptions,
    examTypeOptions,
    maxMarksLocked,
    hasSubsections,
    sectionsTotalMax,
    updateMaxMarks,
    activeBtn,
    setActiveBtn,
    loading,
    columns,
    rows,
    updateMarks,
    toggleAbsent,
    editingMaxId,
    setEditingMaxId,
    editingMaxValue,
    setEditingMaxValue,
    commitEditMaxMarks,
    startEditMaxMarks,
    getPercentage,
    getGrade,
    total,
    entered,
    absentCount,
    pending,
    saveMessage,
    saveLoading,
    handleSaveAll,
    displayClass,
    displaySection,
  };
}
