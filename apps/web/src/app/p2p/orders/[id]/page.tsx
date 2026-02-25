import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function P2POrderRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/v2/p2p/orders/${encodeURIComponent(params.id)}`);
}
