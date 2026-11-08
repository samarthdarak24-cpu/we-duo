import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Dispute review lives in the queue's Disputes tab; keep the direct URL working. */
export default function AdminDisputesPage() {
  redirect("/admin/queue#disputes");
}
