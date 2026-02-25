import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function WithdrawPage() {
  redirect("/v2/wallet");
}
