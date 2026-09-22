import { z } from "zod";
import { apiDelete, apiPut, validateApiResponse } from "./http";

export const ClassMutationResponseSchema = z.object({
  message: z.string().optional(),
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      section: z.string(),
      teacherId: z.string().nullable().optional(),
      teacher: z.object({ name: z.string().nullable().optional(), email: z.string().nullable().optional() }).nullable().optional(),
    })
    .passthrough()
    .optional(),
});
export type ClassMutationResponse = z.infer<typeof ClassMutationResponseSchema>;

export async function deleteClass(id: string) {
  const result = await apiDelete<ClassMutationResponse>(`/api/class/${id}`);
  return {
    ...result,
    data: validateApiResponse(ClassMutationResponseSchema, result.data, "deleteClass"),
  };
}

export async function updateClass(
  id: string,
  payload: { name: string; section: string; teacherId?: string }
) {
  const result = await apiPut<ClassMutationResponse>(`/api/class/${id}`, payload);
  return {
    ...result,
    data: validateApiResponse(ClassMutationResponseSchema, result.data, "updateClass"),
  };
}
