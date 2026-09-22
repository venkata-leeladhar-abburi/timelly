import { Eye, Pencil, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderActionButton from "../../common/HeaderActionButton";
import {
  loadClassesPage,
  peekClassesPage,
  setClassesPageCache,
  type ClassesPagePayload,
  type SchoolAdminClassRow,
} from "@/lib/school/loadSchoolAdminFastTabs";
import { generateClassesReportPdf } from "./classesReportPdf";

export function useClassesState() {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<
    "class" | "section" | "assign" | "csv" | "none"
  >("class");
  const [search, setSearch] = useState("");
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"view" | "edit" | "delete" | null>(null);
  const [mobileEdit, setMobileEdit] = useState<{ className: string; section: string } | null>(null);
  const [classRows, setClassRows] = useState<SchoolAdminClassRow[]>([]);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [avgSize, setAvgSize] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isReportDownloading, setIsReportDownloading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 6;
  const [reportStatus, setReportStatus] = useState<
    "idle" | "downloading" | "success"
  >("idle");
  const [savingClassId, setSavingClassId] = useState<string | null>(null);

  const applyClassesPayload = useCallback((payload: ClassesPagePayload) => {
    setClassRows(payload.classRows);
    setTotalClasses(payload.totalClasses);
    setTotalStudents(payload.totalStudents);
    setTotalTeachers(payload.totalTeachers);
    setAvgSize(payload.avgSize);
  }, []);

  const cacheRows = useCallback(
    (rows: SchoolAdminClassRow[]) => {
      const payload = {
        classRows: rows,
        totalClasses: rows.length,
        totalStudents,
        totalTeachers,
        avgSize: rows.length > 0 ? Math.round(totalStudents / rows.length) : 0,
      };
      setClassesPageCache(payload);
      applyClassesPayload(payload);
    },
    [applyClassesPayload, totalStudents, totalTeachers]
  );

  const loadClasses = useCallback(async (revalidate = false) => {
    if (!revalidate) {
      const cached = peekClassesPage();
      if (cached) {
        applyClassesPayload(cached);
        setIsLoading(false);
        void loadClasses(true);
        return;
      }
    }

    setIsLoading(classRows.length === 0);
    setLoadError(null);
    try {
      const payload = await loadClassesPage({ revalidate });
      applyClassesPayload(payload);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load classes.";
      setLoadError(message);
      if (classRows.length === 0) {
        setClassRows([]);
        setTotalClasses(0);
        setTotalStudents(0);
        setTotalTeachers(0);
        setAvgSize(0);
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyClassesPayload, classRows.length]);

  const refreshAfterMutation = useCallback(() => {
    void loadClasses(true);
    try {
      router.refresh();
    } catch {
      /* noop */
    }
  }, [loadClasses, router]);

  useEffect(() => {
    let isActive = true;
    if (!isActive) return;
    loadClasses();
    return () => {
      isActive = false;
    };
  }, [loadClasses]);

  const filteredRows = classRows.filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      row.name.toLowerCase().includes(q) ||
      row.section.toLowerCase().includes(q) ||
      row.teacher.toLowerCase().includes(q) ||
      row.subject.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const pagedRows = filteredRows.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const closePanel = () => {
    setPanelMode(null);
    setActiveRowId(null);
    setMobileEdit(null);
  };

  const tableColumns = [
    {
      header: "CLASS NAME",
      render: (row: (typeof classRows)[number]) => (
        <span className="text-white font-medium">{row.name}</span>
      ),
    },
    {
      header: "SECTION",
      render: (row: (typeof classRows)[number]) => (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
          {row.section}
        </span>
      ),
    },
    {
      header: "STUDENTS",
      align: "center" as const,
      render: (row: (typeof classRows)[number]) => (
        <span className="text-white font-semibold">{row.students}</span>
      ),
    },
    {
      header: "CLASS TEACHER",
      render: (row: (typeof classRows)[number]) => (
        <div>
          <div className="text-white font-medium">{row.teacher}</div>
          <div className="text-xs text-white/40">{row.subject}</div>
        </div>
      ),
    },
    {
      header: "ACTIONS",
      align: "center" as const,
      render: (row: (typeof classRows)[number]) => (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "view") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("view");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="View"
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "edit") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("edit");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-green-400 hover:bg-white/10 transition-colors cursor-pointer"
            title="Edit"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "delete") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("delete");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const handleReportClick = async () => {
    if (isReportDownloading) return;
    setIsReportDownloading(true);
    try {
      const rowsToExport = filteredRows;
      if (rowsToExport.length === 0) {
        window.alert("No classes available to export.");
        setIsReportDownloading(false);
        return;
      }

      window.alert("Report is downloading...");
      await generateClassesReportPdf(rowsToExport);
    } catch {
      window.alert("Failed to generate report.");
    } finally {
      setIsReportDownloading(false);
    }
  };

  const handleTempDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/class/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to delete class.");
      }
      setClassRows((prev) => {
        const next = prev.filter((row) => row.id !== id);
        cacheRows(next);
        return next;
      });
      closePanel();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete class.");
    }
  };

  const saveClassChanges = async (payload: {
    id: string;
    name: string;
    section: string;
    teacherId?: string;
  }) => {
    setSavingClassId(payload.id);
    try {
      const res = await fetch(`/api/class/${payload.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          section: payload.section,
          teacherId: payload.teacherId ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update class.");
      }
      const updated = data?.class;
      if (updated) {
        setClassRows((prev) => {
          const next = prev.map((row) =>
            row.id === payload.id
              ? {
                  ...row,
                  name: updated.name ?? row.name,
                  section: updated.section
                    ? `Section ${updated.section}`
                    : row.section,
                  teacher: updated.teacher?.name ?? row.teacher,
                  subject: updated.teacher?.email ?? row.subject,
                }
              : row
          );
          cacheRows(next);
          return next;
        });
      }
      return true;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to update class.");
      return false;
    } finally {
      setSavingClassId(null);
    }
  };

  const renderButton = (
    type: "class" | "section" | "assign" | "csv" | "report",
    Icon: LucideIcon,
    label: string,
    onClick: () => void,
    primary?: boolean,
    disabled?: boolean
  ) => {
    const isActive =
      (type === "class" && activeAction === "class") ||
      (type === "section" && activeAction === "section") ||
      (type === "assign" && activeAction === "assign") ||
      (type === "csv" && activeAction === "csv");

    return (
      <>
        {/* MOBILE */}
        <div className="xl:hidden">
          {isActive ? (
            <HeaderActionButton
              icon={Icon}
              label={label}
              primary={primary}
              onClick={onClick}
            />
          ) : (
            <button
              onClick={() => {
                if (!disabled) onClick();
              }}
              disabled={disabled}
              className={`h-10 w-10 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 ${
                disabled ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <Icon size={18} />
            </button>
          )}
        </div>

        {/* DESKTOP */}
        <div className="hidden xl:block">
          <HeaderActionButton
            icon={Icon}
            label={label}
            primary={primary}
            onClick={() => {
              if (!disabled) onClick();
            }}
          />
        </div>
      </>
    );
  };

  return {
    activeAction,
    setActiveAction,
    search,
    setSearch,
    activeRowId,
    setActiveRowId,
    panelMode,
    setPanelMode,
    mobileEdit,
    setMobileEdit,
    classRows,
    totalClasses,
    totalStudents,
    totalTeachers,
    avgSize,
    isLoading,
    isReportDownloading,
    loadError,
    currentPage,
    setCurrentPage,
    rowsPerPage,
    reportStatus,
    setReportStatus,
    savingClassId,
    refreshAfterMutation,
    filteredRows,
    totalPages,
    safePage,
    startIndex,
    endIndex,
    pagedRows,
    closePanel,
    tableColumns,
    handleReportClick,
    handleTempDelete,
    saveClassChanges,
    renderButton,
  };
}
