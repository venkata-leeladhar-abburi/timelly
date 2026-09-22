import { useEffect, useState, useMemo } from "react";
import {
  loadExamsPage,
  peekExamsPage,
} from "@/lib/school/loadSchoolAdminFastTabs";
import type { ClassData, TermData } from "./types";
import type { ExamsCacheSnapshot } from "./examsCacheHelpers";
import { useExamTypeActions } from "./useExamTypeActions";
import { useSubjectActions } from "./useSubjectActions";

/**
 * All state, effects, and handlers for ExamsTab (exams.tsx). Verbatim
 * relocation of the original component body — same order, same closures,
 * same dependency arrays — only the final `return` is new. The component's
 * `if (loading) return <TimellyLoader />` guard stays in the component
 * itself (it's called after all hooks here, with no hooks after it, so
 * moving the guard's SOURCE VALUE (`loading`) out via this hook is safe).
 *
 * Exam-type and subject CRUD/state were split out into useExamTypeActions
 * and useSubjectActions (shared/) since they're the largest, most
 * self-contained concerns; both write to the shared exams-page cache via
 * a `getSnapshot` callback defined below so their cache writes still see
 * this hook's latest rawData/classes alongside each other's latest list.
 */
export function useExamsTabState() {
  const [rawData, setRawData] = useState<TermData[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedTermName, setSelectedTermName] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showAllSchedules, setShowAllSchedules] = useState(false);

  const getSnapshot = (): ExamsCacheSnapshot => ({
    terms: rawData,
    classes,
    examTypes: examTypeActions.examTypes,
    subjects: subjectActions.subjects,
  });

  const examTypeActions = useExamTypeActions(getSnapshot);
  const subjectActions = useSubjectActions(getSnapshot);

  const {
    examTypes,
    setExamTypesLoading,
    setExamTypes,
    syncMaxDrafts,
  } = examTypeActions;
  const { subjects, setSubjects, setSubjectsLoading } = subjectActions;

  useEffect(() => {
    const applyPayload = (payload: {
      terms: unknown[];
      classes: unknown[];
      examTypes: typeof examTypes;
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
    // syncMaxDrafts is a plain closure recreated every render (not a stable
    // setState setter) — intentionally omitted so this effect keeps firing
    // only on the primitive triggers below, matching the pre-split behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    examTypes.length,
    rawData.length,
    selectedClassId,
    selectedTermName,
    subjects.length,
    setExamTypes,
    setExamTypesLoading,
    setSubjects,
    setSubjectsLoading,
  ]);

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
    ...examTypeActions,
    ...subjectActions,
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
    uniqueTerms,
    isTermCompleted,
    activeSchedules,
    activeSubjects,
    activeTermData,
    nextExamDate,
    daysLeft,
  };
}
