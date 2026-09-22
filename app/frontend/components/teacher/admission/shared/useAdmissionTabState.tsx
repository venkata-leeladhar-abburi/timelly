import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { studentDetailsFeesUrlForPathname, studentDetailsUrlForPathname } from "../../../schooladmin/fees/studentDetailsNav";
import { formatClassOptionLabel, gradeSoughtFromClassName } from "@/lib/gradeFromClassName";
import type { AdmissionRow, FeeType, FormState } from "./types";
import { defaultForm } from "./constants";
import { normalizeResidencyType } from "./utils";
import { useAdmissionFeeAssign } from "./useAdmissionFeeAssign";
import { useAdmissionReceiptPrinting } from "./useAdmissionReceiptPrinting";
import { useAdmissionTableColumns } from "./useAdmissionTableColumns";

export function useAdmissionTabState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") ?? "add") === "all" ? "all" : "add";
  const editId = searchParams.get("editId");
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const [rows, setRows] = useState<AdmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [paidApplicationsCount, setPaidApplicationsCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [filters, setFilters] = useState<{ gradeSought: string; boardingType: string; from: string; to: string; classId: string }>({
    gradeSought: "",
    boardingType: "",
    from: "",
    to: "",
    classId: "",
  });
  const [listPhase, setListPhase] = useState<"all" | "pending" | "upcoming" | "approved">("all");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const [deleteRow, setDeleteRow] = useState<AdmissionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);

  const { receiptData, receiptRef, printFeeReceipt } = useAdmissionReceiptPrinting();

  const [paymentDialog, setPaymentDialog] = useState<{
    row: AdmissionRow;
    feeType: FeeType;
  } | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    paymentMode: string;
    paymentMethod: string;
    referenceNo: string;
    remarks: string;
  }>({
    paymentMode: "OFFLINE",
    paymentMethod: "CASH",
    referenceNo: "",
    remarks: "",
  });

  const feeAssign = useAdmissionFeeAssign({ classes, pathname, router, setMessageTone, setMessage });

  const buildAdmissionExportQuery = useCallback(
    (format: "xlsx" | "csv" | "print") => {
      const params = new URLSearchParams();
      params.set("format", format);
      if (listPhase !== "all") params.set("phase", listPhase);
      if (search.trim()) params.set("search", search.trim());
      if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
      if (filters.boardingType) params.set("boardingType", filters.boardingType);
      if (filters.classId) params.set("classId", filters.classId);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return params.toString();
    },
    [filters.boardingType, filters.classId, filters.from, filters.gradeSought, filters.to, listPhase, search]
  );

  const exportAdmissions = useCallback(
    (format: "xlsx" | "csv" | "print") => {
      const qs = buildAdmissionExportQuery(format);
      const url = `/api/admissions/export?${qs}`;
      if (format === "print") {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [buildAdmissionExportQuery]
  );

  const goToStudentDetails = useCallback(
    (row: AdmissionRow) => {
      if (!row.studentId) {
        setMessageTone("error");
        setMessage("Approve & enroll this application first to open Student Details.");
        return;
      }
      router.push(studentDetailsUrlForPathname(pathname, row.studentId));
    },
    [pathname, router]
  );

  const openPaymentDialog = (row: AdmissionRow, feeType: FeeType) => {
    setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
    setPaymentDialog({ row, feeType });
  };

  const markFeePaid = async (row: AdmissionRow, feeType: FeeType) => {
    setPaying(true);
    setPaymentError(null);
    try {
      if ((paymentForm.paymentMethod === "UPI" || paymentForm.paymentMethod === "BANK_TRANSFER") && !paymentForm.referenceNo.trim()) {
        throw new Error("Reference number / UTR is required for UPI and Bank Transfer");
      }
      const res = await fetch(`/api/admissions/${row.id}/fee-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeType,
          paymentMode: paymentForm.paymentMode,
          paymentMethod: paymentForm.paymentMethod,
          referenceNo: paymentForm.referenceNo,
          remarks: paymentForm.remarks,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Failed to mark fee as paid");
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                applicationFeePaid:
                  feeType === "APPLICATION"
                    ? true
                    : r.applicationFeePaid ?? false,
                applicationFeePaidAt:
                  feeType === "APPLICATION"
                    ? new Date().toISOString()
                    : r.applicationFeePaidAt ?? null,
                applicationFeePaymentMode:
                  feeType === "APPLICATION"
                    ? paymentForm.paymentMode
                    : r.applicationFeePaymentMode ?? null,
                applicationFeePaymentMethod:
                  feeType === "APPLICATION"
                    ? paymentForm.referenceNo
                      ? `${paymentForm.paymentMethod} | REF:${paymentForm.referenceNo}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                      : `${paymentForm.paymentMethod}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                    : r.applicationFeePaymentMethod ?? null,
                admissionFeePaid:
                  feeType === "ADMISSION" ? true : r.admissionFeePaid ?? false,
                admissionFeePaidAt:
                  feeType === "ADMISSION"
                    ? new Date().toISOString()
                    : r.admissionFeePaidAt ?? null,
                admissionFeePaymentMode:
                  feeType === "ADMISSION"
                    ? paymentForm.paymentMode
                    : r.admissionFeePaymentMode ?? null,
                admissionFeePaymentMethod:
                  feeType === "ADMISSION"
                    ? paymentForm.referenceNo
                      ? `${paymentForm.paymentMethod} | REF:${paymentForm.referenceNo}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                      : `${paymentForm.paymentMethod}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                    : r.admissionFeePaymentMethod ?? null,
                remarks:
                  feeType === "ADMISSION" || feeType === "APPLICATION"
                    ? paymentForm.remarks || null
                    : r.remarks ?? null,
              }
            : r
        )
      );
      setMessageTone("success");
      setMessage(data?.message || "Fee marked as paid");
      setPaymentDialog(null);
      setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Failed to mark fee as paid");
    } finally {
      setPaying(false);
    }
  };

  const patchWorkflow = useCallback(async (row: AdmissionRow, workflowStatus: "PENDING" | "UPCOMING") => {
    setWorkflowBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admissions/${row.id}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workflowStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to update status");
      setMessageTone("success");
      setMessage(data?.message || "Status updated");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setWorkflowBusyId(null);
    }
  }, []);

  const enrollFromRow = useCallback(async (row: AdmissionRow) => {
    setWorkflowBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admissions/${row.id}/enroll`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Enrollment failed");
      const studentId = typeof data?.studentId === "string" ? data.studentId : null;
      setMessageTone("success");
      setMessage(
        studentId
          ? "Student created successfully. Opening student profile…"
          : data?.message || "Student created successfully"
      );
      if (studentId) {
        router.push(studentDetailsFeesUrlForPathname(pathname, studentId));
      } else {
        setReloadKey((k) => k + 1);
      }
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setWorkflowBusyId(null);
    }
  }, [pathname, router]);

  useEffect(() => {
    fetch("/api/class/list?lite=1", { credentials: "include" })
      .then((res) => res.json())
      .then((d) => setClasses(Array.isArray(d?.classes) ? d.classes : []))
      .catch(() => setClasses([]));
  }, []);

  /** Only classes from `/api/class/list` — no hardcoded Grade 1…11 list. */
  const classOptions = useMemo(() => {
    const sorted = [...classes].sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }) ||
        String(a.section ?? "").localeCompare(String(b.section ?? ""), undefined, { numeric: true })
    );
    return [
      { label: "Unassigned", value: "" },
      ...sorted.map((c) => ({
        label: formatClassOptionLabel(c.name, c.section),
        value: c.id,
      })),
    ];
  }, [classes]);

  const onClassIdChange = useCallback(
    (classId: string) => {
      if (!classId) {
        setForm((p) => ({ ...p, classId: "" }));
        return;
      }
      const row = classes.find((c) => c.id === classId);
      setForm((p) => ({
        ...p,
        classId,
        gradeSought: row ? gradeSoughtFromClassName(row.name) : p.gradeSought,
      }));
    },
    [classes]
  );

  const { tableColumns } = useAdmissionTableColumns({
    workflowBusyId,
    setPaymentForm,
    setPaymentDialog,
    printFeeReceipt,
    enrollFromRow,
    warmAssignCatalog: feeAssign.warmAssignCatalog,
    openAssignFeesDialog: feeAssign.openAssignFeesDialog,
    router,
    setDeleteRow,
    goToStudentDetails,
  });


  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("pageSize", "1");
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
    if (filters.boardingType) params.set("boardingType", filters.boardingType);
    if (filters.classId) params.set("classId", filters.classId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    fetch(`/api/admissions/list?${params.toString()}`, { credentials: "include" })
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admissions count");
        setPaidApplicationsCount(Number(d?.paidApplicationsTotal ?? 0));
      })
      .catch(() => setPaidApplicationsCount(0));
  }, [debouncedSearch, filters.gradeSought, filters.boardingType, filters.classId, filters.from, filters.to, reloadKey]);

  useEffect(() => {
    if (view !== "all") return;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (listPhase !== "all") params.set("phase", listPhase);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
    if (filters.boardingType) params.set("boardingType", filters.boardingType);
    if (filters.classId) params.set("classId", filters.classId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    const hadRows = rows.length > 0;
    if (!hadRows) setLoading(true);
    fetch(`/api/admissions/list?${params.toString()}`, { credentials: "include" })
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admissions");
        setRows(Array.isArray(d?.applications) ? d.applications : []);
        const total = Number(d?.total ?? 0);
        setPaidApplicationsCount(Number(d?.paidApplicationsTotal ?? 0));
        const pageSize = Number(d?.pageSize ?? 10);
        const computed = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
        setTotalPages(computed);
        setPage((p) => Math.min(p, computed));
      })
      .catch((e) => {
        setRows([]);
        setPaidApplicationsCount(0);
        setTotalPages(1);
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Failed to load admissions");
      })
      .finally(() => setLoading(false));
  }, [view, page, debouncedSearch, filters.gradeSought, filters.boardingType, filters.classId, filters.from, filters.to, listPhase, reloadKey, rows.length]);

  useEffect(() => {
    if (view !== "add" || !editId) return;
    let active = true;
    setMessage(null);
    fetch(`/api/admissions/${editId}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admission");
        const a = d?.application;
        if (!a || !active) return;
        setForm({
          applicationNo: a.applicationNo ?? "",
          fedenaNo: a.fedenaNo ?? "",
          penNumber: (a as any).penNumber ?? "",
          apaarId: (a as any).apaarId ?? "",
          admissionNo: a.admissionNo ?? "",
          classId: a.classId ?? "",
          gradeSought: a.gradeSought,
          boardingType: a.boardingType,
          residencyType: normalizeResidencyType(a.residencyType),
          applicationFee:
            a.applicationFee === null || a.applicationFee === undefined ? "" : String(a.applicationFee),
          admissionFee: a.admissionFee === null || a.admissionFee === undefined ? "" : String(a.admissionFee),
          studentName: [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" "),
          gender: a.gender,
          dateOfBirth: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : "",
          aadharNo: a.aadharNo ?? "",
          firstLanguage: a.firstLanguage ?? "",
          nationality: a.nationality ?? "Indian",
          languagesAtHome: a.languagesAtHome ?? "",
          caste: a.caste ?? "",
          religion: a.religion ?? "",
          presentAddress: a.houseNo ?? "",
          permanentAddress: a.street ?? "",
          parentName: a.parentName ?? "",
          parentOccupation: a.parentOccupation ?? "",
          officeAddress: a.officeAddress ?? "",
          parentPhone: a.parentPhone ?? "",
          parentEmail: a.parentEmail ?? "",
          parentAadharNo: a.parentAadharNo ?? "",
          parentWhatsapp: a.parentWhatsapp ?? "",
          bankAccountNo: a.bankAccountNo ?? "",
          motherName: (a as any).motherName ?? "",
          // Mother phone is stored on the application as `emergencyMotherNo` (same as student profile).
          motherPhone: (() => {
            const em = String((a as { emergencyMotherNo?: string | null }).emergencyMotherNo ?? "").trim();
            if (em && em !== "-") return em;
            return "";
          })(),
          motherAadharNo: (a as any).motherAadharNo ?? "",
          motherEmail: (a as any).motherEmail ?? "",
          panNumber: (a as any).panNumber ?? "",
          previousSchoolName: a.previousSchoolName ?? "",
          previousSchoolAddress: a.previousSchoolAddress ?? "",
          emergencyFatherNo: a.emergencyFatherNo ?? "",
          emergencyMotherNo: a.emergencyMotherNo ?? "",
          emergencyGuardianNo: a.emergencyGuardianNo ?? "",
        });
      })
      .catch((e) => {
        if (!active) return;
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Failed to load admission");
      });
    return () => {
      active = false;
    };
  }, [view, editId]);

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admissions/${deleteRow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.message || "Failed to delete admission");
      setDeleteRow(null);
      setMessageTone("success");
      setMessage("Admission deleted successfully.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Failed to delete admission");
    } finally {
      setDeleting(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const aadharDigits = form.aadharNo.replace(/\D/g, "");
      const derivedParentAadhar =
        aadharDigits.length >= 8 ? `${aadharDigits.slice(0, 8)}0000` : `${aadharDigits.padEnd(8, "0")}0000`;
      const nameParts = form.studentName.trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] ?? "";
      const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : null;
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ".";
      const payload: any = {
        ...form,
        firstName,
        middleName,
        lastName,
        /** Explicit so mother name always reaches API (profile reads synced `Student.motherName` on save). */
        motherName: form.motherName?.trim() ? form.motherName.trim() : null,
        classId: form.classId || null,
        applicationFee: form.applicationFee.trim() ? Number(form.applicationFee) : null,
        admissionFee: form.admissionFee.trim() ? Number(form.admissionFee) : null,
        fedenaNo: form.fedenaNo || null,
        penNumber: form.penNumber?.trim() || null,
        apaarId: form.apaarId?.trim() || null,
        admissionNo: editId ? form.admissionNo?.trim() || null : null,
        caste: form.caste || null,
        religion: form.religion || null,
        houseNo: form.presentAddress.trim(),
        street: form.permanentAddress.trim(),
        city: form.presentAddress.trim() || "-",
        town: null,
        state: "-",
        pinCode: "000000",
        applicationNo: form.applicationNo.trim(),
        firstLanguage: form.firstLanguage?.trim() || "English",
        parentAadharNo: form.parentAadharNo?.trim() || derivedParentAadhar,
        previousSchoolName: form.previousSchoolName?.trim() || "-",
        previousSchoolAddress: form.previousSchoolAddress?.trim() || "-",
        residencyType: normalizeResidencyType(form.residencyType),
        emergencyFatherNo: form.parentPhone?.trim() || "-",
        emergencyMotherNo: form.motherPhone?.trim() || "-",
        emergencyGuardianNo: form.parentPhone?.trim() || "-",
      };
      const endpoint = editId ? `/api/admissions/${editId}` : "/api/admissions/create";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Failed to ${editId ? "update" : "save"} admission`);

      setMessageTone("success");
      if (editId) {
        setMessage("Admission updated successfully.");
      } else {
        setMessage(`Saved. Application No: ${data?.application?.applicationNo ?? "APP"}`);
        setForm(defaultForm());
      }
    } catch (e) {
      setMessageTone("error");
      const msg = e instanceof Error ? e.message : `Failed to ${editId ? "update" : "save"} admission`;
      setMessage(msg);
      throw new Error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveClick = async () => {
    try {
      await submit();
      router.push("?tab=admission&view=all");
    } catch {
      // Error message already set on the form; do not leave edit view on failed save.
    }
  };

  return {
    router,
    view,
    editId,
    form,
    setForm,
    submitting,
    message,
    messageTone,
    classes,
    classOptions,
    onClassIdChange,
    handleSaveClick,
    search,
    setSearch,
    filters,
    setFilters,
    showExportMenu,
    setShowExportMenu,
    exportAdmissions,
    listPhase,
    setListPhase,
    setPage,
    tableColumns,
    rows,
    loading,
    page,
    totalPages,
    paidApplicationsCount,
    goToStudentDetails,
    workflowBusyId,
    enrollFromRow,
    openPaymentDialog,
    setDeleteRow,
    deleteRow,
    deleting,
    confirmDelete,
    paymentDialog,
    setPaymentDialog,
    paymentForm,
    setPaymentForm,
    paymentError,
    paying,
    markFeePaid,
    printFeeReceipt,
    receiptData,
    receiptRef,
    feeAssign,
    patchWorkflow,
  };
}
