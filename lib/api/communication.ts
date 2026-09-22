import { z } from "zod";
import { apiGet, apiPost, validateApiResponse } from "./http";

const AppointmentSchema = z.object({}).passthrough();

export const AppointmentsResponseSchema = z.object({
  message: z.string().optional(),
  appointments: z.array(AppointmentSchema).optional(),
});
export type AppointmentsResponse = z.infer<typeof AppointmentsResponseSchema>;

export type AppointmentActionResponse = {
  message?: string;
};

export async function fetchAppointments() {
  const result = await apiGet<AppointmentsResponse>("/api/communication/appointments");
  return {
    ...result,
    data: validateApiResponse(AppointmentsResponseSchema, result.data, "fetchAppointments"),
  };
}

export function createAppointment(payload: { teacherId: string; note?: string }) {
  return apiPost<AppointmentActionResponse>("/api/communication/appointments", payload);
}

export function approveAppointment(id: string) {
  return apiPost<AppointmentActionResponse>(`/api/communication/appointments/${id}/approve`);
}
