"use client";

import Link from "next/link";

import { v2ButtonClassName } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";

export function WalletClient() {
	return (
		<main className="space-y-4">
			<V2Card>
				<V2CardHeader title="Wallet" subtitle="Custody and funding actions" />
				<V2CardBody>
					<p className="text-sm text-[var(--v2-muted)]">
						Wallet operations are available through the account and trading rails while the dedicated wallet panel is being finalized.
					</p>
					<div className="mt-4 grid grid-cols-2 gap-2">
						<Link href="/v2/account" className={v2ButtonClassName({ variant: "secondary", fullWidth: true })}>
							Account
						</Link>
						<Link href="/v2/convert" className={v2ButtonClassName({ variant: "primary", fullWidth: true })}>
							Convert
						</Link>
						<Link href="/v2/markets" className={v2ButtonClassName({ variant: "secondary", fullWidth: true })}>
							Markets
						</Link>
						<Link href="/v2/p2p" className={v2ButtonClassName({ variant: "secondary", fullWidth: true })}>
							P2P
						</Link>
					</div>
				</V2CardBody>
			</V2Card>
		</main>
	);
}
