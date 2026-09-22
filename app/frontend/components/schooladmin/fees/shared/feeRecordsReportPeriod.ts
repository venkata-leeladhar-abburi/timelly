import type { DayReportTx } from "@/lib/fees/feeDayReportExcel";
import type { ReportPeriod } from "./feeRecordsTableTypes";

export const getReportPeriodLabel = (value: ReportPeriod) => {
  if (value === "DAY_WISE") return "Day Wise";
  if (value === "MONTH_WISE") return "Month Wise";
  if (value === "YEAR_WISE") return "Year Wise";
  return "Academic Year Wise";
};

export const getReportPeriodValue = ({
  reportPeriod,
  reportDate,
  reportMonth,
  reportYear,
  academicYear,
}: {
  reportPeriod: ReportPeriod;
  reportDate: string;
  reportMonth: string;
  reportYear: string;
  academicYear: string;
}) => {
  if (reportPeriod === "DAY_WISE") return reportDate || "-";
  if (reportPeriod === "MONTH_WISE") return reportMonth || "-";
  if (reportPeriod === "YEAR_WISE") return reportYear || "-";
  return academicYear || "-";
};

const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Parse `YYYY-MM-DD` as a local calendar date (avoids UTC off-by-one with `new Date("yyyy-mm-dd")`). */
const parseYmdLocal = (ymd: string) => {
  const parts = ymd.split("-").map((v) => Number(v));
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (!y || !m || !day) return new Date(NaN);
  return new Date(y, m - 1, day);
};

export type ReportPeriodState = {
  reportPeriod: ReportPeriod;
  reportDate: string;
  reportMonth: string;
  reportYear: string;
  academicYear: string;
};

const inSelectedPeriod = (createdAt: string, state: ReportPeriodState) => {
  const { reportPeriod, reportDate, reportMonth, reportYear, academicYear } = state;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  if (reportPeriod === "DAY_WISE") {
    const picked = parseYmdLocal(reportDate);
    if (Number.isNaN(picked.getTime())) return false;
    return toDateOnly(d).getTime() === toDateOnly(picked).getTime();
  }
  if (reportPeriod === "MONTH_WISE") {
    const [y, m] = reportMonth.split("-").map((v) => Number(v));
    if (!y || !m) return false;
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  }
  if (reportPeriod === "YEAR_WISE") {
    return d.getFullYear() === Number(reportYear);
  }
  const [start, end] = academicYear.split("-").map((v) => Number(v));
  if (!start || !end) return false;
  const startDate = new Date(start, 3, 1); // 1 Apr
  const endDate = new Date(end, 2, 31, 23, 59, 59, 999); // 31 Mar
  return d >= startDate && d <= endDate;
};

export const getReportDateRange = (state: ReportPeriodState): { from: string; to: string } => {
  const { reportPeriod, reportDate, reportMonth, reportYear, academicYear } = state;
  if (reportPeriod === "DAY_WISE") {
    return { from: reportDate, to: reportDate };
  }
  if (reportPeriod === "MONTH_WISE") {
    const [y, m] = reportMonth.split("-").map((v) => Number(v));
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${reportMonth}-01`,
      to: `${reportMonth}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  if (reportPeriod === "YEAR_WISE") {
    return { from: `${reportYear}-01-01`, to: `${reportYear}-12-31` };
  }
  const [start, end] = academicYear.split("-").map((v) => Number(v));
  return { from: `${start}-04-01`, to: `${end}-03-31` };
};

export const buildReportTxQueryParams = (state: ReportPeriodState) => {
  const { from, to } = getReportDateRange(state);
  return new URLSearchParams({
    limit: "10000",
    forFeeReport: "1",
    from,
    to,
  });
};

export const filterReportTransactions = (
  transactions: DayReportTx[],
  state: ReportPeriodState,
  selectedClass: string
): DayReportTx[] =>
  transactions.filter((t) => {
    const classId = t.student?.class?.id || "";
    if (selectedClass && classId !== selectedClass) return false;
    return inSelectedPeriod(t.createdAt, state);
  });
