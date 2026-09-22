import { useEffect, useState } from "react";
import {
  ageFromDob,
  toDobDateInputValue,
} from "@/lib/dobCalendar";
import { residencySelectValue, type ProfileSidebarProps } from "./profileSidebarHelpers";

export function useProfileSidebarState({
  studentId,
  student,
  fatherName = "",
  fatherPhone = "",
  motherName = "",
  motherPhone = "",
  classId = null,
  classes = [],
  gender = "",
  residencyType = "Day Scholar",
  onSaved,
}: ProfileSidebarProps) {
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [parentModalOpen, setParentModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sName, setSName] = useState(student.name);
  const [sEmail, setSEmail] = useState(student.email);
  const [sPhone, setSPhone] = useState(student.phone);
  const [sAddress, setSAddress] = useState(student.address === "—" ? "" : student.address);
  const [sRoll, setSRoll] = useState(student.rollNo);
  const [sDob, setSDob] = useState(() => toDobDateInputValue(student.dob));
  const [sClassId, setSClassId] = useState(classId ?? "");
  const [sGender, setSGender] = useState(gender);
  const [sResidency, setSResidency] = useState(() => residencySelectValue(residencyType));

  const [pFatherName, setPFatherName] = useState(fatherName);
  const [pFatherPhone, setPFatherPhone] = useState(fatherPhone || student.phone || "");
  const [pMotherName, setPMotherName] = useState(motherName);
  const [pMotherPhone, setPMotherPhone] = useState(motherPhone || "");

  useEffect(() => {
    if (studentModalOpen) return;
    setSName(student.name);
    setSEmail(student.email);
    setSPhone(student.phone);
    setSAddress(student.address === "—" ? "" : student.address);
    setSRoll(student.rollNo);
    setSDob(toDobDateInputValue(student.dob));
    setSClassId(classId ?? "");
    setSGender(gender);
    setSResidency(residencySelectValue(residencyType));
  }, [student, classId, gender, residencyType, studentModalOpen]);

  useEffect(() => {
    if (parentModalOpen) return;
    setPFatherName(fatherName);
    setPFatherPhone(fatherPhone || student.phone || "");
    setPMotherName(motherName);
    setPMotherPhone(motherPhone || "");
  }, [fatherName, fatherPhone, motherName, motherPhone, student.phone, parentModalOpen]);

  const canEdit = Boolean(studentId.trim());

  const openStudentModal = () => {
    setSName(student.name);
    setSEmail(student.email);
    setSPhone(student.phone);
    setSAddress(student.address === "—" ? "" : student.address);
    setSRoll(student.rollNo);
    setSDob(toDobDateInputValue(student.dob));
    setSClassId(classId ?? "");
    setSGender(gender);
    setSResidency(residencySelectValue(residencyType));
    setStudentModalOpen(true);
  };

  const classOptions = [
    { label: "No class", value: "" },
    ...classes.map((c) => ({ label: c.label, value: c.id })),
  ];

  const saveStudent = async () => {
    if (!canEdit) return;
    const name = sName.trim();
    if (name.length < 2) {
      alert("Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          email: sEmail.trim(),
          phoneNo: sPhone.trim(),
          address: sAddress.trim() || null,
          rollNo: sRoll.trim() || null,
          classId: sClassId || null,
          gender: sGender.trim() || null,
          residencyType: residencySelectValue(sResidency),
          dob: sDob.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setStudentModalOpen(false);
      const resolvedClass = classes.find((c) => c.id === sClassId);
      const savedResidency = residencySelectValue(sResidency);
      const savedDob = sDob.trim();
      const nextAge = ageFromDob(savedDob);
      const savedName =
        typeof data.student?.name === "string" && data.student.name.trim()
          ? data.student.name.trim()
          : name;
      onSaved?.({
        name: savedName,
        email: sEmail.trim(),
        phone: sPhone.trim(),
        address: sAddress.trim(),
        rollNo: sRoll.trim(),
        classId: sClassId || null,
        gender: sGender.trim(),
        residencyType: savedResidency,
        dob: savedDob,
        ...(nextAge != null ? { age: String(nextAge) } : {}),
        ...(resolvedClass
          ? {
              classDisplayName: resolvedClass.label,
            }
          : {}),
      });
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const saveParent = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fatherName: pFatherName.trim(),
          motherName: pMotherName.trim() || null,
          phoneNo: pFatherPhone.trim(),
          emergencyMotherNo: pMotherPhone.trim() || "-",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setParentModalOpen(false);
      onSaved?.({
        fatherName: pFatherName.trim(),
        fatherPhone: pFatherPhone.trim(),
        motherName: pMotherName.trim(),
        motherPhone: pMotherPhone.trim(),
      });
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return {
    studentModalOpen,
    setStudentModalOpen,
    parentModalOpen,
    setParentModalOpen,
    saving,
    sName,
    setSName,
    sEmail,
    setSEmail,
    sPhone,
    setSPhone,
    sAddress,
    setSAddress,
    sRoll,
    setSRoll,
    sDob,
    setSDob,
    sClassId,
    setSClassId,
    sGender,
    setSGender,
    sResidency,
    setSResidency,
    pFatherName,
    setPFatherName,
    pFatherPhone,
    setPFatherPhone,
    pMotherName,
    setPMotherName,
    pMotherPhone,
    setPMotherPhone,
    canEdit,
    openStudentModal,
    classOptions,
    saveStudent,
    saveParent,
  };
}
