import { z } from "zod";
import { apiDelete, validateApiResponse } from "./http";

export const DeleteEventResponseSchema = z.object({
  message: z.string().optional(),
});
export type DeleteEventResponse = z.infer<typeof DeleteEventResponseSchema>;

export async function deleteEvent(id: string) {
  const result = await apiDelete<DeleteEventResponse>(`/api/events/${id}`);
  return {
    ...result,
    data: validateApiResponse(DeleteEventResponseSchema, result.data, "deleteEvent"),
  };
}
