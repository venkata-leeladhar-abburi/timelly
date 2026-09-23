import RequireRole from "@/app/frontend/auth/RequiredRoles";
import WorkshopsAndEventsTab from "@/app/frontend/components/schooladmin/workshopsandevents";

export default function EventsPages() {
  return (
    <RequireRole allowedRoles={["TEACHER", "SCHOOLADMIN"]}>
      <WorkshopsAndEventsTab />
    </RequireRole>
  );
}
