import { apiGet } from "./http";

export type ClassListFullResponse = {
  message?: string;
  classes?: unknown[];
};

export function fetchClassList() {
  return apiGet<ClassListFullResponse>("/api/class/list", { cache: "no-store" });
}
