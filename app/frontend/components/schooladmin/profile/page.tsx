"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AcademicPerformance } from "./components/AcademicPerformance";
import { FeeTransactions } from "./components/FeeTransactions";
import { FeesBreakdown } from "./components/FeesBreakdown";
import { ProfileSidebar } from "./components/ProfileSidebar";
import { AttendanceTrends } from "./components/AttendanceTrends";
import { Certificates } from "./components/Certificates";
import type { StudentDetailsTabPayload } from "@/lib/students/buildStudentDetailsTabPayload";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import {
  invalidateStudentDetailsBundleCache,
  loadStudentDetailsBundle,
  peekStudentDetailsBundle,
  refreshStudentFeesAfterMutation,
} from "@/lib/students/loadStudentDetailsBundle";
import {
  fetchFeeBreakdownFast,
  getFeeBreakdownCached,
  invalidateFeeBreakdownCache,
  setFeeBreakdownCache,
} from "@/lib/fees/feeBreakdownClientCache";
import { readStudentListCacheLegacy, clearStudentListCache, writeStudentListCacheLegacy } from "@/lib/students/studentListSessionCache";
import { isInactiveStudentStatus } from "@/lib/students/resolveStudentDisplayClass";
import { resolveStudentDisplayName } from "@/lib/students/resolveStudentDisplayName";
import { Calendar, BookOpen, Activity, Clock, FileSpreadsheet } from "lucide-react";
import BulkExtraFeeByTimellyModal from "./components/BulkExtraFeeByTimellyModal";
import PageHeader from "../../common/PageHeader";
import Spinner from "../../common/Spinner";
import type { FeeDeleteSuccess, FeePaymentSuccess, StudentDetail, StudentOption } from "./shared/types";
import { StudentNameCard } from "./shared/StudentNameCard";
import { StudentFeesPaymentModal } from "./shared/StudentFeesPaymentModal";
import { StudentSearchFilterBar } from "./shared/StudentSearchFilterBar";
import {
  buildPlaceholderById,
  buildPlaceholderDetail,
  computeUpdatedFeeAfterDelete,
  normalizeStudentOption,
  patchBreakdownAfterDeletePayment,
  patchBreakdownAfterPayment,
  patchDetailAfterDelete,
  patchDetailAfterPayment,
  patchDetailShell,
} from "./shared/studentDetailHelpers";

function StudentDetailsPageContent() {
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
        const classesRes = await fetch("/api/class/list", { credentials: "include" });
        if (!cancelled && classesRes.ok) {
          const c = await classesRes.json();
          setClasses(c.classes ?? []);
        }

        if (studentIdFromUrl) {
          setListLoading(false);
          return;
        }

        if (!cancelled) setListLoading(false);
      } catch {
        if (!cancelled && !cached?.length) setStudents([]);
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentIdFromUrl, mapListRow]);

  // Deep link (?studentId=…): follow the URL when it changes. Do NOT depend on `students` here — that
  // was resetting selection back to the URL id on every list refresh and overwrote the student's dropdown pick.
  useEffect(() => {
    if (studentIdFromUrl) {
      setSelectedId(studentIdFromUrl);
    }
  }, [studentIdFromUrl]);

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
  }, [studentIdFromUrl, mapListRow]);

  useEffect(() => {
    if (studentIdFromUrl) return;
    if (students.length === 0) return;
    setSelectedId((prev) => (prev && students.some((s) => s.id === prev) ? prev : students[0].id));
  }, [students, studentIdFromUrl]);

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

  const applyDetailsBundle = useCallback(
    (bundle: Awaited<ReturnType<typeof loadStudentDetailsBundle>>) => {
      const { feeBreakdown: breakdown, ...rest } = bundle;
      if (rest?.student) {
        const payments = (rest.payments ?? []).filter(
          (p) => !deletedPaymentIdsRef.current.has(p.id)
        );
        const shell =
          breakdown && rest.fee
            ? {
                ...rest,
                payments,
                fee: {
                  ...rest.fee,
                  // Breakdown is current-year source of truth. Do not Math.max with shell
                  // amountPaid — shell includes previous-year payments and inflates "paid".
                  amountPaid: Number(breakdown.amountPaid) || 0,
                  remainingFee: Number(breakdown.remainingFee) || 0,
                  totalFee: breakdown.totalAmount ?? rest.fee.totalFee,
                },
              }
            : { ...rest, payments };
        setDetail(shell);
        setFeeBreakdown(breakdown ?? null);
        if (breakdown && rest.student.id) setFeeBreakdownCache(rest.student.id, breakdown);
        setTransactionsReady(true);
      } else {
        setDetail(null);
        setFeeBreakdown(null);
        setTransactionsReady(false);
      }
    },
    []
  );

  const refreshFeesForStudent = useCallback(
    async (studentId: string, paymentResult?: FeePaymentSuccess) => {
      if (paymentResult) {
        setTransactionsReady(true);
        setDetail((prev) => {
          const next = patchDetailAfterPayment(prev, paymentResult);
          if (next?.student.id === studentId) {
            void refreshStudentFeesAfterMutation(studentId, {
              keepShell: next as unknown as StudentDetailsTabPayload,
              keepPatchedBreakdown: true,
              optimisticPendingId: paymentResult.payment.id.startsWith("pending-")
                ? paymentResult.payment.id
                : undefined,
              onPartial: (partial) => {
                if (partial.student?.id === studentId) applyDetailsBundle(partial);
              },
            });
          }
          return next;
        });
        setFeeBreakdown((prev) => {
          const next = patchBreakdownAfterPayment(prev, paymentResult) ?? prev;
          if (next) setFeeBreakdownCache(studentId, next);
          return next;
        });
        return;
      }

      const bundle = await refreshStudentFeesAfterMutation(studentId, {
        onPartial: (partial) => {
          if (partial.student?.id === studentId) applyDetailsBundle(partial);
        },
      });
      if (bundle?.student?.id === studentId) {
        applyDetailsBundle(bundle);
      }
    },
    [applyDetailsBundle]
  );

  const removePaymentForStudent = useCallback(
    (studentId: string, deleteResult: FeeDeleteSuccess) => {
      deletedPaymentIdsRef.current.add(deleteResult.paymentId);
      invalidateStudentDetailsBundleCache(studentId);
      invalidateFeeBreakdownCache(studentId);

      setDetail((prev) => {
        const deletedPayment = prev?.payments.find((p) => p.id === deleteResult.paymentId);
        const updatedFee =
          deleteResult.updatedFee ??
          (prev && deletedPayment ? computeUpdatedFeeAfterDelete(prev, deletedPayment) : null);
        const fullResult: FeeDeleteSuccess = {
          ...deleteResult,
          updatedFee,
          feeAllocations:
            deleteResult.feeAllocations ??
            (deletedPayment as { feeAllocations?: FeeDeleteSuccess["feeAllocations"] })
              ?.feeAllocations,
        };
        const next = patchDetailAfterDelete(prev, fullResult);
        setFeeBreakdown((bdPrev) => {
          if (!fullResult.updatedFee) return bdPrev;
          const nextBd = patchBreakdownAfterDeletePayment(
            bdPrev,
            fullResult.updatedFee,
            fullResult.feeAllocations
          );
          if (nextBd) setFeeBreakdownCache(studentId, nextBd);
          return nextBd ?? bdPrev;
        });
        return next;
      });

      void fetchFeeBreakdownFast(studentId, { force: true }).then((bd) => {
        if (!bd) return;
        setFeeBreakdown(bd);
        setFeeBreakdownCache(studentId, bd);
      });
    },
    []
  );

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

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 w-full min-h-0 min-w-0 overflow-x-hidden pb-6 sm:pb-8">
      <PageHeader
        compact
        title="Student Details"
        subtitle="Search, view records, and manage fees."
        rightSlot={
          <div className="w-full sm:w-auto flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setBulkExtraFeeOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              Bulk extra fees (Excel)
            </button>
            <div className="bg-[#0F172A]/40 border border-white/10 px-3 py-2 sm:px-4 rounded-xl text-xs sm:text-sm text-gray-200 whitespace-nowrap text-center">
              {new Date().getFullYear() - 1}-{new Date().getFullYear() + 1}
            </div>
          </div>
        }
      />
      <BulkExtraFeeByTimellyModal
        open={bulkExtraFeeOpen}
        onClose={() => setBulkExtraFeeOpen(false)}
        onApplied={() => setReloadKey((k) => k + 1)}
      />
      <StudentSearchFilterBar
        students={students}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectStudent={selectStudent}
        selectedId={selectedId}
        onSelectedIdChange={changeSelectedId}
        filterClass={filterClass}
        onFilterClassChange={setFilterClass}
        filterSection={filterSection}
        onFilterSectionChange={setFilterSection}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        statusOptions={statusOptions}
        classOptions={classOptions}
        sectionOptions={sectionOptions}
        studentSelectOptions={studentSelectOptions}
      />

      {listLoading && students.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">Loading student list…</div>
      )}

      {detail && (
        <>
          {showStickyStudentName && pageStudentName ? (
            <div className="hidden xl:block fixed z-30 left-64 top-[5.5rem] w-[280px] 2xl:w-[300px] px-2 pointer-events-none">
              <StudentNameCard
                name={pageStudentName}
                meta={pageStudentMeta}
                className="pointer-events-auto bg-[#0a0f1a]/95 backdrop-blur-md shadow-lg border-white/15"
              />
            </div>
          ) : null}

          {showStickyStudentName && pageStudentName ? (
            <div className="xl:hidden sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-2 mb-2 bg-[#070b14]/95 backdrop-blur-md border-b border-white/10">
              <StudentNameCard name={pageStudentName} meta={pageStudentMeta} className="bg-transparent border-0 px-0 py-0" />
            </div>
          ) : null}

        <div className="min-w-0 w-full">
          {isSelectedInactive ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <span className="font-semibold text-red-100">Inactive student.</span>{" "}
              This student is inactive — you cannot record new fees, mark attendance, or use the student portal until they are set back to Active. Existing payments and transaction history are unchanged.
            </div>
          ) : null}

          <div className="flex flex-col xl:flex-row xl:flex-wrap gap-4 sm:gap-6 md:gap-8 min-w-0 w-full items-start">
            <aside
              ref={sidebarAsideRef}
              className="w-full xl:w-[280px] 2xl:w-[300px] shrink-0 min-w-0 relative z-10 xl:sticky xl:top-[5.5rem] xl:self-start"
            >
            <ProfileSidebar
              studentId={detail.student.id}
              feesRecordingDisabled={isSelectedInactive}
              student={{
                name: detail.student.name,
                id: detail.student.admissionNumber,
                className: detail.student.class?.displayName ?? "-",
                rollNo: detail.student.rollNo,
                age: String(detail.student.age ?? "-"),
                dob: detail.student.dob || "",
                email: detail.student.email,
                phone: detail.student.phone,
                address: detail.student.address || "—",
                photoUrl: detail.student.photoUrl ?? undefined,
              }}
              fatherName={detail.student.fatherName}
              fatherPhone={detail.student.fatherPhone}
              motherName={detail.student.motherName}
              motherPhone={detail.student.motherPhone}
              classId={detail.student.class?.id ?? null}
              classes={classes.map((c) => ({
                id: c.id,
                label: `${c.name}${c.section ? ` - ${c.section}` : ""}`,
              }))}
              gender={detail.student.gender ?? ""}
              residencyType={detail.student.residencyType ?? "Day Scholar"}
              onSaved={(patch) => {
                if (patch) {
                  const sid = detail.student.id;
                  invalidateStudentDetailsBundleCache(sid);
                  clearStudentListCache();
                  if (patch.name !== undefined) {
                    setStudents((prev) => {
                      const next = prev.map((s) =>
                        s.id === sid ? { ...s, name: patch.name! } : s
                      );
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
              }}
              onOpenFees={() => {
                if (isSelectedInactive) return;
                warmFeeBreakdown();
                setFeesModalOpen(true);
              }}
              onFeesHover={warmFeeBreakdown}
            />
            </aside>

            <div className="flex-1 min-w-0 w-full xl:basis-[calc(100%-300px-2rem)] 2xl:basis-[calc(100%-320px-2rem)] space-y-4 sm:space-y-6 md:space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 bg-lime-400/10 rounded-xl flex-shrink-0">
                  <Calendar className="w-5 h-5 sm:w-5 sm:h-5 text-lime-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-gray-500">Attendance</p>
                  <p className="text-base sm:text-lg font-bold text-white truncate">
                    {detail.attendanceTrends.length
                      ? `${Math.round(detail.attendanceTrends.reduce((a, t) => a + t.pct, 0) / detail.attendanceTrends.length)}%`
                      : "-"}
                  </p>
                  <p className="text-[10px] text-lime-400">Avg this year</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 text-white rounded-xl flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg Grade</p>
                  <p className="text-lg font-bold text-white">
                    {detail.academicPerformance.length ? "A" : "-"}
                  </p>
                  <p className="text-[10px] text-blue-400">Academic Rank: —</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 bg-pink-400/10 rounded-xl flex-shrink-0">
                  <Activity className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Behavior</p>
                  <p className="text-lg font-bold text-pink-400">—</p>
                  <p className="text-[10px] text-pink-400">—</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 bg-amber-400/10 rounded-xl flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fees Due</p>
                  <p className="text-lg font-bold text-lime-400">
                    {(() => {
                      const due =
                        feeBreakdown?.remainingFee ?? detail.fee?.remainingFee ?? 0;
                      return due > 0 ? `₹${due.toLocaleString()}` : "₹0";
                    })()}
                  </p>
                  <p className="text-[10px] text-lime-400">
                    {(feeBreakdown?.remainingFee ?? detail.fee?.remainingFee ?? 0) <= 0
                      ? "All Cleared"
                      : "Pending"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
              <AcademicPerformance data={detail.academicPerformance} />
              <AttendanceTrends data={detail.attendanceTrends} />
            </div>
            </div>

            <div className="w-full min-w-0 basis-full space-y-4 sm:space-y-6 md:space-y-8 relative z-0">
            {detail.fee ? (
              <FeesBreakdown
                studentId={detail.student.id}
                classId={detail.student.class?.id ?? null}
                feesRecordingDisabled={isSelectedInactive}
                totalFee={feeBreakdown?.totalAmount ?? detail.fee.totalFee}
                baseTotalFee={
                  feeBreakdown?.dueHeads?.length
                    ? Math.round(
                        feeBreakdown.dueHeads.reduce((s, h) => s + (Number(h.grossAmount) || 0), 0)
                      )
                    : detail.fee.baseTotalFee
                }
                discountPercent={detail.fee.discountPercent}
                amountPaid={feeBreakdown?.amountPaid ?? detail.fee.amountPaid}
                remainingFee={feeBreakdown?.remainingFee ?? detail.fee.remainingFee}
                payments={detail.payments}
                studentName={detail.student.name}
                admissionNumber={detail.student.admissionNumber}
                classDisplayName={detail.student.class?.displayName ?? "-"}
                classSection={detail.student.class?.section ?? null}
                schoolName={detail.student.schoolName}
                discountFeeHeadKey={detail.fee.discountFeeHeadKey}
                discountFeeHeadLabel={detail.fee.discountFeeHeadLabel}
                discountRemarks={detail.fee.discountRemarks}
                discountFixedAmount={detail.fee.discountFixedAmount}
                latestDiscountApproval={detail.fee.discountApprovals?.[0] ?? null}
                discountApprovals={detail.fee.discountApprovals ?? []}
                onFeeModified={(paymentResult) => {
                  if (paymentResult?.payment.id) setAutoPrintPaymentId(paymentResult.payment.id);
                  if (detail.student.id) void refreshFeesForStudent(detail.student.id, paymentResult);
                }}
                residencyType={detail.student.residencyType ?? null}
                initialFeeBreakdown={feeBreakdown}
                feeBreakdownPending={feeBreakdownPending}
              />
            ) : null}

            <FeeTransactions
              fee={detail.fee}
              feeBreakdown={feeBreakdown}
              payments={detail.payments}
              transactionsLoading={!transactionsReady}
              applicationFee={detail.student.applicationFee}
              admissionFee={detail.student.admissionFee}
              studentCreatedAt={detail.student.createdAt}
              studentName={detail.student.name}
              studentId={detail.student.id}
              admissionNumber={detail.student.admissionNumber}
              classDisplayName={detail.student.class?.displayName ?? "-"}
              residencyType={detail.student.residencyType ?? "Day Scholar"}
              parentName={detail.student.fatherName?.trim() || "-"}
              motherName={detail.student.motherName?.trim() || "-"}
              parentPhone={
                detail.student.fatherPhone?.trim() ||
                detail.student.phone?.trim() ||
                "-"
              }
              feesRecordingDisabled={isSelectedInactive}
              autoPrintPaymentId={autoPrintPaymentId}
              onAutoPrintDone={() => setAutoPrintPaymentId(null)}
              onPaymentsChanged={() => {
                if (detail.student.id) void refreshFeesForStudent(detail.student.id);
              }}
              onPaymentDeleted={(result) => {
                if (detail.student.id) removePaymentForStudent(detail.student.id, result);
              }}
            />

            <Certificates certificates={detail.certificates} />
            </div>
          </div>
        </div>
        </>
      )}

      {!detail && selectedId && !listLoading && (
        <div className="text-center py-12 text-gray-400">Student not found.</div>
      )}

      {feesModalOpen && detail && !isSelectedInactive ? (
        <StudentFeesPaymentModal
          studentId={detail.student.id}
          studentName={detail.student.name}
          initialFeeBreakdown={feeBreakdown ?? getFeeBreakdownCached(detail.student.id)}
          breakdownPending={feeBreakdownPending}
          onClose={() => setFeesModalOpen(false)}
          onSuccess={(result) => {
            setFeesModalOpen(false);
            if (result.payment.id) setAutoPrintPaymentId(result.payment.id);
            void refreshFeesForStudent(detail.student.id, result);
          }}
          onPaymentFailed={(message) => {
            alert(message);
            void refreshFeesForStudent(detail.student.id);
          }}
        />
      ) : null}

      {!detail && !selectedId && !listLoading && students.length === 0 && (
        <div className="text-center py-12 text-gray-400">No students found.</div>
      )}
    </div>
  );
}

export default function StudentDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-white/70">
          <Spinner />
        </div>
      }
    >
      <StudentDetailsPageContent />
    </Suspense>
  );
}
