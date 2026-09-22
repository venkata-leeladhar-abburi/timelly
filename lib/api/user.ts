import { z } from "zod";
import { apiDelete, apiRequest, validateApiResponse } from "./http";

export const DeleteUserResponseSchema = z.object({
  message: z.string().optional(),
});
export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;

export async function deleteUser(id: string) {
  const result = await apiDelete<DeleteUserResponse>(`/api/user/${id}`);
  return {
    ...result,
    data: validateApiResponse(DeleteUserResponseSchema, result.data, "deleteUser"),
  };
}

export type BulkImportUsersResponse = {
  message?: string;
  successful?: number;
  failed?: number;
  errors?: string[];
};

/**
 * Multipart file upload — apiPost forces a JSON content-type header, which
 * would break the browser's multipart boundary, so this goes through
 * apiRequest directly and lets fetch set the header from the FormData body.
 */
export function bulkImportUsers(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<BulkImportUsersResponse>("/api/user/bulk-import", {
    method: "POST",
    body: formData,
  });
}
