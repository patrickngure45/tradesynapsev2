import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OrderHistoryPage() {
  redirect("/v2/orders");
}
