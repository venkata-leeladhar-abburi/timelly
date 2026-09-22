"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { IndianRupee, Users, Star, Award } from "lucide-react";

import TimellyLoader from "../common/TimellyLoader";
import AnalysisSectionNav from "./AnalysisSectionNav";
import FeesComparisonPanel from "./analysis/fees-comparison/FeesComparisonPanel";
import StudentCredentialsPanel from "./analysis/student-credentials/StudentCredentialsPanel";
import {
  defaultAnalysisStartYear,
  fetchSchoolAnalysisFast,
  fetchSchoolAnalysisTables,
  peekSchoolAnalysis,
  peekSchoolAnalysisAny,
  type AnalysisSection,
} from "@/lib/school/loadSchoolAnalysis";
import {
  analysisCacheKey,
  setSchoolAnalysisCached,
} from "@/lib/school/schoolAnalysisClientCache";
export type { AnalysisSection };

import type {
  AnalysisDashboardProps,
  AnalysisResponse,
  EnrollmentGroupRow,
  EnrollmentSectionRow,
  GenderViewMode,
} from "./analysis-shared/types";
import { sectionHasTables, sectionNeedsTables } from "./analysis-shared/sectionHelpers";
import { AnalysisFilterHeader } from "./analysis-shared/AnalysisFilterHeader";
import { AnalysisOverviewSection } from "./analysis-shared/AnalysisOverviewSection";
import { GenderEnrollmentSection } from "./analysis-shared/GenderEnrollmentSection";
import { AdmissionComparisonSection } from "./analysis-shared/AdmissionComparisonSection";
import { FeeCollectionSection } from "./analysis-shared/FeeCollectionSection";

/* ---------------- Component ---------------- */

export default function AnalysisDashboard({ section = "overview" }: AnalysisDashboardProps) {
  const defaultYear = defaultAnalysisStartYear();
  const initialCached = peekSchoolAnalysisAny(defaultYear);
  const [data, setData] = useState<AnalysisResponse | null>(initialCached);
  const [shellLoading, setShellLoading] = useState(() => !initialCached?.stats);
  const [tablesLoading, setTablesLoading] = useState(
    () => sectionNeedsTables(section) && !sectionHasTables(section, initialCached)
  );
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number>(() => initialCached?.selectedYear ?? defaultYear);
  const [classId, setClassId] = useState("");
  const { data: session, status: sessionStatus } = useSession();
  const schoolId = session?.user?.schoolId ?? null;
  const fetchAbortRef = useRef<AbortController | null>(null);
  const [genderViewMode, setGenderViewMode] = useState<GenderViewMode>("CLASS_WISE");
  const [enrollmentSearch, setEnrollmentSearch] = useState("");
  const [enrollmentGroupFilter, setEnrollmentGroupFilter] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  const [feeClassSectionFilter, setFeeClassSectionFilter] = useState("");

  useEffect(() => {
    if (section === "student-credentials" || section === "fees-comparison") return;
    if (sessionStatus !== "authenticated") return;

    const sid = schoolId;
    const cached =
      (sid ? peekSchoolAnalysis(sid, year, classId) : null) ??
      peekSchoolAnalysisAny(year, classId);

    let shellReady = Boolean(cached?.stats);
    if (cached) {
      setData(cached);
      setError(null);
      setShellLoading(false);
      setTablesLoading(sectionNeedsTables(section) && !sectionHasTables(section, cached));
    }

    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    (async () => {
      try {
        if (sectionNeedsTables(section) && !sectionHasTables(section, cached)) {
          setTablesLoading(true);
          const tables = await fetchSchoolAnalysisTables(year, {
            schoolId: sid,
            classId,
            section,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setData((prev) => ({ ...(prev ?? {}), ...tables } as AnalysisResponse));
          setTablesLoading(false);
          setShellLoading(false);
          setError(null);

          if (!shellReady) {
            void fetchSchoolAnalysisFast(year, {
              schoolId: sid,
              classId,
            })
              .then((fast) => {
                if (controller.signal.aborted) return;
                setData((prev) => ({ ...(prev ?? {}), ...fast } as AnalysisResponse));
              })
              .catch(() => {});
          }
          return;
        }

        if (!shellReady) {
          const fast = await fetchSchoolAnalysisFast(year, {
            schoolId: sid,
            classId,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          shellReady = true;
          setData((prev) => ({ ...(prev ?? {}), ...fast } as AnalysisResponse));
          setShellLoading(false);
          setError(null);

          if (sectionNeedsTables(section) && !sectionHasTables(section, fast)) {
            setTablesLoading(true);
            const tables = await fetchSchoolAnalysisTables(year, {
              schoolId: sid,
              classId,
              section,
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setData((prev) => ({ ...(prev ?? {}), ...tables } as AnalysisResponse));
            setTablesLoading(false);
            return;
          }
        }

        if (!sectionHasTables(section, cached)) {
          void fetchSchoolAnalysisTables(year, {
            schoolId: sid,
            classId,
            section: sectionNeedsTables(section) ? section : undefined,
          })
            .then((tables) => {
              if (controller.signal.aborted) return;
              setData((prev) => ({ ...(prev ?? {}), ...tables } as AnalysisResponse));
              setTablesLoading(false);
            })
            .catch(() => {});
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Analysis fetch error:", err);
        if (!shellReady) {
          setError(err instanceof Error ? err.message : "Failed to load analysis");
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setShellLoading(false);
      }
    })();

    return () => controller.abort();
  }, [sessionStatus, schoolId, year, classId, section]);

  useEffect(() => {
    if (!schoolId || !data) return;
    setSchoolAnalysisCached(analysisCacheKey(schoolId, year, classId), data);
  }, [schoolId, data, year, classId]);

  if (section === "fees-comparison") {
    return <FeesComparisonPanel />;
  }

  if (section === "student-credentials") {
    return (
      <div className="p-4 sm:p-6 text-white">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:mb-5 sm:rounded-2xl sm:p-5"
        >
          <div className="mb-2 border-b border-white/10 pb-2 sm:mb-4 sm:pb-4">
            <p className="text-sm font-semibold tracking-tight text-white sm:text-base">
              Analysis
            </p>
            <p className="mt-0.5 text-xs text-white/55 sm:text-sm">
              Share login details with students by class and section.
            </p>
          </div>
          <AnalysisSectionNav embedded />
        </motion.div>
        <StudentCredentialsPanel />
      </div>
    );
  }

  if ((sessionStatus === "loading" || shellLoading || (!error && !data)) && !data) {
    return (
      <div className="p-4 sm:p-6 text-white">
        <TimellyLoader
          title="Loading analysis"
          steps={["School data", "Student strength", "Insights"]}
          compact
        />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 text-white">
        <p className="text-red-400">{error ?? "No data available"}</p>
      </div>
    );
  }

  /* ---------------- UI-ready Data ---------------- */

  const selectedYear = data.selectedYear ?? year ?? defaultYear;
  const availableYears =
    data.availableYears && data.availableYears.length > 0 ? data.availableYears : [selectedYear];
  const statsSource = data.stats ?? {
    feesCollected: 0,
    totalEnrollment: 0,
    avgTeacherRating: 0,
    avgExamScore: 0,
  };

  const stats = [
    {
      title: "Fees Collected",
      value: statsSource.feesCollected >= 100000
        ? `₹${(statsSource.feesCollected / 100000).toFixed(1)}L`
        : `₹${statsSource.feesCollected.toLocaleString()}`,
      change: "vs last month",
      icon: IndianRupee,
      iconColor: "text-lime-400",
      iconBorder: "border-lime-400/30",
      iconBg: "bg-lime-400/10",
      changeColor: "text-lime-400",
    },
    {
      title: "Total Enrollment",
      value: statsSource.totalEnrollment.toLocaleString(),
      change: "New admissions",
      icon: Users,
      iconColor: "text-sky-400",
      iconBorder: "border-sky-400/30",
      iconBg: "bg-sky-400/10",
      changeColor: "text-sky-400",
    },
    {
      title: "Avg Teacher Rating",
      value:
        statsSource.avgTeacherRating > 0
          ? `${statsSource.avgTeacherRating} / 5`
          : "—",
      change: "Based on student feedback",
      icon: Star,
      iconColor: "text-purple-300",
      iconBorder: "border-purple-300/30",
      iconBg: "bg-purple-300/10",
      changeColor: "text-purple-300",
    },
    {
      title: "Avg Exam Score",
      value: `${statsSource.avgExamScore}%`,
      change: "vs last year",
      icon: Award,
      iconColor: "text-yellow-400",
      iconBorder: "border-yellow-400/30",
      iconBg: "bg-yellow-400/10",
      changeColor: "text-yellow-400",
    },
  ];
  const axisStyle = {
    stroke: "rgba(255,255,255,0.45)",
    fontSize: 11,
  };

  const feesData = (data.charts?.monthlyFeesCollection ?? []).map((f) => ({
    month: f.month,
    value: f.amount,
  }));

  const enrollmentData = (data.charts?.enrollmentGrowth ?? []).map((e) => ({
    year: e.year.toString(),
    students: e.count,
  }));

  const attendance = data.charts?.attendance ?? { students: 0, teachers: 0 };
  const attendanceData = [
    {
      day: "Avg",
      students: attendance.students,
      teachers: attendance.teachers,
    },
  ];

  const subjectData = (data.charts?.subjectPerformance ?? []).map((s) => ({
    subject: s.subject,
    score: s.percentage,
  }));

  // All teachers sorted best to least (API returns already sorted)
  const topTeachers = data.topTeachers ?? [];
  const feeRows = Array.isArray(data.feeCollectionByClass) ? data.feeCollectionByClass : [];
  const feeTotals = data.feeCollectionTotals;
  const enrollmentRows = Array.isArray(data.enrollmentByClassSection)
    ? data.enrollmentByClassSection
    : [];
  const enrollmentTotals = data.enrollmentByClassSectionTotals;
  const admissionComparisonRows = Array.isArray(data.admissionComparison) ? data.admissionComparison : [];
  const admissionComparisonTotals = data.admissionComparisonTotals;

  const formatInr = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
  const getAcademicYearLabel = () => {
    const y = year !== 0 ? year : selectedYear;
    return `${y}-${y + 1}`;
  };

  const makeSafeFileName = (base: string, ext: string) =>
    `${base.replace(/[^\w-]+/g, "_").toLowerCase()}.${ext}`;

  const exportWithXlsx = async (
    rows: Array<Record<string, string | number>>,
    sheetName: string,
    filenameBase: string
  ) => {
    if (rows.length === 0) {
      alert("No data available to export.");
      return;
    }
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    XLSX.writeFile(workbook, makeSafeFileName(filenameBase, "xlsx"));
  };
  const enrollmentClassWiseRows: EnrollmentGroupRow[] = Array.from(
    enrollmentRows.reduce((acc, row) => {
      const key = row.className || "Unassigned";
      const item = acc.get(key) ?? { groupLabel: key, male: 0, female: 0, total: 0 };
      item.male += row.male;
      item.female += row.female;
      item.total += row.total;
      acc.set(key, item);
      return acc;
    }, new Map<string, EnrollmentGroupRow>())
  ).map(([, value]) => value).sort((a, b) => a.groupLabel.localeCompare(b.groupLabel, undefined, { numeric: true }));

  const enrollmentSectionWiseRows: EnrollmentSectionRow[] = enrollmentRows
    .map((row) => {
      const className = row.className?.trim() || "Unassigned";
      const section =
        row.section && row.section.trim() !== "" ? row.section.trim() : "Unassigned";
      return {
        groupLabel: `${className} - ${section}`,
        className,
        section,
        male: row.male,
        female: row.female,
        total: row.total,
      };
    })
    .sort((a, b) => {
      const byClass = a.className.localeCompare(b.className, undefined, { numeric: true });
      if (byClass !== 0) return byClass;
      return a.section.localeCompare(b.section, undefined, { numeric: true });
    });

  const enrollmentRowsBase =
    genderViewMode === "CLASS_WISE" ? enrollmentClassWiseRows : enrollmentSectionWiseRows;
  const enrollmentGroupOptions = enrollmentRowsBase.map((row) => row.groupLabel);

  const feeClassSectionOptions = Array.from(new Set(feeRows.map((row) => row.label))).sort((a, b) =>
    a.localeCompare(b)
  );

  const enrollmentRowsFiltered = enrollmentRowsBase.filter((row) => {
    const search = enrollmentSearch.trim().toLowerCase();
    const sectionRow = row as EnrollmentSectionRow;
    const matchesSearch =
      !search ||
      row.groupLabel.toLowerCase().includes(search) ||
      (genderViewMode === "SECTION_WISE" &&
        (sectionRow.className.toLowerCase().includes(search) ||
          sectionRow.section.toLowerCase().includes(search)));
    const matchesGroup = !enrollmentGroupFilter || row.groupLabel === enrollmentGroupFilter;
    return matchesSearch && matchesGroup;
  });

  const feeRowsFiltered = feeRows.filter((row) => {
    const search = feeSearch.trim().toLowerCase();
    const matchesSearch = !search || row.label.toLowerCase().includes(search);
    const matchesClassSection = !feeClassSectionFilter || row.label === feeClassSectionFilter;
    return matchesSearch && matchesClassSection;
  });

  const enrollmentFilteredTotals =
    enrollmentRowsFiltered.length > 0
      ? enrollmentRowsFiltered.reduce(
          (acc, row) => ({
            male: acc.male + row.male,
            female: acc.female + row.female,
            total: acc.total + row.total,
          }),
          { male: 0, female: 0, total: 0 }
        )
      : null;

  const feeFilteredTotals =
    feeRowsFiltered.length > 0
      ? feeRowsFiltered.reduce(
          (acc, row) => ({
            totalFees: acc.totalFees + row.totalFees,
            finalFees: acc.finalFees + row.finalFees,
            paidFee: acc.paidFee + row.paidFee,
            pendingFee: acc.pendingFee + row.pendingFee,
          }),
          { totalFees: 0, finalFees: 0, paidFee: 0, pendingFee: 0 }
        )
      : null;

  const feeFilteredAvgDiscountPercent =
    feeRowsFiltered.length > 0
      ? Number(
          (
            feeRowsFiltered.reduce((acc, row) => acc + row.avgDiscountPercent, 0) /
            feeRowsFiltered.length
          ).toFixed(2)
        )
      : 0;

  const feeFilteredCollectionPercent =
    feeFilteredTotals && feeFilteredTotals.finalFees > 0
      ? Number(((feeFilteredTotals.paidFee / feeFilteredTotals.finalFees) * 100).toFixed(2))
      : 0;

  const feeFilteredDuePercent =
    feeFilteredTotals && feeFilteredTotals.finalFees > 0
      ? Number(((feeFilteredTotals.pendingFee / feeFilteredTotals.finalFees) * 100).toFixed(2))
      : 0;

  const toGenderExportRow = (
    row: EnrollmentGroupRow | EnrollmentSectionRow,
    mode: GenderViewMode
  ): Record<string, string | number> =>
    mode === "CLASS_WISE"
      ? {
          Class: row.groupLabel,
          Male: row.male,
          Female: row.female,
          Total: row.total,
        }
      : {
          Class: (row as EnrollmentSectionRow).className,
          Section: (row as EnrollmentSectionRow).section,
          Male: row.male,
          Female: row.female,
          Total: row.total,
        };

  const enrollmentExportRows = enrollmentRowsFiltered.map((row) =>
    toGenderExportRow(row, genderViewMode)
  );

  const exportGenderExcel = async (mode: GenderViewMode) => {
    const rows = mode === "CLASS_WISE" ? enrollmentClassWiseRows : enrollmentSectionWiseRows;
    const exportRows = rows.map((row) => toGenderExportRow(row, mode));
    const fileSuffix = mode === "CLASS_WISE" ? "class_wise" : "section_wise";
    try {
      await exportWithXlsx(
        exportRows,
        mode === "CLASS_WISE" ? "Gender Class-wise" : "Gender Section-wise",
        `gender_distribution_${fileSuffix}_${getAcademicYearLabel()}`
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  const exportAdmissionComparisonExcel = async () => {
    if (admissionComparisonRows.length === 0) {
      alert("No data available to export.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const title = `COMPARISON REPORT OF NEW ADMISSION ${getAcademicYearLabel()}`;
      const aoa: Array<Array<string | number>> = [
        [title, "", "", "", "", "", "", "", ""],
        ["CLASS", "EXISTING", "", "", "", "NEW", "", "", ""],
        ["", "DAY SCHOLAR", "", "HOSTEL", "", "DAY SCHOLAR", "", "HOSTEL", ""],
        ["", "MALE", "FEMALE", "MALE", "FEMALE", "MALE", "FEMALE", "MALE", "FEMALE"],
      ];

      for (const row of admissionComparisonRows) {
        aoa.push([
          row.classLabel,
          row.existingDayScholarMale,
          row.existingDayScholarFemale,
          row.existingHostelMale,
          row.existingHostelFemale,
          row.newDayScholarMale,
          row.newDayScholarFemale,
          row.newHostelMale,
          row.newHostelFemale,
        ]);
      }

      if (admissionComparisonTotals) {
        aoa.push([
          "TOTAL",
          admissionComparisonTotals.existingDayScholarMale,
          admissionComparisonTotals.existingDayScholarFemale,
          admissionComparisonTotals.existingHostelMale,
          admissionComparisonTotals.existingHostelFemale,
          admissionComparisonTotals.newDayScholarMale,
          admissionComparisonTotals.newDayScholarFemale,
          admissionComparisonTotals.newHostelMale,
          admissionComparisonTotals.newHostelFemale,
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // title
        { s: { r: 1, c: 1 }, e: { r: 1, c: 4 } }, // existing
        { s: { r: 1, c: 5 }, e: { r: 1, c: 8 } }, // new
        { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } }, // existing day scholar
        { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } }, // existing hostel
        { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } }, // new day scholar
        { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } }, // new hostel
      ];
      ws["!cols"] = [
        { wch: 22 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Comparison report");
      XLSX.writeFile(
        wb,
        makeSafeFileName(`new_admission_comparison_table_view_${getAcademicYearLabel()}`, "xlsx")
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  const exportPaymentDetailsExcel = async () => {
    try {
      const [txRes, summaryRes] = await Promise.all([
        fetch("/api/fees/transactions?limit=200", { credentials: "include", cache: "no-store" }),
        fetch("/api/fees/summary", { credentials: "include", cache: "no-store" }),
      ]);
      const txData = await txRes.json().catch(() => ({}));
      const summaryData = await summaryRes.json().catch(() => ({}));
      if (!txRes.ok) {
        alert(txData?.message || "Failed to fetch payment transactions.");
        return;
      }

      const transactions: Array<{
        amount: number;
        createdAt: string;
        transactionId?: string | null;
        feeAllocations?: Array<{ name: string; amount: number }>;
        student: {
          id: string;
          admissionNumber?: string | null;
          user?: { name?: string | null };
          class?: { name?: string | null; section?: string | null } | null;
        };
      }> = Array.isArray(txData?.transactions) ? txData.transactions : [];

      const summaryFees: Array<{
        student: { id: string };
        totalFee: number;
        finalFee: number;
        amountPaid: number;
        remainingFee: number;
      }> = Array.isArray(summaryData?.fees) ? summaryData.fees : [];

      const studentTotals = summaryFees.reduce((acc, fee) => {
        const id = fee.student?.id;
        if (!id) return acc;
        const curr = acc.get(id) ?? { totalAmount: 0, discount: 0, paidAmount: 0, pendingAmount: 0 };
        curr.totalAmount += Number(fee.totalFee || 0);
        curr.discount += Math.max(Number(fee.totalFee || 0) - Number(fee.finalFee || 0), 0);
        curr.paidAmount += Number(fee.amountPaid || 0);
        curr.pendingAmount += Number(fee.remainingFee || 0);
        acc.set(id, curr);
        return acc;
      }, new Map<string, { totalAmount: number; discount: number; paidAmount: number; pendingAmount: number }>());

      const yearStart = year !== 0 ? year : selectedYear;
      const from = new Date(yearStart, 3, 1);
      const to = new Date(yearStart + 1, 2, 31, 23, 59, 59, 999);

      const filteredTx = transactions.filter((tx) => {
        const created = new Date(tx.createdAt);
        if (Number.isNaN(created.getTime()) || created < from || created > to) return false;
        const className = tx.student.class?.name || "";
        const section = tx.student.class?.section || "";
        const label = `${className}${section ? `-${section}` : ""}`;
        if (classId && className !== ((data.classes ?? []).find((c) => c.id === classId)?.name ?? "")) return false;
        if (feeClassSectionFilter && feeClassSectionFilter !== label) return false;
        const search = feeSearch.trim().toLowerCase();
        if (search) {
          const studentName = (tx.student.user?.name || "").toLowerCase();
          const admission = (tx.student.admissionNumber || "").toLowerCase();
          if (!studentName.includes(search) && !admission.includes(search) && !label.toLowerCase().includes(search)) {
            return false;
          }
        }
        return true;
      });

      const rows = filteredTx.map((tx) => {
        const totals = studentTotals.get(tx.student.id) ?? {
          totalAmount: tx.amount,
          discount: 0,
          paidAmount: tx.amount,
          pendingAmount: 0,
        };
        const feeHeadBreakdown =
          Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0
            ? tx.feeAllocations.map((f) => `${f.name}: ₹${Number(f.amount || 0).toLocaleString("en-IN")}`).join(" | ")
            : "Default";
        return {
          "Date of Payment": new Date(tx.createdAt).toLocaleDateString("en-IN"),
          "Student Name": tx.student.user?.name || "-",
          "Admission No": tx.student.admissionNumber || "-",
          Class: tx.student.class?.name || "-",
          Section: tx.student.class?.section || "-",
          "Fee Head Breakdown": feeHeadBreakdown,
          "Total Amount": Number(totals.totalAmount.toFixed(2)),
          Discount: Number(totals.discount.toFixed(2)),
          "Paid Amount": Number(totals.paidAmount.toFixed(2)),
          "Pending Amount": Number(totals.pendingAmount.toFixed(2)),
          "Transaction Ref": tx.transactionId || "-",
        };
      });

      await exportWithXlsx(
        rows,
        "Payment Details",
        `payment_details_student_wise_${getAcademicYearLabel()}`
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="min-h-screen p-3 pb-6 text-white sm:p-4 md:p-5">
      <AnalysisFilterHeader
        classId={classId}
        onClassIdChange={setClassId}
        classes={data.classes ?? []}
        year={year}
        onYearChange={setYear}
        availableYears={availableYears}
      />

      {section === "overview" ? (
        <AnalysisOverviewSection
          shellLoading={shellLoading}
          stats={stats}
          axisStyle={axisStyle}
          feesData={feesData}
          enrollmentData={enrollmentData}
          attendanceData={attendanceData}
          subjectData={subjectData}
          topTeachers={topTeachers}
          selectedYear={selectedYear}
        />
      ) : null}

      {section === "gender-enrollment" ? (
        <GenderEnrollmentSection
          tablesLoading={tablesLoading}
          enrollmentSearch={enrollmentSearch}
          onEnrollmentSearchChange={setEnrollmentSearch}
          genderViewMode={genderViewMode}
          onGenderViewModeChange={setGenderViewMode}
          enrollmentGroupFilter={enrollmentGroupFilter}
          onEnrollmentGroupFilterChange={setEnrollmentGroupFilter}
          enrollmentGroupOptions={enrollmentGroupOptions}
          onExportClassWise={() => void exportGenderExcel("CLASS_WISE")}
          onExportSectionWise={() => void exportGenderExcel("SECTION_WISE")}
          enrollmentRowsFiltered={enrollmentRowsFiltered}
          enrollmentFilteredTotals={enrollmentFilteredTotals}
        />
      ) : null}

      {section === "admission-comparison" ? (
        <AdmissionComparisonSection
          tablesLoading={tablesLoading}
          onExport={() => void exportAdmissionComparisonExcel()}
          admissionComparisonRows={admissionComparisonRows}
          admissionComparisonTotals={admissionComparisonTotals}
        />
      ) : null}

      {section === "fee-collection" ? (
        <FeeCollectionSection
          tablesLoading={tablesLoading}
          feeSearch={feeSearch}
          onFeeSearchChange={setFeeSearch}
          feeClassSectionFilter={feeClassSectionFilter}
          onFeeClassSectionFilterChange={setFeeClassSectionFilter}
          feeClassSectionOptions={feeClassSectionOptions}
          onExport={() => void exportPaymentDetailsExcel()}
          feeRowsFiltered={feeRowsFiltered}
          formatInr={formatInr}
          feeFilteredTotals={feeFilteredTotals}
          feeFilteredAvgDiscountPercent={feeFilteredAvgDiscountPercent}
          feeFilteredCollectionPercent={feeFilteredCollectionPercent}
          feeFilteredDuePercent={feeFilteredDuePercent}
        />
      ) : null}
    </div>
  );
}
