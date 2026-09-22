import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { loadStudentDetailsBundle, peekStudentDetailsBundle } from "@/lib/students/loadStudentDetailsBundle";
import { getFeeBreakdownCached, fetchFeeBreakdownFast } from "@/lib/fees/feeBreakdownClientCache";
import { clearStudentListCache, writeStudentListCacheLegacy } from "@/lib/students/studentListSessionCache";
import { invalidateStudentDetailsBundleCache } from "@/lib/students/loadStudentDetailsBundle";
import { isInactiveStudentStatus } from "@/lib/students/resolveStudentDisplayClass";
import type { StudentDetail, StudentOption } from "./types";
import { buildPlaceholderById, buildPlaceholderDetail, normalizeStudentOption, patchDetailShell } from "./studentDetailHelpers";
import { useStudentFeeMutations } from "./useStudentFeeMutations";
import { useStudentListBootstrap } from "./useStudentListBootstrap";

export function useStudentDetailsPageState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studentIdFromUrl = searchParams.get("studentId");
  const focusFromUrl = searchParams.get("focus");

  const [students, setStudents] = useState<StudentOption[]>([]);
  /** Seed from URL so `/api/student/:id` runs immediately instead of waiting for the full student list. */
  const [selectedId, setSelectedId] = useState<string | null>(studentIdFromUrl);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [feeBreakdown, setFeeBreakdown] = useState<AdminStudentFeeBreakdownResult | null>(null);
  const [feeBreakdownPending, setFeeBreakdownPending] = useState(false);
  const [transactionsReady, setTransactionsReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [bulkExtraFeeOpen, setBulkExtraFeeOpen] = useState(false);
  const [feesModalOpen, setFeesModalOpen] = useState(false);
  const [autoPrintPaymentId, setAutoPrintPaymentId] = useState<string | null>(null);
  /** Payments removed in-session — stale bundle loads must not restore these. */
  const deletedPaymentIdsRef = useRef(new Set<string>());
  const sidebarAsideRef = useRef<HTMLElement>(null);
  const [showStickyStudentName, setShowStickyStudentName] = useState(false);

  useStudentListBootstrap({
    studentIdFromUrl,
    students,
    setStudents,
    setListLoading,
    setClasses,
    setSelectedId,
    setDetail,
  });

  const syncStudentIdInUrl = useCallback(
    (nextId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextId) params.set("studentId", nextId);
      else params.delete("studentId");
      const qs = params.toString();
      const base = pathname || "/";
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const selectStudent = useCallback(
    (student: StudentOption) => {
      setStudents((prev) => {
        if (prev.some((s) => s.id === student.id)) {
          return prev.map((s) => (s.id === student.id ? { ...s, ...student } : s));
        }
        return [student, ...prev];
      });
      setSelectedId(student.id);
      syncStudentIdInUrl(student.id);
    },
    [syncStudentIdInUrl]
  );

  const changeSelectedId = useCallback(
    (nextId: string | null) => {
      setSelectedId(nextId);
      syncStudentIdInUrl(nextId);
    },
    [syncStudentIdInUrl]
  );

  const warmFeeBreakdown = useCallback(() => {
    if (!selectedId) return;
    const shellPaid = Number(detail?.fee?.amountPaid) || 0;
    const cached = getFeeBreakdownCached(selectedId);
    if (cached && cached.amountPaid + 0.02 >= shellPaid) {
      setFeeBreakdown(cached);
      setFeeBreakdownPending(false);
      return;
    }
    if (feeBreakdown && feeBreakdown.amountPaid + 0.02 >= shellPaid) return;
    void fetchFeeBreakdownFast(selectedId, {
      force: Boolean(cached && shellPaid > cached.amountPaid + 0.02),
      minAmountPaid: shellPaid,
    }).then((breakdown) => {
      if (breakdown) {
        setFeeBreakdown(breakdown);
        setFeeBreakdownPending(false);
      }
    });
  }, [selectedId, feeBreakdown, detail?.fee?.amountPaid]);

  useLayoutEffect(() => {
    if (!detail || focusFromUrl !== "fees") return;
    document.getElementById("student-profile-fees-section")?.scrollIntoView({
      behavior: "instant",
      block: "start",
    });
  }, [detail, focusFromUrl]);

  useEffect(() => {
    deletedPaymentIdsRef.current.clear();
  }, [selectedId]);

  const { applyDetailsBundle, refreshFeesForStudent, removePaymentForStudent } = useStudentFeeMutations({
    setDetail,
    setFeeBreakdown,
    setTransactionsReady,
    deletedPaymentIdsRef,
  });

  useEffect(() => {
    if (reloadKey === 0) return;
    const id = selectedIdRef.current;
    if (id) invalidateStudentDetailsBundleCache(id);
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setFeeBreakdown(null);
      setTransactionsReady(false);
      return;
    }

    let cancelled = false;

    const cachedBreakdown = getFeeBreakdownCached(selectedId);
    const cachedBundle = reloadKey === 0 ? peekStudentDetailsBundle(selectedId) : null;
    if (cachedBundle?.student) {
      applyDetailsBundle(cachedBundle);
    } else {
      setTransactionsReady(false);
      setDetail((prev) => {
        if (prev?.student.id === selectedId) return prev;
        const fromList = students.find((s) => s.id === selectedId);
        return fromList
          ? buildPlaceholderDetail(normalizeStudentOption(fromList))
          : buildPlaceholderById(selectedId);
      });
    }
    if (cachedBreakdown) {
      setFeeBreakdown(cachedBreakdown);
      setFeeBreakdownPending(false);
    } else {
      setFeeBreakdownPending(true);
    }

    loadStudentDetailsBundle(selectedId, {
      force: reloadKey > 0,
      onShellLoaded: (partial) => {
        if (cancelled) return;
        const { feeBreakdown: bd, ...rest } = partial;
        if (rest?.student) {
          setDetail((prev) => patchDetailShell(prev, rest as StudentDetail));
          setStudents((prev) => {
            const row = normalizeStudentOption({
              id: rest.student.id,
              name: rest.student.name,
              admissionNumber: rest.student.admissionNumber,
              fatherName: rest.student.fatherName,
              classDisplay: rest.student.class?.displayName,
              classId: rest.student.class?.id,
              section: rest.student.class?.section,
              status: rest.student.status,
            });
            if (prev.some((s) => s.id === rest.student.id)) {
              return prev.map((s) => (s.id === rest.student.id ? { ...s, ...row } : s));
            }
            return [row, ...prev];
          });
        }
        if (bd) {
          setFeeBreakdown(bd);
          setFeeBreakdownPending(false);
        }
      },
      onBreakdownLoaded: (bd) => {
        if (cancelled) return;
        setFeeBreakdown(bd);
        setFeeBreakdownPending(false);
      },
      onExtrasLoaded: (full) => {
        if (cancelled) return;
        applyDetailsBundle(full);
      },
    })
      .then((bundle) => {
        if (cancelled) return;
        applyDetailsBundle(bundle);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Student details error:", err);
      })
      .finally(() => {
        if (!cancelled) setFeeBreakdownPending(false);
      });

    return () => {
      cancelled = true;
    };
    // `students` read for placeholder only — must not restart fetch when list hydrates
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [selectedId, reloadKey, applyDetailsBundle]);

  const filtered = students.filter((s) => {
    if (filterStatus === "active" && isInactiveStudentStatus(s.status)) return false;
    if (filterStatus === "inactive" && !isInactiveStudentStatus(s.status)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.admissionNumber.toLowerCase().includes(q) &&
        !s.id.toLowerCase().includes(q)
      )
        return false;
    }
    if (filterClass && s.classId !== filterClass) return false;
    if (filterSection && s.section !== filterSection) return false;
    return true;
  });

  /** Options for the Students List <select>; must include selectedId or the browser can reset the value. */
  const studentSelectOptions = useMemo(() => {
    const inactiveTag = (st: StudentOption) =>
      isInactiveStudentStatus(st.status) ? " (Inactive)" : "";
    const core = filtered.map((s) => ({
      label: `${s.name} -${s.admissionNumber || "-"} | ${s.classDisplay || "-"} | ${s.parentName || "-"}${inactiveTag(s)}`,
      value: s.id,
    }));
    if (selectedId && !core.some((o) => o.value === selectedId)) {
      const st = students.find((s) => s.id === selectedId);
      if (st) {
        return [
          {
            label: `${st.name} -${st.admissionNumber || "-"} | ${st.classDisplay || "-"} | ${st.parentName || "-"}${inactiveTag(st)}`,
            value: st.id,
          },
          ...core,
        ];
      }
      return [{ label: "Student (from link) — loading…", value: selectedId }, ...core];
    }
    return core;
  }, [filtered, students, selectedId]);

  const selectedOption = filtered.find((s) => s.id === selectedId) ?? students.find((s) => s.id === selectedId) ?? filtered[0];
  const isSelectedInactive = detail ? isInactiveStudentStatus(detail.student.status) : false;
  const pageStudentName = useMemo(() => {
    const fromDetail = detail?.student.name?.trim();
    if (fromDetail && fromDetail !== "Loading…") return fromDetail;
    const fromList = selectedOption?.name?.trim();
    if (fromList && fromList !== "Unknown") return fromList;
    return null;
  }, [detail?.student.name, selectedOption?.name]);
  const pageStudentMeta = useMemo(() => {
    if (!detail?.student) return null;
    const parts = [
      detail.student.admissionNumber?.trim(),
      detail.student.class?.displayName?.trim(),
      detail.student.rollNo?.trim() ? `Roll ${detail.student.rollNo.trim()}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }, [detail?.student]);
  useEffect(() => {
    const aside = sidebarAsideRef.current;
    if (!aside || !pageStudentName) {
      setShowStickyStudentName(false);
      return;
    }
    const scrollRoot = aside.closest("main");
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyStudentName(!entry.isIntersecting),
      scrollRoot
        ? { root: scrollRoot, threshold: 0, rootMargin: "-88px 0px 0px 0px" }
        : { threshold: 0, rootMargin: "-88px 0px 0px 0px" }
    );
    observer.observe(aside);
    return () => observer.disconnect();
  }, [pageStudentName, selectedId, detail?.student.id]);
  const classOptions = [{ label: "All Classes", value: "" }, ...classes.map((c) => ({ label: `${c.name}${c.section ? ` - ${c.section}` : ""}`, value: c.id }))];
  const statusOptions = [
    { label: "All Students", value: "all" },
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ];
  const sections = Array.from(new Set(classes.map((c) => c.section).filter(Boolean))) as string[];
  const sectionOptions = [{ label: "All Sections", value: "" }, ...sections.map((s) => ({ label: s, value: s }))];

  const handleSidebarSaved = useCallback(
    (patch?: {
      fatherName?: string;
      fatherPhone?: string;
      motherName?: string;
      motherPhone?: string;
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      rollNo?: string;
      classId?: string | null;
      classDisplayName?: string;
      gender?: string;
      residencyType?: string;
      dob?: string;
      age?: string;
    }) => {
      if (patch) {
        const sid = selectedIdRef.current;
        if (!sid) return;
        invalidateStudentDetailsBundleCache(sid);
        clearStudentListCache();
        if (patch.name !== undefined) {
          setStudents((prev) => {
            const next = prev.map((s) => (s.id === sid ? { ...s, name: patch.name! } : s));
            writeStudentListCacheLegacy(next);
            return next;
          });
        }
        setDetail((current) => {
          if (!current) return current;
          const nextStudent = { ...current.student };
          if (patch.fatherName !== undefined) nextStudent.fatherName = patch.fatherName;
          if (patch.fatherPhone !== undefined) {
            nextStudent.fatherPhone = patch.fatherPhone;
            nextStudent.phone = patch.fatherPhone;
          }
          if (patch.motherName !== undefined) nextStudent.motherName = patch.motherName;
          if (patch.motherPhone !== undefined) nextStudent.motherPhone = patch.motherPhone;
          if (patch.name !== undefined) nextStudent.name = patch.name;
          if (patch.email !== undefined) nextStudent.email = patch.email;
          if (patch.phone !== undefined) nextStudent.phone = patch.phone;
          if (patch.address !== undefined) nextStudent.address = patch.address;
          if (patch.rollNo !== undefined) nextStudent.rollNo = patch.rollNo;
          if (patch.gender !== undefined) nextStudent.gender = patch.gender;
          if (patch.residencyType !== undefined) nextStudent.residencyType = patch.residencyType;
          if (patch.dob !== undefined) nextStudent.dob = patch.dob;
          if (patch.age !== undefined) {
            const n = Number(patch.age);
            nextStudent.age = Number.isFinite(n) ? n : nextStudent.age;
          }
          if (patch.classId !== undefined) {
            if (patch.classId && patch.classDisplayName) {
              const dash = patch.classDisplayName.indexOf(" - ");
              nextStudent.class = {
                id: patch.classId,
                name: dash > 0 ? patch.classDisplayName.slice(0, dash) : patch.classDisplayName,
                section: dash > 0 ? patch.classDisplayName.slice(dash + 3) : null,
                displayName: patch.classDisplayName.replace(" - ", "-"),
              };
            } else {
              nextStudent.class = null;
            }
          }
          return { ...current, student: nextStudent };
        });
      }
      setReloadKey((k) => k + 1);
    },
    []
  );

  return {
    students,
    selectedId,
    detail,
    feeBreakdown,
    feeBreakdownPending,
    transactionsReady,
    listLoading,
    searchQuery,
    setSearchQuery,
    filterClass,
    setFilterClass,
    filterSection,
    setFilterSection,
    filterStatus,
    setFilterStatus,
    classes,
    bulkExtraFeeOpen,
    setBulkExtraFeeOpen,
    feesModalOpen,
    setFeesModalOpen,
    autoPrintPaymentId,
    setAutoPrintPaymentId,
    sidebarAsideRef,
    showStickyStudentName,
    selectStudent,
    changeSelectedId,
    warmFeeBreakdown,
    refreshFeesForStudent,
    removePaymentForStudent,
    setReloadKey,
    studentSelectOptions,
    isSelectedInactive,
    pageStudentName,
    pageStudentMeta,
    classOptions,
    statusOptions,
    sectionOptions,
    handleSidebarSaved,
  };
}
