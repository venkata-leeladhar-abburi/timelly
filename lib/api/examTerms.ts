import { apiGet } from "./http";

// The route can respond with either a bare array or { terms: [...] } — this
// stays untyped/passthrough here to preserve that existing (if inconsistent)
// behavior rather than silently picking one shape to enforce.
export type ExamTermsResponse = unknown;

export function fetchExamTerms() {
  return apiGet<ExamTermsResponse>("/api/exams/terms");
}
