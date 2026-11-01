import { redirect } from "next/navigation";

/** Legacy path — Next was 404ing /portal/users in some caches; keep redirect. */
export default function PortalUsersRedirectPage() {
  redirect("/portal/company-users");
}
