import { z } from "zod";
import { apiPost, validateApiResponse } from "./http";

export const ToggleNewsfeedLikeResponseSchema = z.object({
  message: z.string().optional(),
  liked: z.boolean().optional(),
  likes: z.number().optional(),
});
export type ToggleNewsfeedLikeResponse = z.infer<typeof ToggleNewsfeedLikeResponseSchema>;

export async function toggleNewsfeedLike(feedId: string) {
  const result = await apiPost<ToggleNewsfeedLikeResponse>(`/api/newsfeed/${feedId}/like`);
  return {
    ...result,
    data: validateApiResponse(ToggleNewsfeedLikeResponseSchema, result.data, "toggleNewsfeedLike"),
  };
}
