import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";

import { NotificationsClient } from "./NotificationsClient";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <NotificationsClient />
      </main>
    </SiteChrome>
  );
}
