import { apiDelete } from "./http";

export type DeleteEventResponse = {
  message?: string;
};

export function deleteEvent(id: string) {
  return apiDelete<DeleteEventResponse>(`/api/events/${id}`);
}
