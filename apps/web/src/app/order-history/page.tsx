import { SiteChrome } from "@/components/SiteChrome";
import { OrderHistoryClient } from "./OrderHistoryClient";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata = { title: `Order History — ${BRAND_NAME}` };

export default function OrderHistoryPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Order History</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            All orders with fill details
          </p>
        </div>
        <OrderHistoryClient />
      </div>
    </SiteChrome>
  );
}
