import { useCallback, useEffect, type MutableRefObject } from "react";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { loadStudentDetailsBundle, peekStudentDetailsBundle } from "@/lib/students/loadStudentDetailsBundle";
import { getFeeBreakdownCached, fetchFeeBreakdownFast } from "@/lib/fees/feeBreakdownClientCache";
import { invalidateStudentDetailsBundleCache } from "@/lib/students/loadStudentDetailsBundle";
import type { StudentDetail, StudentOption } from "./types";
import { buildPlaceholderById, buildPlaceholderDetail, normalizeStudentOption, patchDetailShell } from "./studentDetailHelpers";

export function useStudentDetailBundleLoading({
  selectedId,
  selectedIdRef,
  students,
  setStudents,
  detail,
  setDetail,
  feeBreakdown,
  setFeeBreakdown,
  setFeeBreakdownPending,
  setTransactionsReady,
  reloadKey,
  applyDetailsBundle,
}: {
  selectedId: string | null;
  selectedIdRef: MutableRefObject<string | null>;
  students: StudentOption[];
  setStudents: React.Dispatch<React.SetStateAction<StudentOption[]>>;
  detail: StudentDetail | null;
  setDetail: React.Dispatch<React.SetStateAction<StudentDetail | null>>;
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
  setFeeBreakdown: React.Dispatch<React.SetStateAction<AdminStudentFeeBreakdownResult | null>>;
  setFeeBreakdownPending: React.Dispatch<React.SetStateAction<boolean>>;
  setTransactionsReady: React.Dispatch<React.SetStateAction<boolean>>;
  reloadKey: number;
  applyDetailsBundle: (bundle: Awaited<ReturnType<typeof loadStudentDetailsBundle>>) => void;
}) {
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
  }, [selectedId, feeBreakdown, detail?.fee?.amountPaid, setFeeBreakdown, setFeeBreakdownPending]);

  useEffect(() => {
    if (reloadKey === 0) return;
    const id = selectedIdRef.current;
    if (id) invalidateStudentDetailsBundleCache(id);
  }, [reloadKey, selectedIdRef]);

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

  return { warmFeeBreakdown };
}
