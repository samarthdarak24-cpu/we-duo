import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Listings review lives in the queue's Listings tab; keep the direct URL working. */
export default function AdminListingsPage() {
  redirect("/admin/queue#listings");
}
