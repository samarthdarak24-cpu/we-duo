import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /admin is the portal root; the review queue is its working dashboard. */
export default function AdminIndexPage() {
  redirect("/admin/queue");
}
