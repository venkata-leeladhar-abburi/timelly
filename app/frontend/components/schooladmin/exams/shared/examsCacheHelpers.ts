import { setExamsPageCache } from "@/lib/school/loadSchoolAdminFastTabs";
import type { ExamTypeOption } from "@/lib/exams/examTypes";
import type { ClassData, TermData } from "./types";

export type ExamsCacheSnapshot = {
  terms: TermData[];
  classes: ClassData[];
  examTypes: ExamTypeOption[];
  subjects: string[];
};

export function writeExamsCache(
  snapshot: ExamsCacheSnapshot,
  partial: Partial<ExamsCacheSnapshot>
) {
  setExamsPageCache({
    terms: partial.terms ?? snapshot.terms,
    classes: partial.classes ?? snapshot.classes,
    examTypes: partial.examTypes ?? snapshot.examTypes,
    subjects: partial.subjects ?? snapshot.subjects,
  });
}
