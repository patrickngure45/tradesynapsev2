import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { getPublicBaseUrl, getPublicBaseUrlOrigin } from "@/lib/seo/publicBaseUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0e14",
};

const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME ?? "Coinwaka").trim() || "Coinwaka";
const BRAND_TAGLINE =
  (process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Wallet + P2P Settlement").trim() || "Wallet + P2P Settlement";
const BASE_URL = getPublicBaseUrl();
const BASE_ORIGIN = getPublicBaseUrlOrigin();
const DEFAULT_TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: BASE_URL,
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${BRAND_NAME}`,
  },
  description:
    "Wallet rails and P2P escrow settlement with transparent, predictable flows.",
  keywords: [
    "USDT",
    "BNB",
    "p2p trading",
    "crypto wallet",
    "withdrawals",
    "deposits",
  ],
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    url: BASE_ORIGIN,
    title: DEFAULT_TITLE,
    description:
      "Wallet rails and P2P escrow settlement with transparent, predictable flows.",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: "Wallet rails and P2P escrow settlement.",
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "").trim() || undefined,
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND_NAME,
      url: BASE_ORIGIN,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND_NAME,
      url: BASE_ORIGIN,
    },
  ];

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("ts-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.setAttribute("data-theme","dark");else if(t==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}})()`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
