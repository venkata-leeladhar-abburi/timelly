import { apiDelete, apiPut, apiRequest } from "./http";

export type BulkUploadResponse = {
  updatedClasses?: number;
  updated?: Array<{ label: string; components: number }>;
  failed?: Array<{ row: number; message: string }>;
  message?: string;
};

export type SaveFeeStructureResponse = {
  message?: string;
};

export function uploadFeeStructureBulk(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  // Multipart body — no Content-Type header, the browser sets the boundary.
  return apiRequest<BulkUploadResponse>("/api/fees/structure/bulk", {
    method: "POST",
    body: fd,
  });
}

export function saveFeeStructure(classId: string, components: Array<{ name: string; amount: number }>) {
  return apiPut<SaveFeeStructureResponse>("/api/fees/structure", { classId, components });
}

export function deleteFeeStructure(classId: string) {
  return apiDelete<SaveFeeStructureResponse>(`/api/fees/structure?classId=${encodeURIComponent(classId)}`);
}
