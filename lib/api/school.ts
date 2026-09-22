import { apiGet } from "./http";

export type SchoolMineResponse = {
  school?: {
    name?: string | null;
    logoUrl?: string | null;
    address?: string | null;
    location?: string | null;
    affiliationLine?: string | null;
    admins?: Array<{ photoUrl?: string | null }>;
  };
};

export function fetchMySchool() {
  return apiGet<SchoolMineResponse>("/api/school/mine", { cache: "no-store" });
}
