import { z } from "zod";
import { apiDelete, validateApiResponse } from "./http";

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
