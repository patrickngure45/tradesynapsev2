import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function P2PPage() {
  redirect("/v2/p2p");
}
