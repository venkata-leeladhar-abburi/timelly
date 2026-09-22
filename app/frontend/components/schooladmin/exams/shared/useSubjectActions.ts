import { useState } from "react";
import { writeExamsCache, type ExamsCacheSnapshot } from "./examsCacheHelpers";

export function useSubjectActions(getSnapshot: () => ExamsCacheSnapshot) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [newSubject, setNewSubject] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editingSubjectValue, setEditingSubjectValue] = useState("");

  const updateCache = (next: string[]) =>
    writeExamsCache(getSnapshot(), { subjects: next });

  const deleteSubject = async (name: string) => {
    const upperName = name.trim().toUpperCase();
    if (!upperName) return;

    const confirmed = window.confirm(
      `Remove "${upperName}" from the subjects list?\n\nExisting marks are not deleted.`
    );
    if (!confirmed) return;

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch(`/api/exam-subjects?name=${encodeURIComponent(upperName)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSubjectError(
          data?.message || "Failed to delete subject."
        );
        return;
      }

      const next = subjects.filter((subject) => subject.toUpperCase() !== upperName);
      setSubjects(next);
      updateCache(next);
      if (editingSubject === upperName) {
        setEditingSubject(null);
        setEditingSubjectValue("");
      }
    } catch (e) {
      console.error("Failed to delete subject", e);
      setSubjectError("Failed to delete subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const renameSubject = async (from: string) => {
    const fromName = from.trim().toUpperCase();
    const toName = editingSubjectValue.trim().toUpperCase();
    if (!fromName || !toName) {
      setSubjectError("Enter a subject name");
      return;
    }
    if (fromName === toName) {
      setEditingSubject(null);
      setEditingSubjectValue("");
      return;
    }
    if (subjects.some((s) => s.toUpperCase() === toName && s.toUpperCase() !== fromName)) {
      setSubjectError("This subject name already exists");
      return;
    }

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/exam-subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ from: fromName, to: toName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to rename subject");
        return;
      }
      const next = Array.from(
        new Set(subjects.map((s) => (s.toUpperCase() === fromName ? toName : s)))
      ).sort();
      setSubjects(next);
      updateCache(next);
      setEditingSubject(null);
      setEditingSubjectValue("");
    } catch (e) {
      console.error("Failed to rename subject", e);
      setSubjectError("Failed to rename subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const addSubject = async () => {
    const name = newSubject.trim().toUpperCase();
    if (!name) {
      setSubjectError("Enter subject name");
      return;
    }
    if (subjects.some((t) => t.toUpperCase() === name)) {
      setSubjectError("This subject name already exists");
      return;
    }

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/exam-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setSubjectError("This subject name already exists");
        return;
      }
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to add subject");
        return;
      }
      setNewSubject("");
      const next = Array.from(new Set([...subjects, name])).sort();
      setSubjects(next);
      updateCache(next);
    } catch (e) {
      console.error("Failed to add subject", e);
      setSubjectError("Failed to add subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  return {
    subjects,
    setSubjects,
    subjectsLoading,
    setSubjectsLoading,
    newSubject,
    setNewSubject,
    subjectError,
    setSubjectError,
    subjectSaving,
    editingSubject,
    setEditingSubject,
    editingSubjectValue,
    setEditingSubjectValue,
    deleteSubject,
    renameSubject,
    addSubject,
  };
}
