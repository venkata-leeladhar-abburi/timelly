"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClassItem,
  SelectOption,
  StudentRow,
  StudentStatusFilter,
} from "./types";
import { sortStudentsForDisplay } from "./utils";
import type { Props } from "./shared/hookTypes";
import { EMPTY_CLASSES } from "./shared/defaults";
import { getClassesCache, preloadClasses } from "./shared/classesPreload";
import {
  clearStudentListCache,
  readStudentListCache,
  writeStudentListCache,
  type StudentListCacheScope,
} from "@/lib/students/studentListSessionCache";
import useStudentFormAdd from "./shared/useStudentFormAdd";
import useStudentEditDelete from "./shared/useStudentEditDelete";
import useStudentExport from "./shared/useStudentExport";

export default function useStudentPage({ classes, reload }: Props) {
  const stableClasses = classes ?? EMPTY_CLASSES;
  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>(
    stableClasses.length ? stableClasses : getClassesCache() ?? []
  );
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>("Active");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [inactiveCount, setInactiveCount] = useState<number | null>(null);
  const listFetchGenRef = useRef(0);

  const selectedClassIdForFetch = useMemo(() => {
    if (!selectedClass || !selectedSection) return "";
    const match = availableClasses.find(
      (item) => item.name === selectedClass && item.section === selectedSection
    );
    return match?.id ?? "";
  }, [availableClasses, selectedClass, selectedSection]);

  useEffect(() => {
    if (stableClasses.length) {
      setAvailableClasses(stableClasses);
    }
  }, [stableClasses]);

  useEffect(() => {
    if (stableClasses.length) return;

    const cached = getClassesCache();
    if (cached?.length) {
      setAvailableClasses(cached);
      return;
    }

    let active = true;
    setClassesLoading(true);
    preloadClasses()
      .then((data) => {
        if (!active || !data) return;
        setAvailableClasses(data);
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [stableClasses]);

  useEffect(() => {
    if (!selectedSection) return;
    const sectionExists = availableClasses.some(
      (item) =>
        item.section === selectedSection &&
        (!selectedClass || item.name === selectedClass)
    );
    if (!sectionExists) {
      setSelectedSection("");
    }
  }, [availableClasses, selectedClass, selectedSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const listCacheScope = useMemo<StudentListCacheScope>(
    () => ({
      status:
        statusFilter === "Active"
          ? "active"
          : statusFilter === "Inactive"
            ? "inactive"
            : "all",
      classId: selectedClassIdForFetch || undefined,
      className: selectedClass || undefined,
      section: selectedSection || undefined,
      q: debouncedSearch || undefined,
    }),
    [
      statusFilter,
      selectedClassIdForFetch,
      selectedClass,
      selectedSection,
      debouncedSearch,
    ]
  );

  const buildListParams = useCallback(
    (bypassCache?: boolean) => {
      const hasClassFilter = Boolean(
        selectedClassIdForFetch || selectedClass || selectedSection
      );
      const params = new URLSearchParams();
      // One request per filter — avoids slow multi-page appends and wrong counts.
      params.set("all", "1");
      params.set("take", "10000");
      params.set("includeTotal", "1");
      if (bypassCache) params.set("refresh", "1");
      if (statusFilter === "Active") params.set("status", "Active");
      else if (statusFilter === "Inactive") params.set("status", "Inactive");
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (selectedClassIdForFetch) {
        params.set("classId", selectedClassIdForFetch);
      } else {
        if (selectedClass) params.set("className", selectedClass);
        if (selectedSection) params.set("section", selectedSection);
      }
      return params;
    },
    [
      statusFilter,
      debouncedSearch,
      selectedClassIdForFetch,
      selectedClass,
      selectedSection,
    ]
  );

  const fetchStudentList = useCallback(
    async (opts?: { bypassCache?: boolean }) => {
      const gen = ++listFetchGenRef.current;
      const cached = !opts?.bypassCache ? readStudentListCache<StudentRow>(listCacheScope) : null;

      if (cached?.length && !opts?.bypassCache) {
        setStudents(cached);
        setListLoading(false);
      } else {
        setListLoading(true);
      }

      try {
        const params = buildListParams(opts?.bypassCache);
        const res = await fetch(`/api/student/list?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          students?: StudentRow[];
          items?: StudentRow[];
          nextCursor?: string | null;
          total?: number;
          message?: string;
        };
        if (gen !== listFetchGenRef.current) return;
        if (!res.ok) throw new Error(data.message || "Failed to load students");

        const items = Array.isArray(data.students)
          ? data.students
          : Array.isArray(data.items)
            ? data.items
            : [];

        setStudents(items);
        writeStudentListCache(items, listCacheScope);
        setNextCursor(null);
        if (typeof data.total === "number") setTotalCount(data.total);
      } catch {
        if (gen !== listFetchGenRef.current) return;
        if (cached?.length) {
          setStudents(cached);
        } else {
          setStudents([]);
        }
      } finally {
        if (gen === listFetchGenRef.current) {
          setListLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildListParams, listCacheScope]
  );

  useEffect(() => {
    setTotalCount(null);
    setNextCursor(null);
    void fetchStudentList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filters change
  }, [statusFilter, debouncedSearch, selectedClass, selectedSection, selectedClassIdForFetch]);

  const refreshStats = useCallback(async () => {
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        fetch("/api/student/list?take=1&includeTotal=1&status=Active", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/student/list?take=1&includeTotal=1&status=Inactive", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const activeData = await activeRes.json();
      const inactiveData = await inactiveRes.json();
      if (typeof activeData.total === "number") setActiveCount(activeData.total);
      if (typeof inactiveData.total === "number") {
        setInactiveCount(inactiveData.total);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const refreshList = useCallback(
    (silent?: boolean) => {
      clearStudentListCache();
      setNextCursor(null);
      void fetchStudentList({ bypassCache: !silent });
      void refreshStats();
    },
    [fetchStudentList, refreshStats]
  );

  const patchStudent = useCallback(
    (studentId: string, updater: (row: StudentRow) => StudentRow) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? updater(s) : s))
      );
    },
    []
  );

  const removeStudent = useCallback((studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
  }, []);

  const filterClassOptions = useMemo<SelectOption[]>(() => {
    const uniqueNames = Array.from(
      new Set(availableClasses.map((item) => item.name).filter(Boolean))
    ) as string[];
    return [
      { label: "All Classes", value: "" },
      ...uniqueNames.map((name) => ({ label: name, value: name })),
    ];
  }, [availableClasses]);

  const filterSectionOptions = useMemo<SelectOption[]>(() => {
    const sections = Array.from(
      new Set(
        availableClasses
          .filter((item) => !selectedClass || item.name === selectedClass)
          .map((item) => item.section)
          .filter(Boolean)
      )
    ) as string[];
    return [
      { label: "All Sections", value: "" },
      ...sections.map((section) => ({ label: section, value: section })),
    ];
  }, [availableClasses, selectedClass]);

  const formClassOptions = useMemo<SelectOption[]>(() => {
    if (classesLoading) {
      return [{ label: "Loading classes...", value: "" }];
    }
    if (!availableClasses.length) {
      return [{ label: "No classes found", value: "" }];
    }
    return [
      { label: "Select Class", value: "" },
      ...availableClasses.map((item) => ({
        label: `${item.name}${item.section ? ` - ${item.section}` : ""}`,
        value: item.id,
      })),
    ];
  }, [availableClasses, classesLoading]);

  const formSectionOptions = useMemo<SelectOption[]>(() => {
    const sections = Array.from(
      new Set(availableClasses.map((item) => item.section).filter(Boolean))
    ) as string[];
    if (classesLoading) {
      return [{ label: "Loading sections...", value: "" }];
    }
    if (!sections.length) {
      return [{ label: "No sections found", value: "" }];
    }
    return [
      { label: "Select Section", value: "" },
      ...sections.map((section) => ({ label: section, value: section })),
    ];
  }, [availableClasses, classesLoading]);

  const filteredStudents = useMemo<StudentRow[]>(() => {
    let list: StudentRow[] = students;
    if (selectedClass) {
      list = list.filter((student) => student.class?.name === selectedClass);
    }
    if (selectedSection) {
      list = list.filter((student) => student.class?.section === selectedSection);
    }
    if (statusFilter === "Active") {
      list = list.filter((student) => (student.status || "Active") === "Active");
    } else if (statusFilter === "Inactive") {
      list = list.filter((student) => student.status === "Inactive");
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      list = list.filter((student) => {
        const name = student.user?.name || student.name || "";
        const email = student.user?.email || student.email || "";
        const roll = student.rollNo || "";
        const phone = student.phoneNo || "";
        return (
          name.toLowerCase().includes(query) ||
          email.toLowerCase().includes(query) ||
          roll.toLowerCase().includes(query) ||
          phone.toLowerCase().includes(query)
        );
      });
    }
    return sortStudentsForDisplay(list);
  }, [
    searchQuery,
    selectedClass,
    selectedSection,
    statusFilter,
    students,
  ]);

  const selectedClassObj = availableClasses.find(
    (item) =>
      item.name === selectedClass &&
      (!selectedSection || item.section === selectedSection)
  );

  const formAdd = useStudentFormAdd({ statusFilter, refreshStats, refreshList });

  useEffect(() => {
    if (!formAdd.form.classId && selectedClassIdForFetch) {
      formAdd.setForm((prev) => ({ ...prev, classId: selectedClassIdForFetch }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verbatim relocation of original effect
  }, [selectedClassIdForFetch, formAdd.form.classId]);

  const editDelete = useStudentEditDelete({
    availableClasses,
    selectedClassIdForFetch,
    statusFilter,
    patchStudent,
    removeStudent,
    refreshStats,
    onBeforeOpenEdit: () => {
      formAdd.setShowAddForm(false);
      formAdd.setShowUploadPanel(false);
    },
  });

  const exportState = useStudentExport({
    filteredStudents,
    selectedClass,
    selectedSection,
    selectedClassIdForFetch,
    statusFilter,
  });

  return {
    filterClassOptions,
    filterSectionOptions,
    formClassOptions,
    formSectionOptions,
    classesLoading,
    selectedClass,
    setSelectedClass,
    selectedSection,
    setSelectedSection,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    ...formAdd,
    filteredStudents,
    tableLoading: listLoading,
    loadingMore,
    hasMore: false,
    totalCount,
    activeCount,
    inactiveCount,
    selectedClassObj,
    ...editDelete,
    ...exportState,
  };
}
