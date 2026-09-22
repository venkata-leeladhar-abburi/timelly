import { useEffect, useState, useMemo } from "react";
import {
  loadExamsPage,
  peekExamsPage,
  setExamsPageCache,
} from "@/lib/school/loadSchoolAdminFastTabs";
import type { ExamTypeOption } from "@/lib/exams/examTypes";
import type { ClassData, TermData } from "./types";

/**
 * All state, effects, and handlers for ExamsTab (exams.tsx). Verbatim
 * relocation of the original component body — same order, same closures,
 * same dependency arrays — only the final `return` is new. The component's
 * `if (loading) return <TimellyLoader />` guard stays in the component
 * itself (it's called after all hooks here, with no hooks after it, so
 * moving the guard's SOURCE VALUE (`loading`) out via this hook is safe).
 */
export function useExamsTabState() {
  const [examTypes, setExamTypes] = useState<ExamTypeOption[]>([]);
  const [examTypesLoading, setExamTypesLoading] = useState(true);
  const [newExamType, setNewExamType] = useState("");
  const [newExamTypeMax, setNewExamTypeMax] = useState("");
  const [examTypeError, setExamTypeError] = useState("");
  const [examTypeSaving, setExamTypeSaving] = useState(false);
  const [maxMarksDrafts, setMaxMarksDrafts] = useState<Record<string, string>>({});
  const [sectionDraftsByType, setSectionDraftsByType] = useState<
    Record<string, Array<{ id?: string; name: string; maxMarks: string }>>
  >({});
  const [expandedExamType, setExpandedExamType] = useState<string | null>(null);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [newSubject, setNewSubject] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editingSubjectValue, setEditingSubjectValue] = useState("");

  const [rawData, setRawData] = useState<TermData[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedTermName, setSelectedTermName] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showAllSchedules, setShowAllSchedules] = useState(false);

  const updateExamsCache = (partial: Partial<{
    examTypes: ExamTypeOption[];
    subjects: string[];
    terms: TermData[];
    classes: ClassData[];
  }>) => {
    setExamsPageCache({
      terms: partial.terms ?? rawData,
      classes: partial.classes ?? classes,
      examTypes: partial.examTypes ?? examTypes,
      subjects: partial.subjects ?? subjects,
    });
  };

  const syncMaxDrafts = (types: ExamTypeOption[]) => {
    const next: Record<string, string> = {};
    const nextSections: Record<string, Array<{ id?: string; name: string; maxMarks: string }>> = {};
    types.forEach((t) => {
      next[t.name] = t.maxMarks != null ? String(t.maxMarks) : "";
      nextSections[t.name] = (t.sections ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        maxMarks: String(s.maxMarks),
      }));
    });
    setMaxMarksDrafts(next);
    setSectionDraftsByType(nextSections);
  };

  const deleteExamType = async (name: string) => {
    const upperName = name.trim().toUpperCase();
    if (!upperName) return;

    if (examTypes.length <= 1) {
      const confirmed = window.confirm(
        `"${upperName}" is the only exam type.\n\nAre you sure you want to delete it?`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(
        `Are you sure you want to delete exam type "${upperName}"?`
      );
      if (!confirmed) return;
    }

    setExamTypeError("");
    setExamTypeSaving(true);
    try {
      const res = await fetch(`/api/exam-types?name=${encodeURIComponent(upperName)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setExamTypeError(
          data?.message || "Failed to delete exam type. It may be in use."
        );
        return;
      }

      const next = examTypes.filter((type) => type.name.toUpperCase() !== upperName);
      setExamTypes(next);
      syncMaxDrafts(next);
      updateExamsCache({ examTypes: next });
    } catch (e) {
      console.error("Failed to delete exam type", e);
      setExamTypeError("Failed to delete exam type");
    } finally {
      setExamTypeSaving(false);
    }
  };

  const saveExamTypeMaxMarks = async (name: string) => {
    const upperName = name.trim().toUpperCase();
    const raw = maxMarksDrafts[upperName] ?? "";
    const maxMarks = raw.trim() === "" ? null : Number(raw);
    if (raw.trim() !== "" && (!Number.isFinite(maxMarks) || (maxMarks as number) <= 0)) {
      setExamTypeError("Max marks must be a positive number");
      return;
    }

    setExamTypeError("");
    setExamTypeSaving(true);
    try {
      const res = await fetch("/api/exam-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: upperName, maxMarks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExamTypeError(data?.message || "Failed to update max marks");
        return;
      }
      const updatedMax = data?.examType?.maxMarks ?? maxMarks;
      let next = examTypes.map((t) =>
        t.name === upperName ? { ...t, maxMarks: updatedMax } : t
      );
      if (!next.some((t) => t.name === upperName) && data?.examType) {
        next = [
          ...next,
          { name: data.examType.name, maxMarks: data.examType.maxMarks ?? null, sections: data.examType.sections ?? [] },
        ].sort((a, b) => a.name.localeCompare(b.name));
      }
      setExamTypes(next);
      syncMaxDrafts(next);
      updateExamsCache({ examTypes: next });
    } catch (e) {
      console.error("Failed to update max marks", e);
      setExamTypeError("Failed to update max marks");
    } finally {
      setExamTypeSaving(false);
    }
  };

  const addExamType = async () => {
    const name = newExamType.trim().toUpperCase();
    if (!name) {
      setExamTypeError("Enter exam type name");
      return;
    }
    if (examTypes.some((t) => t.name.toUpperCase() === name)) {
      setExamTypeError("This exam type name already exists");
      return;
    }

    const maxRaw = newExamTypeMax.trim();
    const maxMarks = maxRaw === "" ? null : Number(maxRaw);
    if (maxRaw !== "" && (!Number.isFinite(maxMarks) || (maxMarks as number) <= 0)) {
      setExamTypeError("Max marks must be a positive number");
      return;
    }

    setExamTypeError("");
    setExamTypeSaving(true);
    try {
      const res = await fetch("/api/exam-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, maxMarks }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setExamTypeError("This exam type name already exists");
        return;
      }
      if (!res.ok) {
        setExamTypeError(data?.message || "Failed to add exam type");
        return;
      }
      setNewExamType("");
      setNewExamTypeMax("");
      const created: ExamTypeOption = {
        name: data?.examType?.name ?? name,
        maxMarks: data?.examType?.maxMarks ?? maxMarks,
        sections: Array.isArray(data?.examType?.sections) ? data.examType.sections : [],
      };
      const next = [...examTypes.filter((t) => t.name !== created.name), created].sort(
        (a, b) => a.name.localeCompare(b.name)
      );
      setExamTypes(next);
      syncMaxDrafts(next);
      updateExamsCache({ examTypes: next });
    } catch (e) {
      console.error("Failed to add exam type", e);
      setExamTypeError("Failed to add exam type");
    } finally {
      setExamTypeSaving(false);
    }
  };

  const deleteSubject = async (name: string) => {
    const upperName = name.trim().toUpperCase();
    if (!upperName) return;

    const confirmed = window.confirm(
      `Remove "${upperName}" from the subjects list?\n\nExisting marks are not deleted.`
    );
    if (!confirmed) return;

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch(`/api/exam-subjects?name=${encodeURIComponent(upperName)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSubjectError(
          data?.message || "Failed to delete subject."
        );
        return;
      }

      const next = subjects.filter((subject) => subject.toUpperCase() !== upperName);
      setSubjects(next);
      updateExamsCache({ subjects: next });
      if (editingSubject === upperName) {
        setEditingSubject(null);
        setEditingSubjectValue("");
      }
    } catch (e) {
      console.error("Failed to delete subject", e);
      setSubjectError("Failed to delete subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const renameSubject = async (from: string) => {
    const fromName = from.trim().toUpperCase();
    const toName = editingSubjectValue.trim().toUpperCase();
    if (!fromName || !toName) {
      setSubjectError("Enter a subject name");
      return;
    }
    if (fromName === toName) {
      setEditingSubject(null);
      setEditingSubjectValue("");
      return;
    }
    if (subjects.some((s) => s.toUpperCase() === toName && s.toUpperCase() !== fromName)) {
      setSubjectError("This subject name already exists");
      return;
    }

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/exam-subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ from: fromName, to: toName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to rename subject");
        return;
      }
      const next = Array.from(
        new Set(subjects.map((s) => (s.toUpperCase() === fromName ? toName : s)))
      ).sort();
      setSubjects(next);
      updateExamsCache({ subjects: next });
      setEditingSubject(null);
      setEditingSubjectValue("");
    } catch (e) {
      console.error("Failed to rename subject", e);
      setSubjectError("Failed to rename subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const addSubject = async () => {
    const name = newSubject.trim().toUpperCase();
    if (!name) {
      setSubjectError("Enter subject name");
      return;
    }
    if (subjects.some((t) => t.toUpperCase() === name)) {
      setSubjectError("This subject name already exists");
      return;
    }

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/exam-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setSubjectError("This subject name already exists");
        return;
      }
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to add subject");
        return;
      }
      setNewSubject("");
      const next = Array.from(new Set([...subjects, name])).sort();
      setSubjects(next);
      updateExamsCache({ subjects: next });
    } catch (e) {
      console.error("Failed to add subject", e);
      setSubjectError("Failed to add subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  useEffect(() => {
    const applyPayload = (payload: {
      terms: unknown[];
      classes: unknown[];
      examTypes: ExamTypeOption[];
      subjects: string[];
    }) => {
      const data = payload.terms as TermData[];
      const classData = payload.classes as ClassData[];
      setRawData(data);
      setClasses(classData);
      setExamTypes(payload.examTypes);
      syncMaxDrafts(payload.examTypes);
      setSubjects(payload.subjects);
      setExamTypesLoading(false);
      setSubjectsLoading(false);

      if (!selectedClassId && classData.length > 0) {
        setSelectedClassId(classData[0].id);
      }

      if (!selectedTermName && data.length > 0) {
        const firstUpcoming = data.find((t) => t.status === "UPCOMING");
        setSelectedTermName(firstUpcoming ? firstUpcoming.name : data[0].name);
      }
    };

    const fetchExams = async (revalidate = false) => {
      if (!revalidate) {
        const cached = peekExamsPage();
        if (cached) {
          applyPayload(cached);
          setLoading(false);
          void fetchExams(true);
          return;
        }
      }

      try {
        setLoading(rawData.length === 0);
        setExamTypesLoading(examTypes.length === 0);
        setSubjectsLoading(subjects.length === 0);
        const payload = await loadExamsPage({ revalidate });
        applyPayload(payload);
      } catch (e) {
        console.error("Fetch failed", e);
      } finally {
        setLoading(false);
        setExamTypesLoading(false);
        setSubjectsLoading(false);
      }
    };
    fetchExams();
  }, [examTypes.length, rawData.length, selectedClassId, selectedTermName, subjects.length]);

  const filteredDataByClass = useMemo(() => {
    return selectedClassId
      ? rawData.filter((t) => t.class.id === selectedClassId)
      : rawData;
  }, [rawData, selectedClassId]);

  const uniqueTerms = useMemo(() => {
    const map = new Map<string, { name: string; status: string }>();
    filteredDataByClass.forEach((t) => {
      if (!map.has(t.name)) {
        map.set(t.name, { name: t.name, status: t.status });
      }
    });
    return Array.from(map.values());
  }, [filteredDataByClass]);

  const activeTermData = useMemo(() => {
    return filteredDataByClass.filter((t) => t.name === selectedTermName);
  }, [filteredDataByClass, selectedTermName]);

  const saveExamTypeSections = async (examTypeName: string) => {
    const upper = examTypeName.trim().toUpperCase();
    const drafts = sectionDraftsByType[upper] ?? [];
    for (const row of drafts) {
      if (!row.name.trim()) {
        setSectionError("Each subsection needs a name");
        return;
      }
      const n = Number(row.maxMarks);
      if (!Number.isFinite(n) || n <= 0) {
        setSectionError(`"${row.name}": max marks must be a positive number`);
        return;
      }
    }
    setSectionError("");
    setSectionSaving(true);
    try {
      const res = await fetch("/api/exam-types/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: upper,
          sections: drafts.map((s, i) => ({
            name: s.name.trim(),
            maxMarks: Number(s.maxMarks),
            order: i,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSectionError(data?.message || "Failed to save subsections");
        return;
      }
      const et = data?.examType;
      const sections = Array.isArray(et?.sections) ? et.sections : [];
      const next = examTypes.map((t) =>
        t.name === upper
          ? {
              ...t,
              maxMarks: et?.maxMarks ?? (sections.length
                  ? sections.reduce((a: number, s: { maxMarks: number }) => a + s.maxMarks, 0)
                  : t.maxMarks),
              sections,
            }
          : t
      );
      if (!next.some((t) => t.name === upper) && et) {
        next.push({
          name: et.name,
          maxMarks: et.maxMarks ?? null,
          sections,
        });
        next.sort((a, b) => a.name.localeCompare(b.name));
      }
      setExamTypes(next);
      syncMaxDrafts(next);
      updateExamsCache({ examTypes: next });
    } catch (e) {
      console.error(e);
      setSectionError("Failed to save subsections");
    } finally {
      setSectionSaving(false);
    }
  };

  const isTermCompleted = activeTermData.every((t) => t.status === "COMPLETED");

  const activeSchedules = useMemo(() => {
    return activeTermData
      .flatMap((t) => t.schedules)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  }, [activeTermData]);

  const activeSubjects = useMemo(() => {
    return Array.from(
      new Set(activeTermData.flatMap((t) => t.syllabus.map((s) => s.subject)))
    );
  }, [activeTermData]);

  const nextExamDate = activeSchedules[0] ? new Date(activeSchedules[0].examDate) : null;
  const daysLeft = nextExamDate
    ? Math.max(0, Math.ceil((nextExamDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    examTypes,
    examTypesLoading,
    newExamType,
    setNewExamType,
    newExamTypeMax,
    setNewExamTypeMax,
    examTypeError,
    examTypeSaving,
    maxMarksDrafts,
    setMaxMarksDrafts,
    sectionDraftsByType,
    setSectionDraftsByType,
    expandedExamType,
    setExpandedExamType,
    sectionSaving,
    sectionError,
    subjects,
    subjectsLoading,
    newSubject,
    setNewSubject,
    subjectError,
    setSubjectError,
    subjectSaving,
    editingSubject,
    setEditingSubject,
    editingSubjectValue,
    setEditingSubjectValue,
    classes,
    selectedClassId,
    setSelectedClassId,
    selectedTermName,
    setSelectedTermName,
    selectedSubject,
    setSelectedSubject,
    loading,
    showAllSchedules,
    setShowAllSchedules,
    deleteExamType,
    saveExamTypeMaxMarks,
    addExamType,
    deleteSubject,
    renameSubject,
    addSubject,
    uniqueTerms,
    saveExamTypeSections,
    isTermCompleted,
    activeSchedules,
    activeSubjects,
    activeTermData,
    nextExamDate,
    daysLeft,
  };
}
