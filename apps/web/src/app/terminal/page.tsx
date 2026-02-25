import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TerminalPage() {
  redirect("/v2/trade");
}
