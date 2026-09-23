import { useState, useEffect, useMemo } from "react";
import { downloadConsolidatedMarksPdf } from "@/lib/exams/consolidatedMarksPdf";
import { normalizeExamTypes } from "@/lib/exams/examTypes";
import { generateConsolidatedMarksExcel } from "./consolidatedMarksExcel";
import {
  DEFAULT_EXAM_TYPES,
  normalizeClassName,
  type ClassOption,
  type ConsolidatedPayload,
} from "./downloadReportsTypes";

export function useDownloadReportsState() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  /** class = combine all sections under a class name; section = one sheet per section */
  const [selectMode, setSelectMode] = useState<"class" | "section">("class");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [examTypeOptions, setExamTypeOptions] = useState<string[]>(DEFAULT_EXAM_TYPES);
  const [selectedExamType, setSelectedExamType] = useState("ALL");
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [classSearch, setClassSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState<"excel" | "pdf" | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    (async () => {
      setClassesLoading(true);
      try {
        const res = await fetch("/api/class/list?lite=1", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.classes) ? data.classes : [];
        setClasses(
          list.map(
            (c: { id: string; name: string; section?: string | null }) => ({
              id: c.id,
              name: c.name,
              section: c.section ?? null,
              label: c.section ? `${c.name} - ${c.section}` : c.name,
            })
          )
        );
      } catch {
        setClasses([]);
      } finally {
        setClassesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [examRes, subRes] = await Promise.all([
          fetch("/api/exam-types", { cache: "no-store", credentials: "include" }),
          fetch("/api/exam-subjects", { cache: "no-store", credentials: "include" }),
        ]);
        if (examRes.ok) {
          const data = await examRes.json();
          const names = normalizeExamTypes(data.examTypes).map((t) => t.name);
          if (names.length > 0) setExamTypeOptions(["ALL", ...names]);
        }
        if (subRes.ok) {
          const data = await subRes.json();
          const names: string[] = Array.isArray(data.subjects) ? data.subjects : [];
          setSubjectOptions(names);
        }
      } catch {
        /* noop */
      }
    })();
  }, []);

  const classGroups = useMemo(() => {
    const map = new Map<string, { name: string; sections: ClassOption[] }>();
    for (const c of classes) {
      const key = normalizeClassName(c.name);
      const existing = map.get(key);
      if (existing) existing.sections.push(c);
      else map.set(key, { name: c.name, sections: [c] });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [classes]);

  const filteredOptions = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (selectMode === "class") {
      const items = classGroups.map((g) => ({
        key: normalizeClassName(g.name),
        label: g.name,
        hint:
          g.sections.length > 1
            ? `${g.sections.length} sections combined`
            : g.sections[0]?.section
              ? `Section ${g.sections[0].section}`
              : "1 class",
      }));
      if (!q) return items;
      return items.filter((i) => i.label.toLowerCase().includes(q));
    }
    const items = classes.map((c) => ({
      key: c.id,
      label: c.label,
      hint: null as string | null,
    }));
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [selectMode, classGroups, classes, classSearch]);

  const resolveSelectedClassIds = (): string[] => {
    if (selectMode === "section") return Array.from(selectedKeys);
    const ids: string[] = [];
    for (const key of selectedKeys) {
      const group = classGroups.find((g) => normalizeClassName(g.name) === key);
      if (group) ids.push(...group.sections.map((s) => s.id));
    }
    return ids;
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visible = filteredOptions.map((o) => o.key);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = visible.every((k) => next.has(k));
      if (allSelected) visible.forEach((k) => next.delete(k));
      else visible.forEach((k) => next.add(k));
      return next;
    });
  };

  const changeMode = (mode: "class" | "section") => {
    setSelectMode(mode);
    setSelectedKeys(new Set());
    setClassSearch("");
  };

  const toggleSubject = (name: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAllSubjects = () => {
    setSelectedSubjects((prev) => {
      if (prev.size === subjectOptions.length) return new Set();
      return new Set(subjectOptions);
    });
  };

  const fetchConsolidated = async (): Promise<ConsolidatedPayload> => {
    const classIds = resolveSelectedClassIds();
    if (classIds.length === 0) throw new Error("Select at least one class or section");

    const params = new URLSearchParams({
      classIds: classIds.join(","),
      groupBy: selectMode,
    });
    if (selectedExamType && selectedExamType !== "ALL") {
      params.set("examType", selectedExamType);
    }
    if (selectedSubjects.size > 0) {
      params.set("subjects", Array.from(selectedSubjects).join(","));
    }

    const res = await fetch(`/api/marks/consolidated?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json()) as ConsolidatedPayload & { message?: string };
    if (!res.ok) throw new Error(data.message || "Failed to load consolidated marks");
    if ((data.sheets ?? []).length === 0) throw new Error("No class sheets to export");
    return data;
  };

  const handleDownloadExcel = async () => {
    if (selectedKeys.size === 0) return;
    setDownloading(true);
    setDownloadType("excel");
    setProgress("Building consolidated marks…");

    try {
      const data = await fetchConsolidated();
      setProgress("Downloading Excel…");
      await generateConsolidatedMarksExcel(data, selectedExamType, selectMode);
      setProgress("Done");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate Excel");
      setProgress("");
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadType(null);
        setProgress("");
      }, 800);
    }
  };

  const handleDownloadPdf = async () => {
    if (selectedKeys.size === 0) return;
    setDownloading(true);
    setDownloadType("pdf");
    setProgress("Building consolidated marks…");

    try {
      const data = await fetchConsolidated();
      setProgress("Generating PDF…");

      const examFile =
        selectedExamType === "ALL" ? "ALL_EXAMS" : selectedExamType.replace(/\s+/g, "_");
      const modeFile = selectMode === "class" ? "BY_CLASS" : "BY_SECTION";

      await downloadConsolidatedMarksPdf(
        {
          school: data.school,
          examType: data.examType,
          sheets: data.sheets ?? [],
        },
        `${examFile}_CONSOLIDATED_${modeFile}_${new Date().toISOString().slice(0, 10)}.pdf`
      );
      setProgress("Done");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate PDF");
      setProgress("");
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadType(null);
        setProgress("");
      }, 800);
    }
  };

  const allVisibleSelected =
    filteredOptions.length > 0 &&
    filteredOptions.every((o) => selectedKeys.has(o.key));

  return {
    classesLoading,
    selectMode,
    selectedKeys,
    setSelectedKeys,
    examTypeOptions,
    selectedExamType,
    setSelectedExamType,
    subjectOptions,
    selectedSubjects,
    classSearch,
    setClassSearch,
    downloading,
    downloadType,
    progress,
    filteredOptions,
    toggleKey,
    selectAllVisible,
    changeMode,
    toggleSubject,
    selectAllSubjects,
    handleDownloadExcel,
    handleDownloadPdf,
    allVisibleSelected,
  };
}
